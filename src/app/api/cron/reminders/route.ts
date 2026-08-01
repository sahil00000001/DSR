import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sendBulkEmail } from "@/lib/email/mailer";
import { attendanceReminderEmail, dsrReminderEmail } from "@/lib/email/templates";
import { notifyMany } from "@/lib/services/notifications";
import { pruneOldNotifications } from "@/lib/services/notifications";
import { pruneExpiredTokens } from "@/lib/auth/tokens";
import { recordSystemAudit } from "@/lib/services/audit";
import { getReportStreak } from "@/lib/services/shell";
import { sendTaskDeadlineReminders } from "@/lib/services/task-reminders";
import { buildTaskDigest } from "@/lib/services/task-digest";
import { spawnRecurringTasks } from "@/server/actions/tasks";
import { getTaskAdmins } from "@/lib/services/tasks";
import { taskDigestEmail } from "@/lib/email/templates";
import { subDays } from "@/lib/utils/date";
import { sweepOrders } from "@/lib/orders/sweep";
import { formatDayLong, isWeekend, toDayKey, today } from "@/lib/utils/date";

/**
 * Scheduled reminders and housekeeping.
 *
 * **Schedule: `30 12 * * 1-5` — 18:00 IST, Monday to Friday.** Declared in `vercel.json`,
 * repeated here because that file is JSON and cannot carry a comment.
 *
 * The companion run is `/api/cron/morning` at 09:00 IST. Two jobs is the Vercel Hobby
 * limit, so a third scheduled task needs Pro.
 *
 * Invoked by Vercel Cron (see vercel.json). Three properties matter:
 *
 *  • **Authenticated.** Vercel sends `Authorization: Bearer $CRON_SECRET`. Without
 *    that check, anyone who guesses the path could spam the whole team by email.
 *  • **Idempotent.** Safe to run twice: reminders are only sent to people with no
 *    submitted report for the day, so a retry after a partial failure sends the
 *    remainder rather than duplicating.
 *  • **Non-working days are skipped entirely** — nobody wants a Sunday nudge.
 */
export const runtime = "nodejs";
// Bulk email is paced, so allow more than the default 10s.
export const maxDuration = 60;

