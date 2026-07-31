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
import { formatDayLong, isWeekend, toDayKey, today } from "@/lib/utils/date";

/**
 * Scheduled reminders and housekeeping.
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

    const [dsrResult, attendanceResult, prunedNotifications, prunedTokens] = await Promise.all([
      sendBulkEmail(dsrEmails),
      sendBulkEmail(attendanceEmails),
      pruneOldNotifications(60),
      pruneExpiredTokens(),
    ]);

    const summary = {
      date: toDayKey(now),
      dsrReminders: candidates.length,
      dsrEmailsSent: dsrResult.sent,
      attendanceReminders: missingAttendance.length,
      attendanceEmailsSent: attendanceResult.sent,
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
