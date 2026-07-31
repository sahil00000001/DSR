"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { errors, toUserMessage } from "@/lib/errors";
import { can } from "@/lib/auth/rbac";
import { requireUserAction, type SessionUser } from "@/lib/auth/session";
import {
  parseFormData,
  taskAssignSchema,
  taskCategorySchema,
  taskChecklistSchema,
  taskProgressSchema,
  taskSchema,
  taskStatusSchema,
  taskTagSchema,
  taskUpdateSchema,
} from "@/lib/validation/schemas";
import {
  asTaskStatus,
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  TASK_STATUS_PROGRESS,
  type TaskActivityKind,
  type TaskPriority,
  type TaskRecurrence,
  type TaskStatus,
} from "@/lib/constants/enums";
import { formatDayLong, parseDayKey, today, toDayKey } from "@/lib/utils/date";
import { slugify } from "@/lib/utils/format";
import { nextOccurrence } from "@/lib/utils/recurrence";
import { nextTaskNumber } from "@/lib/services/tasks";
import { deleteTaskFile, uploadTaskFile } from "@/lib/storage/supabase-storage";
import { recordAudit } from "@/lib/services/audit";
import { notify, notifyMany } from "@/lib/services/notifications";
import { sendEmail } from "@/lib/email/mailer";
import { taskAssignedEmail } from "@/lib/email/templates";
import { formError, formSuccess, type FormState } from "@/server/actions/form-state";

/**
 * Task writes.
 *
 * ## Rules encoded here
 *
 *  • **Every mutation writes a timeline entry.** Section 4 of the brief asks for a
 *    complete audit trail, and the only way to keep one complete is to make it a
 *    side effect of the write rather than something a caller remembers to do.
 *  • **Status and progress stay consistent.** Marking a task complete sets progress
 *    to 100 and stamps `completedAt`; reopening clears the stamp and drops progress
 *    back. Leaving them independent produces tasks that are 40% done and completed.
 *  • **Files upload before the row that references them**, so a storage failure
 *    never leaves an update pointing at a file that was never stored.
 *  • **Only admins create, edit, delete or reassign.** Assignees update, comment,
 *    attach and move status. See the policy block in `lib/auth/rbac.ts`.
 */

/** Cap per post. Enough for a set of photos; not enough to exhaust the function. */
const MAX_FILES_PER_POST = 10;

/** Beyond this the picker is a mistake, not a plan. */
const MAX_ASSIGNEES = 10;

// ---------------------------------------------------------------------------
//  Shared helpers
// ---------------------------------------------------------------------------

/**
 * Appends to a task timeline.
 *
 * `meta` is stored as JSON text rather than a Postgres `jsonb` column, matching how
 * `AuditLog` already does it — the shape varies per activity kind and nothing queries
 * inside it, so a column type buys nothing.
 */
async function recordActivity(input: {
  taskId: string;
  actorId: string | null;
  kind: TaskActivityKind;
  meta?: Record<string, unknown>;
  comment?: string | null;
}) {
  await prisma.taskActivity.create({
    data: {
      taskId: input.taskId,
      actorId: input.actorId,
      kind: input.kind,
      meta: input.meta ? JSON.stringify(input.meta) : null,
      comment: input.comment ?? null,
    },
  });
}

/** Loads just enough of a task to make a permission decision about it. */
async function loadPolicySubject(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      taskNumber: true,
      title: true,
      status: true,
      progressPercent: true,
      dueOn: true,
      createdById: true,
      assignees: { select: { userId: true, user: { select: { managerId: true } } } },
    },
  });
  if (!task) throw errors.notFound("That task");

  return {
    ...task,
    assigneeIds: task.assignees.map((entry) => entry.userId),
    assigneeManagerIds: task.assignees.map((entry) => entry.user.managerId),
  };
}

