import "server-only";
import { formatReference, parseReference } from "@/lib/services/reference";
import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { containsInsensitive, prisma } from "@/lib/db/prisma";
import { isAdmin, isManagerOrAdmin, type Actor } from "@/lib/auth/rbac";
import {
  asTaskActivityKind,
  asTaskPriority,
  asTaskRecurrence,
  asTaskStatus,
  TASK_OPEN_STATUSES,
  TASK_PRIORITY_WEIGHT,
  TASK_STATUSES,
  type TaskActivityKind,
  type TaskPriority,
  type TaskRecurrence,
  type TaskStatus,
} from "@/lib/constants/enums";
import {
  addDays,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
  today,
  type DayRange,
} from "@/lib/utils/date";
import { isInlineSafe, signTaskFileUrl } from "@/lib/storage/supabase-storage";

/**
 * Task reads.
 *
 * Writes live in `src/server/actions/tasks.ts`. As with the other services, every
 * list function takes an `Actor` and applies its own scoping — an employee sees only
 * the tasks they are on, and that is enforced here rather than trusted to the caller.
 *
 * ## One shape, four views
 *
 * The list, board, calendar and timeline views all render `TaskDto`. They differ in
 * *arrangement*, not in data, so a filter change cannot make one view disagree with
 * another — and adding a fifth view later needs no new query.
 */

export interface TaskAssigneeDto {
  id: string;
  name: string;
  avatarUrl: string | null;
  designation: string | null;
  department: string | null;
  assignedAt: Date;
  seenAt: Date | null;
}

export interface TaskTagDto {
  id: string;
  name: string;
  slug: string;
  color: string;
}

export interface TaskDto {
  id: string;
  taskNumber: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueOn: Date | null;
  deadlineAt: Date | null;
  estimateMinutes: number | null;
  progressPercent: number;
  blockedReason: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  reopenedAt: Date | null;
  recurrence: TaskRecurrence;
  recurrenceEvery: number;
  createdAt: Date;
  updatedAt: Date;
  category: { id: string; name: string; slug: string; color: string } | null;
  createdBy: { id: string; name: string; avatarUrl: string | null };
  assignees: TaskAssigneeDto[];
  tags: TaskTagDto[];
  counts: { updates: number; attachments: number; checklist: number; checklistDone: number };
  /** Tasks this one waits on, with just enough to render a chip. */
  dependsOn: Array<{ id: string; taskNumber: string; title: string; status: TaskStatus }>;
}

const TASK_SELECT = {
  id: true,
  taskNumber: true,
  title: true,
  description: true,
  priority: true,
  status: true,
  dueOn: true,
  deadlineAt: true,
  estimateMinutes: true,
  progressPercent: true,
  blockedReason: true,
  startedAt: true,
  completedAt: true,
  reopenedAt: true,
  recurrence: true,
  recurrenceEvery: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true, slug: true, color: true } },
  createdBy: { select: { id: true, name: true, avatarUrl: true } },
  assignees: {
    orderBy: { assignedAt: "asc" },
    select: {
      assignedAt: true,
      seenAt: true,
      user: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          designation: true,
          managerId: true,
          department: { select: { name: true } },
        },
      },
    },
  },
  tagLinks: {
    select: { tag: { select: { id: true, name: true, slug: true, color: true } } },
  },
  dependsOn: {
    select: {
      blocker: { select: { id: true, taskNumber: true, title: true, status: true } },
    },
  },
  _count: { select: { updates: true, attachments: true, checklistItems: true } },
} satisfies Prisma.TaskSelect;

type RawTask = Prisma.TaskGetPayload<{ select: typeof TASK_SELECT }>;

/**
 * Checklist completion is counted separately.
 *
 * Prisma's `_count` cannot express "how many of these are done", and pulling every
 * item just to count them would multiply rows across the whole list. One grouped
 * query for the page's ids is cheaper than either.
 */
