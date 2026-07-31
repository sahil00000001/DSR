import "server-only";
import { prisma } from "@/lib/db/prisma";
import { isManagerOrAdmin } from "@/lib/auth/rbac";
import type { SessionUser } from "@/lib/auth/session";
import type { NavCounts } from "@/components/layout/sidebar";
import { lastNDays, subDays, today, toDayKey, workingDaysIn } from "@/lib/utils/date";

/**
 * Counts for the navigation badges.
 *
 * Runs on every authenticated page load, so it's written as one batched
 * `$transaction` of narrow `count()` queries rather than fetching rows. The
 * numbers are scoped by role: a manager sees their own reporting line, an admin
 * sees the whole organisation, and an employee sees neither.
 */
export async function getNavCounts(user: SessionUser): Promise<NavCounts> {
  const scopeToReports = user.role === "MANAGER";
  const canReview = isManagerOrAdmin(user);

  const [unreadNotifications, dsrToReview, pendingLeave, openDsr, expensesToDecide] =
    await Promise.all([
      prisma.notification.count({ where: { userId: user.id, readAt: null } }),

      canReview
        ? prisma.dailyStatusReport.count({
            where: {
              status: "SUBMITTED",
              // Never count your own report as something for you to review.
              userId: { not: user.id },
              ...(scopeToReports ? { user: { managerId: user.id } } : {}),
            },
          })
        : Promise.resolve(0),

      canReview
        ? prisma.leaveRequest.count({
            where: {
              status: "PENDING",
              userId: { not: user.id },
              ...(scopeToReports ? { user: { managerId: user.id } } : {}),
            },
          })
        : Promise.resolve(0),

      countMissingReports(user.id),

      // Expenses are admin-only, and never your own claim — same separation as leave.
      user.role === "ADMIN"
        ? prisma.expenseClaim.count({
            where: { status: "SUBMITTED", userId: { not: user.id } },
          })
        : Promise.resolve(0),
    ]);

  return { unreadNotifications, dsrToReview, pendingLeave, openDsr, expensesToDecide };
}

/**
 * How many recent working days are still missing a report.
 *
 * Days the person was on approved leave, and public holidays, don't count as
 * missing — nagging someone for a report from a day they were off is exactly the
 * kind of detail that makes an internal tool feel careless.
 */
async function countMissingReports(userId: string, lookbackDays = 7): Promise<number> {
  const range = lastNDays(lookbackDays);

  const [holidays, reports, leaveDays] = await Promise.all([
    prisma.holiday.findMany({
      where: { date: { gte: range.start, lte: range.end } },
      select: { date: true },
    }),
    prisma.dailyStatusReport.findMany({
      where: {
        userId,
        date: { gte: range.start, lte: range.end },
        status: { in: ["SUBMITTED", "REVIEWED", "FLAGGED"] },
      },
      select: { date: true },
    }),
    prisma.attendance.findMany({
      where: {
        userId,
        date: { gte: range.start, lte: range.end },
        status: { in: ["LEAVE", "HOLIDAY"] },
      },
      select: { date: true },
    }),
  ]);

  const holidayKeys = new Set(holidays.map((holiday) => toDayKey(holiday.date)));
  const submitted = new Set(reports.map((report) => toDayKey(report.date)));
  const off = new Set(leaveDays.map((entry) => toDayKey(entry.date)));

  return workingDaysIn(range, holidayKeys).filter((day) => {
    const key = toDayKey(day);
    return !submitted.has(key) && !off.has(key);
  }).length;
}

/**
 * Consecutive working days with a submitted report, ending today or yesterday.
 * Powers the streak chip on the dashboard and in reminder emails — a small,
 * genuinely motivating number.
 */
export async function getReportStreak(userId: string, maxLookback = 60): Promise<number> {
  const end = today();
  const start = subDays(end, maxLookback);

  const [reports, holidays] = await Promise.all([
    prisma.dailyStatusReport.findMany({
      where: {
        userId,
        date: { gte: start, lte: end },
        status: { in: ["SUBMITTED", "REVIEWED", "FLAGGED"] },
      },
      select: { date: true },
    }),
    prisma.holiday.findMany({
      where: { date: { gte: start, lte: end } },
      select: { date: true },
    }),
  ]);

  const submitted = new Set(reports.map((report) => toDayKey(report.date)));
  const holidayKeys = new Set(holidays.map((holiday) => toDayKey(holiday.date)));

  const workingDays = workingDaysIn({ start, end }, holidayKeys).reverse();

  let streak = 0;
  for (const [index, day] of workingDays.entries()) {
    // Today doesn't break a streak if it isn't written yet — the day isn't over.
    if (index === 0 && !submitted.has(toDayKey(day))) continue;
    if (!submitted.has(toDayKey(day))) break;
    streak += 1;
  }

  return streak;
}