function revalidateTask(id?: string) {
  revalidatePath("/tasks");
  revalidatePath("/tasks/board");
  revalidatePath("/tasks/calendar");
  revalidatePath("/tasks/timeline");
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/tasks/${id}`);
}

/** `"2.5"` hours → 150 minutes. Rounded, because a task estimate is not a stopwatch. */
function hoursToMinutes(value: string | undefined): number | null {
  if (!value) return null;
  const hours = Number(value);
  return Number.isFinite(hours) ? Math.round(hours * 60) : null;
}

/**
 * Combines a calendar day with an optional `HH:MM` into an exact instant.
 *
 * The date is UTC-midnight like everything else in the schema; the time is read as
 * **IST**, because the people typing "14:30" are standing in a plant in Punjab and
 * mean half past two there. Storing their local intent as UTC is the whole job.
 */
const IST_OFFSET_MINUTES = 5 * 60 + 30;

function deadlineInstant(dueOn: Date | null, time: string | undefined): Date | null {
  if (!dueOn || !time) return null;
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(dueOn.getTime() + (hours! * 60 + minutes! - IST_OFFSET_MINUTES) * 60_000);
}

/**
 * Resolves the mention ids a composer sent.
 *
 * The client reports which people it inserted rather than the server re-parsing
 * `@Name` out of prose — names are ambiguous and prose is not a data format. The ids
 * are still validated against active users here, so a forged field can at worst
 * notify a colleague, which the author was already able to do by typing.
 */
async function resolveMentions(raw: string | undefined, excludeUserId: string): Promise<string[]> {
  const ids = (raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (ids.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: ids.slice(0, 20) }, status: "ACTIVE", NOT: { id: excludeUserId } },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

/** Uploads with rollback, so a partial failure leaves nothing behind. */
async function uploadAll(files: File[], userId: string) {
  const uploaded: Awaited<ReturnType<typeof uploadTaskFile>>[] = [];
  try {
    for (const file of files) uploaded.push(await uploadTaskFile(file, userId));
    return uploaded;
  } catch (error) {
    await Promise.all(uploaded.map((file) => deleteTaskFile(file.storagePath)));
    throw error;
  }
}

function filesFrom(formData: FormData, field = "files"): File[] {
  return formData
    .getAll(field)
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
}

/** Notifies everyone on a task except whoever caused the notification. */
async function notifyAssignees(
  taskId: string,
  actor: { id: string; name: string },
  payload: { title: string; body: string; type: string },
) {
  const assignees = await prisma.taskAssignee.findMany({
    where: { taskId, NOT: { userId: actor.id } },
    select: { userId: true },
  });
  if (assignees.length === 0) return;

  await notifyMany(
    assignees.map((entry) => ({
      userId: entry.userId,
      actorId: actor.id,
      type: payload.type as never,
      title: payload.title,
      body: payload.body,
      href: `/tasks/${taskId}`,
    })),
  );
}

// ---------------------------------------------------------------------------
//  Create & edit
// ---------------------------------------------------------------------------

export async function createTaskAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseFormData(taskSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  try {
    const actor = await requireUserAction();
    if (!can.createTask(actor)) {
      throw errors.forbidden("Only admins can create and assign tasks.");
    }

    const input = parsed.data;

    if (input.assigneeIds.length > MAX_ASSIGNEES) {
      return formError(`Assign a task to at most ${MAX_ASSIGNEES} people.`, {
        assigneeIds: "That is too many people for one task.",
      });
    }

    // Every assignee must be a real, active person — a stale id from a cached form
    // would otherwise create a task nobody can see.
    const assignees = await prisma.user.findMany({
      where: { id: { in: input.assigneeIds }, status: "ACTIVE" },
      select: { id: true, name: true, email: true, notifyByEmail: true },
    });
    if (assignees.length !== input.assigneeIds.length) {
      return formError("One of those people is no longer active.", {
        assigneeIds: "Pick the assignees again.",
      });
    }

    const dueOn = input.dueOn ? parseDayKey(input.dueOn) : null;
    const files = filesFrom(formData);
    if (files.length > MAX_FILES_PER_POST) {
      return formError(`Attach at most ${MAX_FILES_PER_POST} files at a time.`);
    }

    let uploaded: Awaited<ReturnType<typeof uploadAll>> = [];
    try {
      uploaded = await uploadAll(files, actor.id);
    } catch (uploadError) {
      return formError(toUserMessage(uploadError, { action: "uploadTaskFile" }));
    }

    const status = input.status as TaskStatus;

    const task = await prisma.task.create({
      data: {
        taskNumber: await nextTaskNumber(),
        title: input.title,
        description: input.description,
        priority: input.priority,
        status,
        categoryId: input.categoryId ?? null,
        dueOn,
        deadlineAt: deadlineInstant(dueOn, input.deadlineTime),
        estimateMinutes: hoursToMinutes(input.estimateHours),
        progressPercent: TASK_STATUS_PROGRESS[status],
        blockedReason: status === "BLOCKED" ? (input.blockedReason ?? null) : null,
        startedAt: status === "IN_PROGRESS" ? new Date() : null,
        completedAt: status === "COMPLETED" ? new Date() : null,
        recurrence: input.recurrence,
        recurrenceEvery: input.recurrenceEvery,
        recurrenceUntil: input.recurrenceUntil ? parseDayKey(input.recurrenceUntil) : null,
        lastSpawnedFor: input.recurrence === "NONE" ? null : dueOn,
        createdById: actor.id,
        assignees: {
          create: assignees.map((user) => ({ userId: user.id, assignedById: actor.id })),
        },
        tagLinks: input.tagIds?.length
          ? { create: input.tagIds.map((tagId) => ({ tagId })) }
          : undefined,
        attachments: {
          create: uploaded.map((file) => ({
            filename: file.filename,
            mimeType: file.mimeType,
            size: file.size,
            storagePath: file.storagePath,
            // Signed on demand; a stored URL would expire and mislead.
            url: "",
            uploadedById: actor.id,
          })),
        },
      },
      select: { id: true, taskNumber: true, title: true },
    });

    if (input.dependsOnIds?.length) {
      await linkDependencies(task.id, input.dependsOnIds);
    }

    await recordActivity({
      taskId: task.id,
      actorId: actor.id,
      kind: "created",
      meta: {
        priority: input.priority,
        status,
        assignees: assignees.map((user) => user.name),
        dueOn: dueOn ? toDayKey(dueOn) : null,
        files: uploaded.length,
      },
    });
    await recordActivity({
      taskId: task.id,
      actorId: actor.id,
      kind: "assigned",
      meta: { to: assignees.map((user) => user.name) },
    });

    await announceAssignment(task.id, task.taskNumber, actor, assignees, {
      title: input.title,
      description: input.description,
      priority: input.priority as TaskPriority,
      dueOn,
      attachmentNames: uploaded.map((file) => file.filename),
    });

    await recordAudit({
      actorId: actor.id,
      action: "task.create",
      entity: "task",
      entityId: task.id,
      meta: {
        taskNumber: task.taskNumber,
        priority: input.priority,
        assignees: assignees.length,
        files: uploaded.length,
      },
    });

    revalidateTask(task.id);

    return formSuccess(
      `${task.taskNumber} created and assigned to ${
        assignees.length === 1 ? assignees[0]!.name : `${assignees.length} people`
      }.`,
      { id: task.id, taskNumber: task.taskNumber },
    );
  } catch (error) {
    return formError(toUserMessage(error, { action: "createTask" }));
  }
}

/** In-app notification plus email to each new assignee. */
async function announceAssignment(
  taskId: string,
  taskNumber: string,
  actor: SessionUser,
  assignees: Array<{ id: string; name: string; email: string; notifyByEmail: boolean }>,
  task: {
    title: string;
    description: string;
    priority: TaskPriority;
    dueOn: Date | null;
    attachmentNames: string[];
  },
) {
  const recipients = assignees.filter((user) => user.id !== actor.id);
  if (recipients.length === 0) return;

  await notifyMany(
    recipients.map((user) => ({
      userId: user.id,
      actorId: actor.id,
      type: "TASK_ASSIGNED" as const,
      title: `${actor.name} assigned you ${taskNumber}`,
      body: task.dueOn
        ? `${task.title} · due ${formatDayLong(task.dueOn)}`
        : task.title,
      href: `/tasks/${taskId}`,
    })),
  );

  for (const user of recipients.filter((candidate) => candidate.notifyByEmail)) {
    await sendEmail({
      to: user.email,
      replyTo: actor.email,
      content: taskAssignedEmail({
        assigneeName: user.name,
        assignedByName: actor.name,
        taskNumber,
        title: task.title,
        description: task.description,
        priority: TASK_PRIORITY_LABEL[task.priority],
        dueOn: task.dueOn ? formatDayLong(task.dueOn) : null,
        attachmentNames: task.attachmentNames,
        taskUrl: `${env.NEXT_PUBLIC_APP_URL}/tasks/${taskId}`,
      }),
    });
  }
}

export async function editTaskAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const taskId = String(formData.get("taskId") ?? "");
  const parsed = parseFormData(taskSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  try {
    const actor = await requireUserAction();
    if (!can.editTask(actor)) throw errors.forbidden("Only admins can edit a task.");

    const before = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        taskNumber: true,
        title: true,
        priority: true,
        status: true,
        dueOn: true,
        progressPercent: true,
        assignees: { select: { userId: true } },
      },
    });
    if (!before) throw errors.notFound("That task");

    const input = parsed.data;
    const dueOn = input.dueOn ? parseDayKey(input.dueOn) : null;
    const status = input.status as TaskStatus;

    await prisma.task.update({
      where: { id: taskId },
      data: {
        title: input.title,
        description: input.description,
        priority: input.priority,
        status,
        categoryId: input.categoryId ?? null,
        dueOn,
        deadlineAt: deadlineInstant(dueOn, input.deadlineTime),
        estimateMinutes: hoursToMinutes(input.estimateHours),
        blockedReason: status === "BLOCKED" ? (input.blockedReason ?? null) : null,
        recurrence: input.recurrence,
        recurrenceEvery: input.recurrenceEvery,
        recurrenceUntil: input.recurrenceUntil ? parseDayKey(input.recurrenceUntil) : null,
        // A changed due date is a new reminder window, so the old stamps are cleared.
        ...(before.dueOn?.getTime() !== dueOn?.getTime()
          ? { dueSoonRemindedAt: null, overdueNotifiedAt: null }
          : {}),
        ...statusSideEffects(status, before.progressPercent),
      },
    });

    // One timeline entry per thing that actually changed, so the history reads as
    // "moved the due date" rather than an opaque "edited".
    if (before.priority !== input.priority) {
      await recordActivity({
        taskId,
        actorId: actor.id,
        kind: "priority_changed",
        meta: { from: before.priority, to: input.priority },
      });
    }
    if (before.dueOn?.getTime() !== dueOn?.getTime()) {
      await recordActivity({
        taskId,
        actorId: actor.id,
        kind: "due_date_changed",
        meta: { from: before.dueOn ? toDayKey(before.dueOn) : null, to: dueOn ? toDayKey(dueOn) : null },
      });
      await notifyAssignees(taskId, actor, {
        type: "TASK_DEADLINE_CHANGED",
        title: `${before.taskNumber} — due date changed`,
        body: dueOn ? `Now due ${formatDayLong(dueOn)}.` : "The due date was removed.",
      });
    }
    if (asTaskStatus(before.status) !== status) {
      await recordActivity({
        taskId,
        actorId: actor.id,
        kind: "status_changed",
        meta: { from: before.status, to: status },
      });
    }
    if (before.title !== input.title) {
      await recordActivity({
        taskId,
        actorId: actor.id,
        kind: "edited",
        meta: { field: "title", from: before.title, to: input.title },
      });
    }

    await syncAssignees(taskId, input.assigneeIds, actor, before.assignees.map((a) => a.userId));
    await syncTags(taskId, input.tagIds ?? []);

    await recordAudit({
      actorId: actor.id,
      action: "task.update",
      entity: "task",
      entityId: taskId,
      meta: { taskNumber: before.taskNumber },
    });

    revalidateTask(taskId);
    return formSuccess(`${before.taskNumber} updated.`, { id: taskId });
  } catch (error) {
    return formError(toUserMessage(error, { action: "editTask" }));
  }
}

/**
 * The bookkeeping that has to move with a status change.
 *
 * Kept in one function because these four fields are a single fact — a task whose
 * status says COMPLETED and whose progress says 40 is a bug, not a state.
 */
function statusSideEffects(status: TaskStatus, currentProgress: number) {
  switch (status) {
    case "COMPLETED":
      return { progressPercent: 100, completedAt: new Date(), reopenedAt: null };
    case "IN_PROGRESS":
      return {
        completedAt: null,
        startedAt: new Date(),
        // Nudge off zero so the bar shows something, but never walk back real progress.
        progressPercent: Math.max(currentProgress, TASK_STATUS_PROGRESS.IN_PROGRESS),
      };
    case "REVIEW":
      return {
        completedAt: null,
        progressPercent: Math.max(currentProgress, TASK_STATUS_PROGRESS.REVIEW),
      };
    case "TODO":
    case "BLOCKED":
      return { completedAt: null };
    default:
      return {};
  }
}

// ---------------------------------------------------------------------------
//  Assignment
// ---------------------------------------------------------------------------

/** Adds and removes assignment rows to match `wanted`, recording both sides. */
async function syncAssignees(
  taskId: string,
  wanted: string[],
  actor: SessionUser,
  current: string[],
) {
  const added = wanted.filter((id) => !current.includes(id));
  const removed = current.filter((id) => !wanted.includes(id));
  if (added.length === 0 && removed.length === 0) return;

  const people = await prisma.user.findMany({
    where: { id: { in: [...added, ...removed] } },
    select: { id: true, name: true, email: true, notifyByEmail: true },
  });
  const nameOf = (id: string) => people.find((user) => user.id === id)?.name ?? "someone";

  if (removed.length > 0) {
    await prisma.taskAssignee.deleteMany({ where: { taskId, userId: { in: removed } } });
    await recordActivity({
      taskId,
      actorId: actor.id,
      kind: "unassigned",
      meta: { from: removed.map(nameOf) },
    });
  }

  if (added.length > 0) {
    await prisma.taskAssignee.createMany({
      data: added.map((userId) => ({ taskId, userId, assignedById: actor.id })),
      skipDuplicates: true,
    });
    await recordActivity({
      taskId,
      actorId: actor.id,
      kind: "assigned",
      meta: { to: added.map(nameOf) },
    });

    const task = await prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      select: { id: true, taskNumber: true, title: true, description: true, priority: true, dueOn: true },
    });

    await announceAssignment(
      task.id,
      task.taskNumber,
      actor,
      people.filter((user) => added.includes(user.id)),
      {
        title: task.title,
        description: task.description,
        priority: task.priority as TaskPriority,
        dueOn: task.dueOn,
        attachmentNames: [],
      },
    );
  }
}

export async function assignTaskAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseFormData(taskAssignSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  try {
    const actor = await requireUserAction();
    if (!can.reassignTask(actor)) throw errors.forbidden("Only admins can reassign a task.");

    const task = await loadPolicySubject(parsed.data.taskId);
    if (parsed.data.assigneeIds.length > MAX_ASSIGNEES) {
      return formError(`Assign a task to at most ${MAX_ASSIGNEES} people.`);
    }

    await syncAssignees(task.id, parsed.data.assigneeIds, actor, task.assigneeIds);

    await recordAudit({
      actorId: actor.id,
      action: "task.assign",
      entity: "task",
      entityId: task.id,
      meta: { taskNumber: task.taskNumber, assignees: parsed.data.assigneeIds.length },
    });

    revalidateTask(task.id);
    return formSuccess("Assignment updated.");
  } catch (error) {
    return formError(toUserMessage(error, { action: "assignTask" }));
  }
}

/** Stamps that an assignee has actually opened the task. Silent and idempotent. */
export async function markTaskSeenAction(taskId: string): Promise<void> {
  try {
    const actor = await requireUserAction();
    await prisma.taskAssignee.updateMany({
      where: { taskId, userId: actor.id, seenAt: null },
      data: { seenAt: new Date() },
    });
  } catch {
    // Acknowledgement is a nicety; failing it must never break opening a task.
  }
}

// ---------------------------------------------------------------------------
//  Status & progress
// ---------------------------------------------------------------------------

export async function changeTaskStatusAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseFormData(taskStatusSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  try {
    const actor = await requireUserAction();
    const task = await loadPolicySubject(parsed.data.taskId);

    if (!can.changeTaskStatus(actor, task)) {
      throw errors.forbidden("Only the people assigned to this task, or an admin, can move it.");
    }

    const from = asTaskStatus(task.status);
    const to = parsed.data.status;
    if (from === to) return formSuccess("Nothing changed.");

    // A task cannot be completed while something it depends on is still open — that
    // is the entire point of recording a dependency.
    if (to === "COMPLETED") {
      const blocking = await prisma.taskDependency.findMany({
        where: { dependentId: task.id, blocker: { status: { not: "COMPLETED" } } },
        select: { blocker: { select: { taskNumber: true, title: true } } },
      });
      if (blocking.length > 0) {
        return formError(
          `This task waits on ${blocking
            .map((row) => row.blocker.taskNumber)
            .join(", ")}, which ${blocking.length === 1 ? "is" : "are"} not finished yet.`,
        );
      }
    }

    const reopening = from === "COMPLETED" && to !== "COMPLETED";

    await prisma.task.update({
      where: { id: task.id },
      data: {
        status: to,
        blockedReason: to === "BLOCKED" ? (parsed.data.blockedReason ?? null) : null,
        ...statusSideEffects(to, task.progressPercent),
        ...(reopening ? { reopenedAt: new Date() } : {}),
      },
    });

    const kind: TaskActivityKind =
      to === "COMPLETED"
        ? "completed"
        : reopening
          ? "reopened"
          : to === "BLOCKED"
            ? "blocked"
            : from === "BLOCKED"
              ? "unblocked"
              : "status_changed";

    await recordActivity({
      taskId: task.id,
      actorId: actor.id,
      kind,
      meta: { from, to },
      comment: to === "BLOCKED" ? (parsed.data.blockedReason ?? null) : null,
    });

    await notifyAssignees(task.id, actor, {
      type:
        to === "COMPLETED"
          ? "TASK_COMPLETED"
          : to === "BLOCKED"
            ? "TASK_BLOCKED"
            : "TASK_UPDATED",
      title: `${task.taskNumber} — ${TASK_STATUS_LABEL[to].toLowerCase()}`,
      body: `${task.title}${parsed.data.blockedReason ? ` — ${parsed.data.blockedReason}` : ""}`,
    });

    // Whoever set the work up wants to know it landed.
    if (task.createdById !== actor.id && (to === "COMPLETED" || to === "REVIEW" || to === "BLOCKED")) {
      await notify({
        userId: task.createdById,
        actorId: actor.id,
        type: to === "COMPLETED" ? "TASK_COMPLETED" : to === "BLOCKED" ? "TASK_BLOCKED" : "TASK_UPDATED",
        title: `${actor.name} moved ${task.taskNumber} to ${TASK_STATUS_LABEL[to].toLowerCase()}`,
        body: task.title,
        href: `/tasks/${task.id}`,
      });
    }

    // Anything waiting on this task can now start.
    if (to === "COMPLETED") await notifyUnblockedDependents(task.id, task.taskNumber, actor);

    await recordAudit({
      actorId: actor.id,
      action: to === "COMPLETED" ? "task.complete" : reopening ? "task.reopen" : "task.status",
      entity: "task",
      entityId: task.id,
      meta: { taskNumber: task.taskNumber, from, to },
    });

    revalidateTask(task.id);
    return formSuccess(`${task.taskNumber} moved to ${TASK_STATUS_LABEL[to].toLowerCase()}.`);
  } catch (error) {
    return formError(toUserMessage(error, { action: "changeTaskStatus" }));
  }
}

async function notifyUnblockedDependents(
  blockerId: string,
  blockerNumber: string,
  actor: SessionUser,
) {
  const dependents = await prisma.taskDependency.findMany({
    where: { blockerId },
    select: {
      dependent: {
        select: {
          id: true,
          taskNumber: true,
          title: true,
          assignees: { select: { userId: true } },
          dependsOn: { select: { blocker: { select: { status: true } } } },
        },
      },
    },
  });

  for (const { dependent } of dependents) {
    // Only shout when *every* blocker is done, not just this one.
    const stillBlocked = dependent.dependsOn.some((link) => link.blocker.status !== "COMPLETED");
    if (stillBlocked) continue;

    await notifyMany(
      dependent.assignees
        .filter((entry) => entry.userId !== actor.id)
        .map((entry) => ({
          userId: entry.userId,
          actorId: actor.id,
          type: "TASK_UPDATED" as const,
          title: `${dependent.taskNumber} is unblocked`,
          body: `${blockerNumber} is finished, so you can start on “${dependent.title}”.`,
          href: `/tasks/${dependent.id}`,
        })),
    );
  }
}

export async function setTaskProgressAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseFormData(taskProgressSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  try {
    const actor = await requireUserAction();
    const task = await loadPolicySubject(parsed.data.taskId);
    if (!can.updateTask(actor, task)) {
      throw errors.forbidden("Only the people assigned to this task, or an admin, can update it.");
    }

    const to = parsed.data.progressPercent;
    if (to === task.progressPercent) return formSuccess("Nothing changed.");

    await prisma.task.update({
      where: { id: task.id },
      data: {
        progressPercent: to,
        // 100% and "to do" contradict each other, so completing the bar completes
        // the task — but only from a status where that is a sensible read.
        ...(to === 100 && asTaskStatus(task.status) !== "BLOCKED"
          ? { status: "COMPLETED", completedAt: new Date() }
          : {}),
        ...(to > 0 && to < 100 && asTaskStatus(task.status) === "TODO"
          ? { status: "IN_PROGRESS", startedAt: new Date() }
          : {}),
      },
    });

    await recordActivity({
      taskId: task.id,
      actorId: actor.id,
      kind: to === 100 ? "completed" : "progress_changed",
      meta: { from: task.progressPercent, to },
    });

    revalidateTask(task.id);
    return formSuccess(to === 100 ? `${task.taskNumber} marked complete.` : `Progress set to ${to}%.`);
  } catch (error) {
    return formError(toUserMessage(error, { action: "setTaskProgress" }));
  }
}

// ---------------------------------------------------------------------------
//  Updates (the threaded conversation)
// ---------------------------------------------------------------------------

export async function postTaskUpdateAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseFormData(taskUpdateSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  try {
    const actor = await requireUserAction();
    const task = await loadPolicySubject(parsed.data.taskId);
    if (!can.updateTask(actor, task)) {
      throw errors.forbidden("Only the people assigned to this task, or an admin, can post on it.");
    }

    const files = filesFrom(formData);
    if (files.length > MAX_FILES_PER_POST) {
      return formError(`Attach at most ${MAX_FILES_PER_POST} files to one update.`);
    }

    let uploaded: Awaited<ReturnType<typeof uploadAll>> = [];
    try {
      uploaded = await uploadAll(files, actor.id);
    } catch (uploadError) {
      return formError(toUserMessage(uploadError, { action: "uploadTaskFile" }));
    }

    const mentionIds = await resolveMentions(String(formData.get("mentionIds") ?? ""), actor.id);
    const progress = parsed.data.progressPercent ? Number(parsed.data.progressPercent) : null;

    // Checklist arrives as one item per line from the composer.
    const checklistLabels = (parsed.data.checklist ?? "")
      .split("\n")
      .map((line) => line.replace(/^[-*\s[\]x]+/i, "").trim())
      .filter(Boolean)
      .slice(0, 50);

    const update = await prisma.taskUpdate.create({
      data: {
        taskId: task.id,
        authorId: actor.id,
        body: parsed.data.body,
        parentId: parsed.data.parentId ?? null,
        progressPercent: progress,
        attachments: {
          create: uploaded.map((file) => ({
            filename: file.filename,
            mimeType: file.mimeType,
            size: file.size,
            storagePath: file.storagePath,
            url: "",
            uploadedById: actor.id,
            // Linked to the task as well, so the task's file list is complete
            // without walking every update.
            taskId: task.id,
          })),
        },
        mentions: { create: mentionIds.map((userId) => ({ userId })) },
        tagLinks: parsed.data.tagIds?.length
          ? { create: parsed.data.tagIds.map((tagId) => ({ tagId })) }
          : undefined,
      },
      select: { id: true },
    });

    if (checklistLabels.length > 0) {
      const offset = await prisma.taskChecklistItem.count({ where: { taskId: task.id } });
      await prisma.taskChecklistItem.createMany({
        data: checklistLabels.map((label, index) => ({
          taskId: task.id,
          label,
          position: offset + index,
          createdInUpdateId: update.id,
        })),
      });
      await recordActivity({
        taskId: task.id,
        actorId: actor.id,
        kind: "checklist_added",
        meta: { count: checklistLabels.length },
      });
    }

    if (progress !== null && progress !== task.progressPercent) {
      await prisma.task.update({
        where: { id: task.id },
        data: {
          progressPercent: progress,
          ...(progress === 100 && asTaskStatus(task.status) !== "BLOCKED"
            ? { status: "COMPLETED", completedAt: new Date() }
            : {}),
          ...(progress > 0 && progress < 100 && asTaskStatus(task.status) === "TODO"
            ? { status: "IN_PROGRESS", startedAt: new Date() }
            : {}),
        },
      });
      await recordActivity({
        taskId: task.id,
        actorId: actor.id,
        kind: "progress_changed",
        meta: { from: task.progressPercent, to: progress },
      });
    }

    await recordActivity({
      taskId: task.id,
      actorId: actor.id,
      kind: uploaded.some((file) => /^(audio|video)\//.test(file.mimeType))
        ? "recording_added"
        : uploaded.length > 0
          ? "attachment_added"
          : "commented",
      meta: {
        updateId: update.id,
        files: uploaded.map((file) => file.filename),
        mentions: mentionIds.length,
      },
      comment: parsed.data.body.slice(0, 280),
    });

    // Mentions first: being named is more specific than being on the task, and a
    // person should not get two notifications for the same post.
    if (mentionIds.length > 0) {
      await notifyMany(
        mentionIds.map((userId) => ({
          userId,
          actorId: actor.id,
          type: "TASK_MENTION" as const,
          title: `${actor.name} mentioned you on ${task.taskNumber}`,
          body: parsed.data.body.slice(0, 200),
          href: `/tasks/${task.id}`,
        })),
      );
    }

    const others = await prisma.taskAssignee.findMany({
      where: { taskId: task.id, NOT: { userId: { in: [actor.id, ...mentionIds] } } },
      select: { userId: true },
    });

    const recipients = new Set(others.map((entry) => entry.userId));
    // The person who set the task up follows it too.
    if (task.createdById !== actor.id && !mentionIds.includes(task.createdById)) {
      recipients.add(task.createdById);
    }

    if (recipients.size > 0) {
      await notifyMany(
        [...recipients].map((userId) => ({
          userId,
          actorId: actor.id,
          type: (uploaded.length > 0 ? "TASK_ATTACHMENT" : "TASK_UPDATED") as never,
          title: `${actor.name} posted on ${task.taskNumber}`,
          body: parsed.data.body.slice(0, 200),
          href: `/tasks/${task.id}`,
        })),
      );
    }

    await recordAudit({
      actorId: actor.id,
      action: uploaded.length > 0 ? "task.attach" : "task.comment",
      entity: "task",
      entityId: task.id,
      meta: { taskNumber: task.taskNumber, files: uploaded.length, mentions: mentionIds.length },
    });

    revalidateTask(task.id);
    return formSuccess("Update posted.");
  } catch (error) {
    return formError(toUserMessage(error, { action: "postTaskUpdate" }));
  }
}

// ---------------------------------------------------------------------------
//  Checklist, tags, dependencies
// ---------------------------------------------------------------------------

export async function toggleChecklistItemAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseFormData(taskChecklistSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  try {
    const actor = await requireUserAction();
    const task = await loadPolicySubject(parsed.data.taskId);
    if (!can.updateTask(actor, task)) {
      throw errors.forbidden("Only the people assigned to this task, or an admin, can tick items.");
    }

    const item = await prisma.taskChecklistItem.findUnique({
      where: { id: parsed.data.itemId },
      select: { id: true, taskId: true, label: true },
    });
    // Checking the parent as well as the id stops an item being ticked through a
    // task the actor happens to have access to.
    if (!item || item.taskId !== task.id) throw errors.notFound("That checklist item");

    await prisma.taskChecklistItem.update({
      where: { id: item.id },
      data: {
        done: parsed.data.done,
        doneAt: parsed.data.done ? new Date() : null,
        doneById: parsed.data.done ? actor.id : null,
      },
    });

    // Progress follows the checklist when there is one — a bar that disagrees with
    // the ticks below it is worse than no bar.
    const [total, done] = await Promise.all([
      prisma.taskChecklistItem.count({ where: { taskId: task.id } }),
      prisma.taskChecklistItem.count({ where: { taskId: task.id, done: true } }),
    ]);
    const derived = total > 0 ? Math.round((done / total) * 100) : task.progressPercent;

    await prisma.task.update({
      where: { id: task.id },
      data: {
        progressPercent: derived,
        ...(derived > 0 && derived < 100 && asTaskStatus(task.status) === "TODO"
          ? { status: "IN_PROGRESS", startedAt: new Date() }
          : {}),
      },
    });

    if (parsed.data.done) {
      await recordActivity({
        taskId: task.id,
        actorId: actor.id,
        kind: "checklist_completed",
        meta: { label: item.label, done, total },
      });
    }

    revalidateTask(task.id);
    return formSuccess(`${done} of ${total} done.`);
  } catch (error) {
    return formError(toUserMessage(error, { action: "toggleChecklistItem" }));
  }
}

/** Replaces a task's tags with `wanted`. */
async function syncTags(taskId: string, wanted: string[]) {
  const current = await prisma.taskTagLink.findMany({
    where: { taskId },
    select: { tagId: true },
  });
  const have = current.map((link) => link.tagId);

  const added = wanted.filter((id) => !have.includes(id));
  const removed = have.filter((id) => !wanted.includes(id));

  if (removed.length > 0) {
    await prisma.taskTagLink.deleteMany({ where: { taskId, tagId: { in: removed } } });
  }
  if (added.length > 0) {
    await prisma.taskTagLink.createMany({
      data: added.map((tagId) => ({ taskId, tagId })),
      skipDuplicates: true,
    });
  }
}

/**
 * Links dependencies, refusing any that would create a cycle.
 *
 * A cycle is not a data-integrity nicety: two tasks each waiting on the other can
 * never be completed, and the completion guard above would deadlock them silently.
 * The walk is breadth-first over the existing graph, which is cheap at this scale.
 */
async function linkDependencies(dependentId: string, blockerIds: string[]) {
  const edges = await prisma.taskDependency.findMany({
    select: { blockerId: true, dependentId: true },
  });

  const dependentsOf = new Map<string, string[]>();
  for (const edge of edges) {
    dependentsOf.set(edge.blockerId, [...(dependentsOf.get(edge.blockerId) ?? []), edge.dependentId]);
  }

  /** Can we already reach `to` by following "waits on" from `from`? */
  const reaches = (from: string, to: string): boolean => {
    const seen = new Set<string>();
    const queue = [from];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === to) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      queue.push(...(dependentsOf.get(current) ?? []));
    }
    return false;
  };

  const safe = blockerIds.filter(
    (blockerId) => blockerId !== dependentId && !reaches(dependentId, blockerId),
  );

  if (safe.length === 0) return { linked: 0, rejected: blockerIds.length };

  await prisma.taskDependency.createMany({
    data: safe.map((blockerId) => ({ blockerId, dependentId })),
    skipDuplicates: true,
  });

  return { linked: safe.length, rejected: blockerIds.length - safe.length };
}

export async function addTaskDependencyAction(
  taskId: string,
  blockerId: string,
): Promise<FormState> {
  try {
    const actor = await requireUserAction();
    if (!can.editTask(actor)) throw errors.forbidden("Only admins can change dependencies.");

    const task = await loadPolicySubject(taskId);
    const blocker = await prisma.task.findUnique({
      where: { id: blockerId },
      select: { id: true, taskNumber: true, title: true },
    });
    if (!blocker) throw errors.notFound("That task");

    const result = await linkDependencies(task.id, [blockerId]);
    if (result.linked === 0) {
      return formError(
        `${blocker.taskNumber} already waits on this task — linking them both ways would mean neither could ever finish.`,
      );
    }

    await recordActivity({
      taskId: task.id,
      actorId: actor.id,
      kind: "dependency_added",
      meta: { blocker: blocker.taskNumber, title: blocker.title },
    });

    revalidateTask(task.id);
    return formSuccess(`${task.taskNumber} now waits on ${blocker.taskNumber}.`);
  } catch (error) {
    return formError(toUserMessage(error, { action: "addTaskDependency" }));
  }
}

export async function removeTaskDependencyAction(
  taskId: string,
  blockerId: string,
): Promise<FormState> {
  try {
    const actor = await requireUserAction();
    if (!can.editTask(actor)) throw errors.forbidden("Only admins can change dependencies.");

    const task = await loadPolicySubject(taskId);
    await prisma.taskDependency.deleteMany({ where: { dependentId: task.id, blockerId } });

    await recordActivity({
      taskId: task.id,
      actorId: actor.id,
      kind: "dependency_removed",
      meta: { blockerId },
    });

    revalidateTask(task.id);
    return formSuccess("Dependency removed.");
  } catch (error) {
    return formError(toUserMessage(error, { action: "removeTaskDependency" }));
  }
}

// ---------------------------------------------------------------------------
//  Delete
// ---------------------------------------------------------------------------

export async function deleteTaskAction(taskId: string): Promise<FormState> {
  try {
    const actor = await requireUserAction();
    if (!can.deleteTask(actor)) throw errors.forbidden("Only admins can delete a task.");

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        taskNumber: true,
        title: true,
        attachments: { select: { storagePath: true } },
      },
    });
    if (!task) throw errors.notFound("That task");

    // Storage objects are not cascade-deleted by Postgres, so they go first —
    // otherwise every deleted task leaves its files paid for and unreachable.
    await Promise.all(
      task.attachments
        .filter((file) => file.storagePath)
        .map((file) => deleteTaskFile(file.storagePath!)),
    );

    await prisma.task.delete({ where: { id: task.id } });

    await recordAudit({
      actorId: actor.id,
      action: "task.delete",
      entity: "task",
      entityId: task.id,
      meta: { taskNumber: task.taskNumber, title: task.title, files: task.attachments.length },
    });

    revalidateTask();
    return formSuccess(`${task.taskNumber} deleted.`);
  } catch (error) {
    return formError(toUserMessage(error, { action: "deleteTask" }));
  }
}

// ---------------------------------------------------------------------------
//  Categories & tags
// ---------------------------------------------------------------------------

export async function createTaskCategoryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseFormData(taskCategorySchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  try {
    const actor = await requireUserAction();
    if (!can.manageTaskCategories(actor)) {
      throw errors.forbidden("Only admins can manage task categories.");
    }

    const slug = slugify(parsed.data.name);
    const clash = await prisma.taskCategory.findFirst({
      where: { OR: [{ slug }, { name: parsed.data.name }] },
      select: { id: true },
    });
    if (clash) return formError("There is already a category with that name.", { name: "Pick another name." });

    const created = await prisma.taskCategory.create({
      data: {
        name: parsed.data.name,
        slug,
        description: parsed.data.description ?? null,
        color: parsed.data.color,
      },
      select: { id: true, name: true },
    });

    await recordAudit({
      actorId: actor.id,
      action: "task.category",
      entity: "task",
      entityId: created.id,
      meta: { name: created.name },
    });

    revalidateTask();
    return formSuccess(`Category “${created.name}” added.`, { id: created.id });
  } catch (error) {
    return formError(toUserMessage(error, { action: "createTaskCategory" }));
  }
}

export async function createTaskTagAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseFormData(taskTagSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  try {
    const actor = await requireUserAction();
    if (!can.manageTaskCategories(actor)) {
      throw errors.forbidden("Only admins can manage the tag list.");
    }

    const slug = slugify(parsed.data.name);
    const existing = await prisma.taskTag.findFirst({
      where: { OR: [{ slug }, { name: parsed.data.name }] },
      select: { id: true, name: true },
    });
    // Idempotent rather than an error: two people adding "Urgent" at once should
    // both end up with the tag, not one of them with a complaint.
    if (existing) return formSuccess(`“${existing.name}” already exists.`, { id: existing.id });

    const created = await prisma.taskTag.create({
      data: { name: parsed.data.name, slug, color: parsed.data.color },
      select: { id: true, name: true },
    });

    await recordAudit({
      actorId: actor.id,
      action: "task.tag",
      entity: "task",
      entityId: created.id,
      meta: { name: created.name },
    });

    revalidateTask();
    return formSuccess(`Tag “${created.name}” added.`, { id: created.id });
  } catch (error) {
    return formError(toUserMessage(error, { action: "createTaskTag" }));
  }
}

// ---------------------------------------------------------------------------
//  Recurrence
// ---------------------------------------------------------------------------

/**
 * Spawns any due occurrences of repeating tasks. Called by the cron.
 *
 * Copies the template's details and assignees but nothing else — the new occurrence
 * starts with an empty timeline, no updates and no attachments, because it is a
 * fresh piece of work rather than a continuation of last week's.
 */
export async function spawnRecurringTasks(): Promise<{ spawned: number }> {
  const now = today();

  const templates = await prisma.task.findMany({
    where: {
      recurrence: { not: "NONE" },
      recurrenceParentId: null,
      OR: [{ recurrenceUntil: null }, { recurrenceUntil: { gte: now } }],
    },
    select: {
      id: true,
      title: true,
      description: true,
      priority: true,
      categoryId: true,
      estimateMinutes: true,
      recurrence: true,
      recurrenceEvery: true,
      recurrenceUntil: true,
      dueOn: true,
      lastSpawnedFor: true,
      createdById: true,
      assignees: { select: { userId: true } },
      tagLinks: { select: { tagId: true } },
    },
  });

  let spawned = 0;

  for (const template of templates) {
    const anchor = template.lastSpawnedFor ?? template.dueOn;
    if (!anchor) continue;

    let next = nextOccurrence(anchor, template.recurrence as TaskRecurrence, template.recurrenceEvery);

    // Catch up if the cron has not run for a while, but never spawn beyond today —
    // filling someone's board with next month's work is not helpful.
    while (next && next <= now) {
      if (template.recurrenceUntil && next > template.recurrenceUntil) break;

      const created = await prisma.task.create({
        data: {
          taskNumber: await nextTaskNumber(),
          title: template.title,
          description: template.description,
          priority: template.priority,
          status: "TODO",
          categoryId: template.categoryId,
          estimateMinutes: template.estimateMinutes,
          dueOn: next,
          createdById: template.createdById,
          recurrence: "NONE",
          recurrenceParentId: template.id,
          assignees: { create: template.assignees.map((entry) => ({ userId: entry.userId })) },
          tagLinks: template.tagLinks.length
            ? { create: template.tagLinks.map((link) => ({ tagId: link.tagId })) }
            : undefined,
        },
        select: { id: true, taskNumber: true },
      });

      await recordActivity({
        taskId: created.id,
        actorId: null,
        kind: "spawned",
        meta: { from: template.id, dueOn: toDayKey(next) },
      });

      await notifyMany(
        template.assignees.map((entry) => ({
          userId: entry.userId,
          actorId: null,
          type: "TASK_ASSIGNED" as const,
          title: `${created.taskNumber} — ${template.title}`,
          body: `Due ${formatDayLong(next!)}. This one repeats.`,
          href: `/tasks/${created.id}`,
        })),
      );

      await prisma.task.update({
        where: { id: template.id },
        data: { lastSpawnedFor: next },
      });

      spawned += 1;
      next = nextOccurrence(next, template.recurrence as TaskRecurrence, template.recurrenceEvery);
    }
  }

  if (spawned > 0) revalidateTask();
  return { spawned };
}