async function checklistProgress(taskIds: string[]): Promise<Map<string, number>> {
  if (taskIds.length === 0) return new Map();

  const grouped = await prisma.taskChecklistItem.groupBy({
    by: ["taskId"],
    where: { taskId: { in: taskIds }, done: true },
    _count: { _all: true },
  });

  return new Map(grouped.map((row) => [row.taskId, row._count._all]));
}

function toDto(row: RawTask, doneCount = 0): TaskDto {
  const { _count, assignees, tagLinks, dependsOn, ...rest } = row;

  return {
    ...rest,
    priority: asTaskPriority(row.priority),
    status: asTaskStatus(row.status),
    recurrence: asTaskRecurrence(row.recurrence),
    assignees: assignees.map((entry) => ({
      id: entry.user.id,
      name: entry.user.name,
      avatarUrl: entry.user.avatarUrl,
      designation: entry.user.designation,
      department: entry.user.department?.name ?? null,
      assignedAt: entry.assignedAt,
      seenAt: entry.seenAt,
    })),
    tags: tagLinks.map((link) => link.tag),
    dependsOn: dependsOn.map((link) => ({
      ...link.blocker,
      status: asTaskStatus(link.blocker.status),
    })),
    counts: {
      updates: _count.updates,
      attachments: _count.attachments,
      checklist: _count.checklistItems,
      checklistDone: doneCount,
    },
  };
}

// ---------------------------------------------------------------------------
//  Visibility
// ---------------------------------------------------------------------------

/**
 * Scoping clause.
 *
 * Admins see everything. Managers see their own tasks plus anything assigned to
 * their reporting line, for context. Everyone else sees only tasks they are on or
 * created — which, for an employee, is the tasks assigned to them.
 */
export function taskVisibilityFor(actor: Actor): Prisma.TaskWhereInput {
  if (actor.role === "ADMIN") return {};

  const mine: Prisma.TaskWhereInput[] = [
    { assignees: { some: { userId: actor.id } } },
    { createdById: actor.id },
  ];

  if (actor.role === "MANAGER") {
    mine.push({ assignees: { some: { user: { managerId: actor.id } } } });
  }

  return { OR: mine };
}

// ---------------------------------------------------------------------------
//  Single task
// ---------------------------------------------------------------------------

/**
 * Request-cached: `generateMetadata` and the page body both need it, and after the
 * `<title>` leak found on the claim page every detail route checks authorisation in
 * both places — which only stays free because of this.
 */
export const getTask = cache(async function getTask(id: string): Promise<TaskDto | null> {
  const row = await prisma.task.findUnique({ where: { id }, select: TASK_SELECT });
  if (!row) return null;

  const done = await checklistProgress([row.id]);
  return toDto(row, done.get(row.id) ?? 0);
});

/**
 * The reporting-line ids the view policy needs, without widening `TaskDto`.
 *
 * Kept separate because it is only ever needed for the permission decision, and
 * putting manager ids on the DTO would ship them to the browser for no reason.
 */
export const getTaskPolicySubject = cache(async function getTaskPolicySubject(id: string) {
  const row = await prisma.task.findUnique({
    where: { id },
    select: {
      createdById: true,
      assignees: { select: { userId: true, user: { select: { managerId: true } } } },
    },
  });
  if (!row) return null;

  return {
    createdById: row.createdById,
    assigneeIds: row.assignees.map((entry) => entry.userId),
    assigneeManagerIds: row.assignees.map((entry) => entry.user.managerId),
  };
});

export interface TaskAttachmentDto {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  uploadedBy: { id: string; name: string } | null;
  /** Short-lived signed URL, minted only for viewers who passed the RBAC check. */
  url: string | null;
  /** Whether the browser may render it in place, or must download it. */
  inline: boolean;
  /** Which update it came in with, if any. */
  taskUpdateId: string | null;
}

/**
 * Attachments with freshly signed URLs.
 *
 * Separate from `getTask` on purpose: signing is a network call per file and must
 * happen *after* authorisation, never as a side effect of loading a task. Signing
 * runs concurrently because a task can carry a dozen files and doing them in
 * sequence would be a visible stall.
 */
