import "server-only";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import {
  TASK_OPEN_STATUSES,
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  asTaskPriority,
  asTaskStatus,
} from "@/lib/constants/enums";
import { formatDayShort, today } from "@/lib/utils/date";
import { listSentence } from "@/lib/utils/format";
import type { TaskDigestSection } from "@/lib/email/templates";

/**
 * The grouped admin report — section 8 of the brief.
 *
 * ## Why this exists at all
 *
 * The alternative is an email per update. Twenty people posting three updates a day is
 * sixty emails an admin will filter into a folder and stop reading, at which point the
 * notification system has achieved nothing. One digest, ordered by what needs attention
 * first, gets read.
 *
 * ## Ordering is the whole design
 *
 * Overdue, then blocked, then awaiting review, then completed, then merely updated.
 * That is descending order of "somebody has to do something about this", so the top of
 * the email is the part worth reading if you only read the top.
 *
 * Empty sections are dropped, so a quiet period produces a short email rather than a
 * page of "nothing to report".
 */

export interface DigestPeriod {
  since: Date;
  label: string;
}

/** Everything the digest email needs, or null when there is genuinely nothing to say. */
export async function buildTaskDigest(period: DigestPeriod): Promise<{
  sections: TaskDigestSection[];
  stats: {
    updated: number;
    completed: number;
    overdue: number;
    blocked: number;
    awaitingReview: number;
  };
} | null> {
  const now = today();
  const base = `${env.NEXT_PUBLIC_APP_URL}/tasks`;

  const select = {
    id: true,
    taskNumber: true,
    title: true,
    status: true,
    priority: true,
    dueOn: true,
    progressPercent: true,
    completedAt: true,
    blockedReason: true,
    assignees: { select: { user: { select: { name: true } } } },
    _count: { select: { updates: true, attachments: true } },
  } as const;

  const [overdue, blocked, inReview, completed, updatedTasks] = await Promise.all([
    prisma.task.findMany({
      where: { dueOn: { lt: now }, status: { in: [...TASK_OPEN_STATUSES] } },
      orderBy: [{ dueOn: "asc" }],
      take: 25,
      select,
    }),
    prisma.task.findMany({
      where: { status: "BLOCKED" },
      orderBy: [{ updatedAt: "desc" }],
      take: 15,
      select,
    }),
    prisma.task.findMany({
      where: { status: "REVIEW" },
      orderBy: [{ updatedAt: "desc" }],
      take: 15,
      select,
    }),
    prisma.task.findMany({
      where: { status: "COMPLETED", completedAt: { gte: period.since } },
      orderBy: [{ completedAt: "desc" }],
      take: 25,
      select,
    }),
    // Tasks that saw a posted update in the window, excluding ones already listed
    // above — the same task appearing in four sections is noise, not thoroughness.
    prisma.task.findMany({
      where: {
        updates: { some: { createdAt: { gte: period.since } } },
        status: { notIn: ["COMPLETED", "BLOCKED", "REVIEW"] },
        OR: [{ dueOn: null }, { dueOn: { gte: now } }],
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 25,
      select,
    }),
  ]);

  const [newFiles, newComments] = await Promise.all([
    prisma.attachment.count({ where: { taskId: { not: null }, createdAt: { gte: period.since } } }),
    prisma.taskUpdate.count({ where: { createdAt: { gte: period.since } } }),
  ]);

  type Row = (typeof overdue)[number];

  const names = (task: Row) =>
    task.assignees.length === 0
      ? "Unassigned"
      : listSentence(task.assignees.map((entry) => entry.user.name.split(" ")[0]!));

  const toItem = (task: Row, detail: string) => ({
    taskNumber: task.taskNumber,
    title: task.title,
    assignees: names(task),
    detail,
    url: `${base}/${task.id}`,
  });

  const daysLate = (task: Row) =>
    task.dueOn ? Math.floor((now.getTime() - task.dueOn.getTime()) / 86_400_000) : 0;

  const sections: TaskDigestSection[] = [
    {
      heading: "Overdue",
      tone: "danger" as const,
      items: overdue.map((task) =>
        toItem(
          task,
          `${daysLate(task)} day${daysLate(task) === 1 ? "" : "s"} late · ${
            TASK_PRIORITY_LABEL[asTaskPriority(task.priority)]
          } · ${task.progressPercent}%`,
        ),
      ),
    },
    {
      heading: "Blocked",
      tone: "danger" as const,
      items: blocked.map((task) =>
        toItem(task, task.blockedReason ? truncateDetail(task.blockedReason) : "No reason given"),
      ),
    },
    {
      heading: "Waiting on review",
      tone: "warning" as const,
      items: inReview.map((task) =>
        toItem(
          task,
          task.dueOn ? `due ${formatDayShort(task.dueOn)}` : "no due date",
        ),
      ),
    },
    {
      heading: "Completed",
      tone: "success" as const,
      items: completed.map((task) =>
        toItem(task, task.completedAt ? `finished ${formatDayShort(task.completedAt)}` : "finished"),
      ),
    },
    {
      heading: "Updated",
      tone: "neutral" as const,
      items: updatedTasks.map((task) =>
        toItem(
          task,
          `${TASK_STATUS_LABEL[asTaskStatus(task.status)]} · ${task.progressPercent}%${
            task.dueOn ? ` · due ${formatDayShort(task.dueOn)}` : ""
          }`,
        ),
      ),
    },
  ].filter((section) => section.items.length > 0);

  const stats = {
    updated: updatedTasks.length,
    completed: completed.length,
    overdue: overdue.length,
    blocked: blocked.length,
    awaitingReview: inReview.length,
  };

  // Nothing moved and nothing is wrong: send no email rather than an empty one.
  const silent =
    sections.length === 0 && newFiles === 0 && newComments === 0;

  return silent ? null : { sections, stats };
}

function truncateDetail(value: string): string {
  return value.length > 90 ? `${value.slice(0, 87)}…` : value;
}
