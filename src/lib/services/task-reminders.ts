import "server-only";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sendBulkEmail } from "@/lib/email/mailer";
import { taskDeadlineEmail } from "@/lib/email/templates";
import { notifyMany } from "@/lib/services/notifications";
import {
  TASK_OPEN_STATUSES,
  TASK_PRIORITY_LABEL,
  asTaskPriority,
} from "@/lib/constants/enums";
import { addDays, formatDayLong, today } from "@/lib/utils/date";

/**
 * Deadline and overdue reminders.
 *
 * ## Idempotency is a column, not a hope
 *
 * `dueSoonRemindedAt` and `overdueNotifiedAt` are stamped as each notice goes out, and
 * every query excludes rows already stamped. That is what makes the cron safe to run
 * twice — a retry after a partial failure sends the remainder rather than nagging
 * everybody again. Editing a task's due date clears both stamps, because a moved
 * deadline is a new reminder window.
 *
 * ## One email per person, not per task
 *
 * Someone with four overdue tasks gets four notifications in the tray — they are
 * separate things to act on — but the emails are paced through `sendBulkEmail` so a
 * busy morning does not trip Gmail's rate limit and lose the lot.
 */

export interface ReminderResult {
  dueSoon: number;
  overdue: number;
  emails: number;
}

export async function sendTaskDeadlineReminders(): Promise<ReminderResult> {
  const now = today();
  const tomorrow = addDays(now, 1);

  const select = {
    id: true,
    taskNumber: true,
    title: true,
    priority: true,
    dueOn: true,
    progressPercent: true,
    assignees: {
      select: {
        user: { select: { id: true, name: true, email: true, notifyByEmail: true } },
      },
    },
  } as const;

  const [dueTomorrow, late] = await Promise.all([
    prisma.task.findMany({
      where: {
        dueOn: tomorrow,
        status: { in: [...TASK_OPEN_STATUSES] },
        dueSoonRemindedAt: null,
      },
      select,
    }),
    prisma.task.findMany({
      where: {
        dueOn: { lt: now },
        status: { in: [...TASK_OPEN_STATUSES] },
        overdueNotifiedAt: null,
      },
      select,
    }),
  ]);

  const notifications: Parameters<typeof notifyMany>[0] = [];
  const emails: Parameters<typeof sendBulkEmail>[0] = [];

  for (const [tasks, overdue] of [
    [dueTomorrow, false],
    [late, true],
  ] as const) {
    for (const task of tasks) {
      if (!task.dueOn) continue;

      const daysLate = overdue
        ? Math.max(1, Math.floor((now.getTime() - task.dueOn.getTime()) / 86_400_000))
        : 0;

      for (const { user } of task.assignees) {
        notifications.push({
          userId: user.id,
          actorId: null,
          type: overdue ? "TASK_OVERDUE" : "TASK_DUE_SOON",
          title: overdue
            ? `${task.taskNumber} is ${daysLate} day${daysLate === 1 ? "" : "s"} overdue`
            : `${task.taskNumber} is due tomorrow`,
          body: task.title,
          href: `/tasks/${task.id}`,
        });

        if (!user.notifyByEmail) continue;

        const content = taskDeadlineEmail({
          assigneeName: user.name,
          taskNumber: task.taskNumber,
          title: task.title,
          priority: TASK_PRIORITY_LABEL[asTaskPriority(task.priority)],
          dueOn: formatDayLong(task.dueOn),
          overdue,
          daysLate,
          progressPercent: task.progressPercent,
          taskUrl: `${env.NEXT_PUBLIC_APP_URL}/tasks/${task.id}`,
        });

        emails.push({ to: user.email, content });
      }
    }
  }

  if (notifications.length > 0) await notifyMany(notifications);
  if (emails.length > 0) {
    const result = await sendBulkEmail(emails);
    if (result.failed > 0) {
      logger.warn("Some task reminder emails failed", {
        sent: result.sent,
        failed: result.failed,
      });
    }
  }

  // Stamp last: if the send throws, nothing is marked and the next run retries.
  await Promise.all([
    dueTomorrow.length > 0
      ? prisma.task.updateMany({
          where: { id: { in: dueTomorrow.map((task) => task.id) } },
          data: { dueSoonRemindedAt: new Date() },
        })
      : Promise.resolve(),
    late.length > 0
      ? prisma.task.updateMany({
          where: { id: { in: late.map((task) => task.id) } },
          data: { overdueNotifiedAt: new Date() },
        })
      : Promise.resolve(),
  ]);

  return { dueSoon: dueTomorrow.length, overdue: late.length, emails: emails.length };
}