export async function getTaskAttachments(taskId: string): Promise<TaskAttachmentDto[]> {
  const rows = await prisma.attachment.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      filename: true,
      mimeType: true,
      size: true,
      storagePath: true,
      createdAt: true,
      taskUpdateId: true,
      uploadedBy: { select: { id: true, name: true } },
    },
  });

  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      filename: row.filename,
      mimeType: row.mimeType,
      size: row.size,
      createdAt: row.createdAt,
      taskUpdateId: row.taskUpdateId,
      uploadedBy: row.uploadedBy,
      inline: isInlineSafe(row.mimeType),
      url: row.storagePath
        ? await signTaskFileUrl(row.storagePath, {
            mimeType: row.mimeType,
            filename: row.filename,
          })
        : null,
    })),
  );
}

export interface TaskUpdateDto {
  id: string;
  body: string;
  progressPercent: number | null;
  createdAt: Date;
  editedAt: Date | null;
  parentId: string | null;
  author: { id: string; name: string; avatarUrl: string | null; role: string };
  tags: TaskTagDto[];
  mentions: Array<{ id: string; name: string }>;
  attachments: TaskAttachmentDto[];
  replies: TaskUpdateDto[];
}

/**
 * The update thread, nested one level.
 *
 * Fetched flat and assembled in memory rather than with a recursive query: threads
 * on a 20-person shop's tasks are tens of rows, and one query beats N.
 */
export async function getTaskUpdates(taskId: string): Promise<TaskUpdateDto[]> {
  const [rows, attachments] = await Promise.all([
    prisma.taskUpdate.findMany({
      where: { taskId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        body: true,
        progressPercent: true,
        createdAt: true,
        editedAt: true,
        parentId: true,
        author: { select: { id: true, name: true, avatarUrl: true, role: true } },
        tagLinks: { select: { tag: { select: { id: true, name: true, slug: true, color: true } } } },
        mentions: { select: { user: { select: { id: true, name: true } } } },
      },
    }),
    getTaskAttachments(taskId),
  ]);

  const byUpdate = new Map<string, TaskAttachmentDto[]>();
  for (const file of attachments) {
    if (!file.taskUpdateId) continue;
    byUpdate.set(file.taskUpdateId, [...(byUpdate.get(file.taskUpdateId) ?? []), file]);
  }

  const shape = (row: (typeof rows)[number]): TaskUpdateDto => ({
    id: row.id,
    body: row.body,
    progressPercent: row.progressPercent,
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    parentId: row.parentId,
    author: row.author,
    tags: row.tagLinks.map((link) => link.tag),
    mentions: row.mentions.map((mention) => mention.user),
    attachments: byUpdate.get(row.id) ?? [],
    replies: [],
  });

  const roots: TaskUpdateDto[] = [];
  const index = new Map<string, TaskUpdateDto>();

  for (const row of rows) {
    const dto = shape(row);
    index.set(dto.id, dto);
    if (!dto.parentId) roots.push(dto);
  }
  // Second pass, so a reply that arrives before its parent still lands correctly.
  for (const dto of index.values()) {
    if (dto.parentId) index.get(dto.parentId)?.replies.push(dto);
  }

  return roots;
}

export interface TaskActivityDto {
  id: string;
  kind: TaskActivityKind;
  meta: Record<string, unknown> | null;
  comment: string | null;
  createdAt: Date;
  actor: { id: string; name: string; avatarUrl: string | null } | null;
}

/** The timeline. Newest last, so it reads as a story rather than a feed. */
export async function getTaskTimeline(taskId: string, limit = 200): Promise<TaskActivityDto[]> {
  const rows = await prisma.taskActivity.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      kind: true,
      meta: true,
      comment: true,
      createdAt: true,
      actor: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    kind: asTaskActivityKind(row.kind),
    // Stored as a JSON string; a corrupt row must not take the page down.
    meta: safeJson(row.meta),
    comment: row.comment,
    createdAt: row.createdAt,
    actor: row.actor,
  }));
}