function isAuthorised(request: NextRequest): boolean {
  // Vercel Cron always sends the secret; a missing secret in the environment
  // means the endpoint stays closed rather than open.
  if (!env.CRON_SECRET) return false;
  return request.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const now = today();

  if (isWeekend(now)) {
    return NextResponse.json({ skipped: "weekend", date: toDayKey(now) });
  }

  const holiday = await prisma.holiday.findFirst({
    where: { date: now, type: { in: ["PUBLIC", "COMPANY"] } },
    select: { name: true },
  });
  if (holiday) {
    return NextResponse.json({ skipped: "holiday", holiday: holiday.name, date: toDayKey(now) });
  }

  try {
    const dateLabel = formatDayLong(now);

    // Everyone active who hasn't opted out and hasn't already filed today.
    const candidates = await prisma.user.findMany({
      where: {
        status: "ACTIVE",
        dsrReminderOptOut: false,
        // Not on approved leave today.
        attendance: { none: { date: now, status: { in: ["LEAVE", "HOLIDAY"] } } },
        reports_dsr: { none: { date: now, status: { in: ["SUBMITTED", "REVIEWED", "FLAGGED"] } } },
      },
      select: { id: true, name: true, email: true, notifyByEmail: true },
    });

    // Attendance nudge is a separate population: they may have filed a report
    // but still have no attendance record.
    const missingAttendance = await prisma.user.findMany({
      where: {
        status: "ACTIVE",
        attendance: { none: { date: now } },
      },
      select: { id: true, name: true, email: true, notifyByEmail: true },
    });

    await notifyMany(
      candidates.map((person) => ({
        userId: person.id,
        type: "DSR_REMINDER" as const,
        title: `Your status report for ${dateLabel} is still open`,
        body: "It usually takes about two minutes.",
        href: "/dsr/new",
      })),
    );

    // Streaks are per-person, so they're fetched alongside the email build.
    const dsrEmails = await Promise.all(
      candidates
        .filter((person) => person.notifyByEmail)
        .map(async (person) => ({
          to: person.email,
          content: dsrReminderEmail({
            name: person.name,
            dateLabel,
            composeUrl: `${env.NEXT_PUBLIC_APP_URL}/dsr/new`,
            streak: await getReportStreak(person.id),
          }),
        })),
    );

    const attendanceEmails = missingAttendance
      .filter((person) => person.notifyByEmail)
      .map((person) => ({
        to: person.email,
        content: attendanceReminderEmail({
          name: person.name,
          dateLabel,
          markUrl: `${env.NEXT_PUBLIC_APP_URL}/attendance`,
        }),
      }));

    // Recurring tasks are spawned *before* reminders run, so an occurrence created
    // this morning is included in today's deadline sweep rather than waiting a day.
    const recurrence = await spawnRecurringTasks();

    const [dsrResult, attendanceResult, prunedNotifications, prunedTokens, taskReminders] =
      await Promise.all([
        sendBulkEmail(dsrEmails),
        sendBulkEmail(attendanceEmails),
        pruneOldNotifications(60),
        pruneExpiredTokens(),
        sendTaskDeadlineReminders(),
      ]);

    const digest = await sendTaskDigest();

    /**
     * The order sweep runs last, and outside the Promise.all above, on purpose.
     *
     * It re-forecasts every open order and then sends the admin one WhatsApp summary —
     * which must reflect the state *after* today's recurring tasks were spawned and
     * today's reminders went out, not a snapshot from before.
     */
    const orders = await sweepOrders();

    const summary = {
      date: toDayKey(now),
      dsrReminders: candidates.length,
      dsrEmailsSent: dsrResult.sent,
      attendanceReminders: missingAttendance.length,
      attendanceEmailsSent: attendanceResult.sent,
      tasksSpawned: recurrence.spawned,
      taskDueSoon: taskReminders.dueSoon,
      taskOverdue: taskReminders.overdue,
      taskReminderEmails: taskReminders.emails,
      digestsSent: digest,
      orders: {
        recomputed: orders.recomputed,
        newlyAtRisk: orders.newlyAtRisk,
        delivered: orders.delivered,
        alertsSent: orders.alertsSent,
        summarySent: orders.digestSent,
        summaryVia: orders.digestVia,
      },
      prunedNotifications,
      prunedTokens,
    };

    await recordSystemAudit({ action: "cron.reminders", entity: "system", meta: summary });
    logger.info("Cron reminders complete", summary);

    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    logger.error("Cron reminders failed", error);
    return NextResponse.json({ error: "Reminder job failed" }, { status: 500 });
  }
}

/**
 * Sends the grouped task report to each admin.
 *
 * The window is the last 24 hours, matching the daily cron. Sending nothing when
 * nothing happened is deliberate: a digest that arrives every evening saying "no
 * changes" trains people to delete it unread, which is exactly the failure the digest
 * exists to avoid.
 */
async function sendTaskDigest(): Promise<number> {
  const digest = await buildTaskDigest({
    since: subDays(today(), 1),
    label: formatDayLong(today()),
  });
  if (!digest) return 0;

  const admins = (await getTaskAdmins()).filter((admin) => admin.notifyByEmail);
  if (admins.length === 0) return 0;

  const result = await sendBulkEmail(
    admins.map((admin) => ({
      to: admin.email,
      content: taskDigestEmail({
        recipientName: admin.name,
        periodLabel: formatDayLong(today()),
        sections: digest.sections,
        stats: digest.stats,
        dashboardUrl: `${env.NEXT_PUBLIC_APP_URL}/tasks`,
      }),
    })),
  );

  return result.sent;
}
