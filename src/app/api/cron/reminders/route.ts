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
import { spawnRecurringTasks } from "@/server/actions/tasks";
import { dailyBriefingEmail } from "@/lib/email/templates";
import { buildDailyBriefing } from "@/lib/email/briefing";
import { isDigestOnly } from "@/lib/email/policy";
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

/**
 * Runs one part of the evening job, and does not let it take the others down.
 *
 * This job does seven unrelated things, and it used to be one long `await` chain — so the
 * first to throw ended the run. A numbering bug in the recurring-task spawner therefore
 * stopped the WhatsApp digest and the admin's briefing from going out at all, and the only
 * evidence was a 500 with somebody else's error in it. The reporting is the part the
 * client actually asked for; it must not depend on housekeeping succeeding.
 *
 * Each failure is logged with the step that produced it and surfaced in the response as a
 * `failed` list, so a partial run is visible rather than looking like a clean one.
 */
async function step<T>(name: string, fallback: T, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    failures.push(name);
    logger.error(`Cron step "${name}" failed`, error);
    return fallback;
  }
}

/** Steps that failed in the current run. Reset at the start of each request. */
let failures: string[] = [];

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
  failures = [];

  /**
   * `?force=1` runs the job on a day it would otherwise skip.
   *
   * Not a back door — it is still behind `CRON_SECRET`. It exists because the calendar
   * guard below makes the endpoint unexercisable at a weekend, which is exactly when you
   * want to confirm a fix before Monday's real run. It is also the "send it now" lever
   * after a cron has been missed.
   */
  const force = request.nextUrl.searchParams.get("force") === "1";

  if (!force) {
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
    const recurrence = await step("recurrence", { spawned: 0 }, spawnRecurringTasks);

    const [dsrResult, attendanceResult, prunedNotifications, prunedTokens, taskReminders] =
      await Promise.all([
        step("dsrEmails", { sent: 0, failed: 0, skipped: 0 }, () => sendBulkEmail(dsrEmails)),
        step("attendanceEmails", { sent: 0, failed: 0, skipped: 0 }, () => sendBulkEmail(attendanceEmails)),
        step("pruneNotifications", 0, () => pruneOldNotifications(60)),
        step("pruneTokens", 0, () => pruneExpiredTokens()),
        step("taskReminders", { dueSoon: 0, overdue: 0, emails: 0 }, sendTaskDeadlineReminders),
      ]);

    const briefings = await step("briefing", 0, sendDailyBriefing);

    /**
     * The order sweep runs last, and outside the Promise.all above, on purpose.
     *
     * It re-forecasts every open order and then sends the admin one WhatsApp summary —
     * which must reflect the state *after* today's recurring tasks were spawned and
     * today's reminders went out, not a snapshot from before.
     */
    const orders = await step(
      "orders",
      { recomputed: 0, newlyAtRisk: 0, delivered: 0, alertsSent: 0, digestSent: false, digestVia: "failed" as string },
      sweepOrders,
    );

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
      briefingsSent: briefings,
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
      // Empty on a clean run. Present so a half-finished job cannot read as a healthy one.
      failed: failures,
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
 * Sends the one end-of-day briefing to each manager and admin.
 *
 * ## Why this replaced the task-only digest
 *
 * The old digest covered tasks. But the admin also decides every leave request and every
 * expense claim, and owns every order — so a task report plus seven individual emails is
 * still seven too many. This is one email covering the whole business, ordered by what it
 * costs to ignore, and it is the counterpart of the `emailDigestOnly` preference: the
 * routine mail withheld during the day lands here instead.
 *
 * Unlike most of the other sends, a quiet day still gets one short email. Its absence would
 * be indistinguishable from a broken cron, and "I stopped getting them" is a much worse
 * failure than "today was quiet".
 */
async function sendDailyBriefing(): Promise<number> {
  const briefing = await buildDailyBriefing();

  // Managers get it too — they run a line and the same information is useful to them.
  const recipients = await prisma.user.findMany({
    where: { status: "ACTIVE", role: { in: ["ADMIN", "MANAGER"] }, notifyByEmail: true },
    select: { name: true, email: true, notifyByEmail: true, emailDigestOnly: true },
  });

  if (recipients.length === 0) return 0;

  const dateLabel = formatDayLong(today());

  const result = await sendBulkEmail(
    recipients.map((person) => ({
      to: person.email,
      content: dailyBriefingEmail({
        recipientName: person.name,
        dateLabel,
        sections: briefing.sections,
        stats: briefing.stats,
        dashboardUrl: `${env.NEXT_PUBLIC_APP_URL}/dashboard`,
        // Only explain the batching to people it applies to.
        digestOnly: isDigestOnly(person),
      }),
    })),
  );

  return result.sent;
}