function safeJson(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function getTaskChecklist(taskId: string) {
  return prisma.taskChecklistItem.findMany({
    where: { taskId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      label: true,
      done: true,
      doneAt: true,
      position: true,
      doneBy: { select: { id: true, name: true } },
    },
  });
}

// ---------------------------------------------------------------------------
//  Lists
// ---------------------------------------------------------------------------

export interface TaskFilters {
  q?: string;
  status?: string[];
  priority?: string[];
  assignee?: string[];
  createdBy?: string[];
  category?: string[];
  tag?: string[];
  department?: string[];
  from?: Date;
  to?: Date;
  scope?: "all" | "mine" | "overdue" | "due-today" | "due-week" | "mentioned" | "unassigned";
}

export type TaskSort =
  | "due-asc"
  | "due-desc"
  | "priority-desc"
  | "created-desc"
  | "updated-desc"
  | "title-asc";

export interface TaskListResult {
  rows: TaskDto[];
  total: number;
  summary: {
    byStatus: Record<TaskStatus, number>;
    overdue: number;
    dueToday: number;
    dueThisWeek: number;
    unassigned: number;
    /** Mean progress across everything still open, for the header meter. */
    averageOpenProgress: number;
  };
}

/**
 * Named date shortcuts.
 *
 * "Overdue" deliberately excludes COMPLETED: a task finished two days after its due
 * date is late history, not an outstanding problem, and mixing the two makes the
 * overdue count useless as a to-do list.
 */
function scopeClause(scope: TaskFilters["scope"], actor: Actor): Prisma.TaskWhereInput {
  const now = today();

  switch (scope) {
    case "mine":
      return { assignees: { some: { userId: actor.id } } };
    case "overdue":
      return { dueOn: { lt: now }, status: { in: [...TASK_OPEN_STATUSES] } };
    case "due-today":
      return { dueOn: now, status: { in: [...TASK_OPEN_STATUSES] } };
    case "due-week":
      return {
        dueOn: { gte: startOfWeek(now), lte: endOfWeek(now) },
        status: { in: [...TASK_OPEN_STATUSES] },
      };
    case "mentioned":
      return { updates: { some: { mentions: { some: { userId: actor.id } } } } };
    case "unassigned":
      // Can only happen if every assignee was later removed or deactivated.
      return { assignees: { none: {} } };
    default:
      return {};
  }
}

function buildWhere(filters: TaskFilters, actor: Actor): Prisma.TaskWhereInput {
  const search = filters.q?.trim();

  return {
    AND: [
      taskVisibilityFor(actor),
      scopeClause(filters.scope, actor),
      ...(filters.status?.length ? [{ status: { in: filters.status } }] : []),
      ...(filters.priority?.length ? [{ priority: { in: filters.priority } }] : []),
      ...(filters.createdBy?.length ? [{ createdById: { in: filters.createdBy } }] : []),
      ...(filters.category?.length ? [{ categoryId: { in: filters.category } }] : []),
      ...(filters.assignee?.length
        ? [{ assignees: { some: { userId: { in: filters.assignee } } } }]
        : []),
      ...(filters.tag?.length ? [{ tagLinks: { some: { tagId: { in: filters.tag } } } }] : []),
      ...(filters.department?.length
        ? [{ assignees: { some: { user: { departmentId: { in: filters.department } } } } }]
        : []),
      ...(filters.from || filters.to
        ? [
            {
              dueOn: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
              },
            },
          ]
        : []),
      // Full-text-ish search across the task and everything written on it, which is
      // what section 11 asks for. `containsInsensitive` is the Postgres-safe helper
      // used by the other services.
      ...(search
        ? [
            {
              OR: [
                { title: containsInsensitive(search) },
                { description: containsInsensitive(search) },
                { taskNumber: containsInsensitive(search) },
                { blockedReason: containsInsensitive(search) },
                { updates: { some: { body: containsInsensitive(search) } } },
                { attachments: { some: { filename: containsInsensitive(search) } } },
                { checklistItems: { some: { label: containsInsensitive(search) } } },
                { assignees: { some: { user: { name: containsInsensitive(search) } } } },
                { tagLinks: { some: { tag: { name: containsInsensitive(search) } } } },
              ],
            },
          ]
        : []),
    ],
  };
}

function orderFor(sort: TaskSort | undefined): Prisma.TaskOrderByWithRelationInput[] {
  switch (sort) {
    case "due-desc":
      return [{ dueOn: "desc" }, { priority: "asc" }];
    case "priority-desc":
      // Prisma cannot order by a mapped weight, so the column sort gets close and
      // `sortByPriority` finishes the job on the page. See the note there.
      return [{ priority: "asc" }, { dueOn: "asc" }];
    case "created-desc":
      return [{ createdAt: "desc" }];
    case "updated-desc":
      return [{ updatedAt: "desc" }];
    case "title-asc":
      return [{ title: "asc" }];
    default:
      // Soonest first, with nulls last — a task with no date should not head the list.
      return [{ dueOn: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }];
  }
}

/**
 * Priority is stored as a word, so the database sorts it alphabetically —
 * CRITICAL, HIGH, LOW, MEDIUM — which is wrong. Rather than add a rank column that
 * can drift from the enum, the correct order is applied to the page in memory.
 */
function sortByPriority(rows: TaskDto[]): TaskDto[] {
  return [...rows].sort((a, b) => {
    const byPriority = TASK_PRIORITY_WEIGHT[b.priority] - TASK_PRIORITY_WEIGHT[a.priority];
    if (byPriority !== 0) return byPriority;
    if (a.dueOn && b.dueOn) return a.dueOn.getTime() - b.dueOn.getTime();
    if (a.dueOn) return -1;
    if (b.dueOn) return 1;
    return 0;
  });
}

export async function listTasks(
  filters: TaskFilters,
  actor: Actor,
  { page = 1, pageSize = 25, sort }: { page?: number; pageSize?: number; sort?: TaskSort } = {},
): Promise<TaskListResult> {
  const where = buildWhere(filters, actor);
  const now = today();
  // Summary tiles describe the actor's whole visible set, not the filtered slice —
  // "3 overdue" has to mean the same thing whichever filter is active.
  const visible = taskVisibilityFor(actor);

  const [rows, total, grouped, overdue, dueToday, dueThisWeek, unassigned, openProgress] =
    await Promise.all([
      prisma.task.findMany({
        where,
        orderBy: orderFor(sort),
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: TASK_SELECT,
      }),
      prisma.task.count({ where }),
      prisma.task.groupBy({ by: ["status"], where: visible, _count: { _all: true } }),
      prisma.task.count({
        where: { AND: [visible, { dueOn: { lt: now }, status: { in: [...TASK_OPEN_STATUSES] } }] },
      }),
      prisma.task.count({
        where: { AND: [visible, { dueOn: now, status: { in: [...TASK_OPEN_STATUSES] } }] },
      }),
      prisma.task.count({
        where: {
          AND: [
            visible,
            {
              dueOn: { gte: startOfWeek(now), lte: endOfWeek(now) },
              status: { in: [...TASK_OPEN_STATUSES] },
            },
          ],
        },
      }),
      prisma.task.count({ where: { AND: [visible, { assignees: { none: {} } }] } }),
      prisma.task.aggregate({
        where: { AND: [visible, { status: { in: [...TASK_OPEN_STATUSES] } }] },
        _avg: { progressPercent: true },
      }),
    ]);

  const done = await checklistProgress(rows.map((row) => row.id));

  const byStatus = Object.fromEntries(
    TASK_STATUSES.map((status) => [status, 0]),
  ) as Record<TaskStatus, number>;
  for (const group of grouped) byStatus[asTaskStatus(group.status)] = group._count._all;

  const dtos = rows.map((row) => toDto(row, done.get(row.id) ?? 0));

  return {
    rows: sort === "priority-desc" ? sortByPriority(dtos) : dtos,
    total,
    summary: {
      byStatus,
      overdue,
      dueToday,
      dueThisWeek,
      unassigned,
      averageOpenProgress: Math.round(openProgress._avg.progressPercent ?? 0),
    },
  };
}

/**
 * Everything matching the filter, unpaginated — for the board, the calendar, the
 * timeline and the exports.
 *
 * Capped: a Kanban board with 2,000 cards is not a board, and an unbounded query is
 * how a page that worked in the demo falls over in year two.
 */
export async function listTasksForView(
  filters: TaskFilters,
  actor: Actor,
  limit = 500,
): Promise<{ rows: TaskDto[]; truncated: boolean }> {
  const where = buildWhere(filters, actor);

  const [rows, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: [{ dueOn: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: limit,
      select: TASK_SELECT,
    }),
    prisma.task.count({ where }),
  ]);

  const done = await checklistProgress(rows.map((row) => row.id));
  return {
    rows: rows.map((row) => toDto(row, done.get(row.id) ?? 0)),
    truncated: total > rows.length,
  };
}

/** Board columns, in the order `TASK_BOARD_ORDER` defines. */
export function groupByStatus(rows: TaskDto[]): Record<TaskStatus, TaskDto[]> {
  const columns = Object.fromEntries(TASK_STATUSES.map((status) => [status, [] as TaskDto[]])) as
    Record<TaskStatus, TaskDto[]>;

  for (const task of rows) columns[task.status].push(task);
  // Within a column, most urgent first — that is what a board is scanned for.
  for (const status of TASK_STATUSES) columns[status] = sortByPriority(columns[status]);

  return columns;
}

/** Tasks by due day, for the calendar. Keyed `YYYY-MM-DD`. */
export function groupByDueDay(rows: TaskDto[]): Map<string, TaskDto[]> {
  const byDay = new Map<string, TaskDto[]>();

  for (const task of rows) {
    if (!task.dueOn) continue;
    const key = task.dueOn.toISOString().slice(0, 10);
    byDay.set(key, [...(byDay.get(key) ?? []), task]);
  }

  for (const [key, list] of byDay) byDay.set(key, sortByPriority(list));
  return byDay;
}

export function monthRangeFor(month: string | undefined): DayRange {
  const now = today();
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const anchor = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1));
    return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
  }
  return { start: startOfMonth(now), end: endOfMonth(now) };
}

// ---------------------------------------------------------------------------
//  Dashboards
// ---------------------------------------------------------------------------

export interface UserTaskSnapshot {
  assigned: number;
  dueToday: number;
  overdue: number;
  inProgress: number;
  blocked: number;
  completedThisMonth: number;
  averageProgress: number;
  /** Unseen assignments — the "you have new work" signal. */
  unseen: number;
}

export async function getUserTaskSnapshot(userId: string): Promise<UserTaskSnapshot> {
  const now = today();
  const monthStart = startOfMonth(now);
  const mine: Prisma.TaskWhereInput = { assignees: { some: { userId } } };
  const open = { status: { in: [...TASK_OPEN_STATUSES] } };

  const [assigned, dueToday, overdue, inProgress, blocked, completed, progress, unseen] =
    await Promise.all([
      prisma.task.count({ where: { AND: [mine, open] } }),
      prisma.task.count({ where: { AND: [mine, open, { dueOn: now }] } }),
      prisma.task.count({ where: { AND: [mine, open, { dueOn: { lt: now } }] } }),
      prisma.task.count({ where: { AND: [mine, { status: "IN_PROGRESS" }] } }),
      prisma.task.count({ where: { AND: [mine, { status: "BLOCKED" }] } }),
      prisma.task.count({
        where: { AND: [mine, { status: "COMPLETED", completedAt: { gte: monthStart } }] },
      }),
      prisma.task.aggregate({
        where: { AND: [mine, open] },
        _avg: { progressPercent: true },
      }),
      prisma.taskAssignee.count({ where: { userId, seenAt: null } }),
    ]);

  return {
    assigned,
    dueToday,
    overdue,
    inProgress,
    blocked,
    completedThisMonth: completed,
    averageProgress: Math.round(progress._avg.progressPercent ?? 0),
    unseen,
  };
}

export interface AdminTaskSnapshot {
  total: number;
  open: number;
  completed: number;
  overdue: number
  dueSoon: number;
  blocked: number;
  inReview: number;
  unassigned: number;
  byStatus: Record<TaskStatus, number>;
  byPriority: Record<TaskPriority, number>;
  /** Per-person load and throughput, for the workload panel. */
  workload: Array<{
    user: { id: string; name: string; avatarUrl: string | null; department: string | null };
    open: number;
    overdue: number;
    completed: number;
    averageProgress: number;
  }>;
}

/**
 * Org-wide figures for the admin dashboard.
 *
 * Written as a handful of grouped counts rather than fetching rows, because this
 * runs on a page load and the answer is eight numbers plus a per-person table.
 */
export async function getAdminTaskSnapshot(actor: Actor): Promise<AdminTaskSnapshot> {
  const now = today();
  const soon = addDays(now, 3);
  const visible = taskVisibilityFor(actor);
  const open = { status: { in: [...TASK_OPEN_STATUSES] } };

  const [total, byStatusRaw, byPriorityRaw, overdue, dueSoon, unassigned, assigneeRows] =
    await Promise.all([
      prisma.task.count({ where: visible }),
      prisma.task.groupBy({ by: ["status"], where: visible, _count: { _all: true } }),
      prisma.task.groupBy({ by: ["priority"], where: visible, _count: { _all: true } }),
      prisma.task.count({ where: { AND: [visible, open, { dueOn: { lt: now } }] } }),
      prisma.task.count({
        where: { AND: [visible, open, { dueOn: { gte: now, lte: soon } }] },
      }),
      prisma.task.count({ where: { AND: [visible, { assignees: { none: {} } }] } }),
      prisma.taskAssignee.findMany({
        where: { task: visible },
        select: {
          userId: true,
          task: { select: { status: true, dueOn: true, progressPercent: true } },
          user: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              department: { select: { name: true } },
            },
          },
        },
      }),
    ]);

  const byStatus = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<TaskStatus, number>;
  for (const group of byStatusRaw) byStatus[asTaskStatus(group.status)] = group._count._all;

  const byPriority = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 } satisfies Record<
    TaskPriority,
    number
  >;
  for (const group of byPriorityRaw) byPriority[asTaskPriority(group.priority)] = group._count._all;

  // Fold the assignment rows into per-person figures. Done here rather than in SQL
  // because a task with two assignees must count once for each, which a GROUP BY on
  // the task side cannot express.
  const perUser = new Map<string, AdminTaskSnapshot["workload"][number] & { progressSum: number }>();

  for (const row of assigneeRows) {
    const entry =
      perUser.get(row.userId) ??
      {
        user: {
          id: row.user.id,
          name: row.user.name,
          avatarUrl: row.user.avatarUrl,
          department: row.user.department?.name ?? null,
        },
        open: 0,
        overdue: 0,
        completed: 0,
        averageProgress: 0,
        progressSum: 0,
      };

    const status = asTaskStatus(row.task.status);
    if (status === "COMPLETED") {
      entry.completed += 1;
    } else {
      entry.open += 1;
      entry.progressSum += row.task.progressPercent;
      if (row.task.dueOn && row.task.dueOn < now) entry.overdue += 1;
    }

    perUser.set(row.userId, entry);
  }

  const workload = [...perUser.values()]
    .map(({ progressSum, ...entry }) => ({
      ...entry,
      averageProgress: entry.open > 0 ? Math.round(progressSum / entry.open) : 0,
    }))
    // Busiest first — the point of the panel is spotting who is buried.
    .sort((a, b) => b.open - a.open || b.overdue - a.overdue);

  return {
    total,
    open: TASK_OPEN_STATUSES.reduce((sum, status) => sum + byStatus[status], 0),
    completed: byStatus.COMPLETED,
    overdue,
    dueSoon,
    blocked: byStatus.BLOCKED,
    inReview: byStatus.REVIEW,
    unassigned,
    byStatus,
    byPriority,
    workload,
  };
}

/** Recent activity across every visible task, for the admin dashboard rail. */
export async function getRecentTaskActivity(actor: Actor, limit = 12) {
  const rows = await prisma.taskActivity.findMany({
    where: { task: taskVisibilityFor(actor) },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      kind: true,
      createdAt: true,
      comment: true,
      actor: { select: { id: true, name: true, avatarUrl: true } },
      task: { select: { id: true, taskNumber: true, title: true, status: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    kind: asTaskActivityKind(row.kind),
    createdAt: row.createdAt,
    comment: row.comment,
    actor: row.actor,
    task: { ...row.task, status: asTaskStatus(row.task.status) },
  }));
}

/** The next few things due, for the user dashboard. */
export async function getUpcomingTasks(userId: string, limit = 6): Promise<TaskDto[]> {
  const rows = await prisma.task.findMany({
    where: {
      assignees: { some: { userId } },
      status: { in: [...TASK_OPEN_STATUSES] },
    },
    orderBy: [{ dueOn: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: limit,
    select: TASK_SELECT,
  });

  const done = await checklistProgress(rows.map((row) => row.id));
  return rows.map((row) => toDto(row, done.get(row.id) ?? 0));
}

/** Count for the nav badge: open tasks assigned to this person. */
export async function countOpenTasksFor(userId: string): Promise<number> {
  return prisma.task.count({
    where: { assignees: { some: { userId } }, status: { in: [...TASK_OPEN_STATUSES] } },
  });
}

/** Count for the admin nav badge: tasks sitting in review. */
export async function countTasksAwaitingReview(actor: Actor): Promise<number> {
  if (!isManagerOrAdmin(actor)) return 0;
  return prisma.task.count({ where: { AND: [taskVisibilityFor(actor), { status: "REVIEW" }] } });
}

// ---------------------------------------------------------------------------
//  Options
// ---------------------------------------------------------------------------

export const getTaskOptions = cache(async function getTaskOptions() {
  const [categories, tags] = await Promise.all([
    prisma.taskCategory.findMany({
      where: { archived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, color: true, _count: { select: { tasks: true } } },
    }),
    prisma.taskTag.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, color: true, _count: { select: { links: true } } },
    }),
  ]);

  return {
    categories: categories.map(({ _count, ...rest }) => ({ ...rest, taskCount: _count.tasks })),
    tags: tags.map(({ _count, ...rest }) => ({ ...rest, useCount: _count.links })),
  };
});

/**
 * Candidate tasks for a dependency picker.
 *
 * Excludes the task itself and anything already depending on it, so the obvious
 * one-step cycle cannot be created from the UI. Deeper cycles are rejected in the
 * action, which is the only place that can check them reliably.
 */
export async function getDependencyCandidates(taskId: string | null, actor: Actor) {
  const blockedBy = taskId
    ? await prisma.taskDependency.findMany({
        where: { blockerId: taskId },
        select: { dependentId: true },
      })
    : [];

  return prisma.task.findMany({
    where: {
      AND: [
        taskVisibilityFor(actor),
        { status: { not: "COMPLETED" } },
        ...(taskId
          ? [{ id: { notIn: [taskId, ...blockedBy.map((row) => row.dependentId)] } }]
          : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, taskNumber: true, title: true, status: true },
  });
}

/**
 * Next task reference, e.g. TSK-0043.
 *
 * Ordered by the reference, **not** by `createdAt` — a backdated row (a seed, an import)
 * holds a high number in the middle of the timeline, so newest-by-date returned a
 * reference that was already taken. See lib/services/reference.ts.
 */
export async function nextTaskNumber(): Promise<string> {
  const latest = await prisma.task.findFirst({
    orderBy: { taskNumber: "desc" },
    select: { taskNumber: true },
  });

  return formatReference("TSK", parseReference(latest?.taskNumber) + 1);
}

/** Admins to notify about task activity — the people who own the schedule. */
export async function getTaskAdmins(excludeUserId?: string) {
  return prisma.user.findMany({
    where: {
      role: "ADMIN",
      status: "ACTIVE",
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true, name: true, email: true, notifyByEmail: true },
  });
}

/** True when the actor may act on the whole board rather than just their own work. */
export function canSeeEveryTask(actor: Actor): boolean {
  return isAdmin(actor);
}
