import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Actor } from "@/lib/auth/rbac";
import { percentage } from "@/lib/utils/format";
import {
  differenceInDays,
  endOfWeek,
  lastNDays,
  startOfWeek,
  subDays,
  toDayKey,
  today,
  workingDaysIn,
  type DayRange,
} from "@/lib/utils/date";
import { getCompletionByEmployee, getCompletionTrend } from "@/lib/services/dsr";
import { getAttendanceTrend, getTodaySnapshot } from "@/lib/services/attendance";
import { getLeaveTrend } from "@/lib/services/leave";

/**
 * Analytics aggregation.
 *
 * Every figure here is derived from the operational tables — there is no
 * pre-computed metrics store to drift out of sync. At this data volume
 * (20 people × a year of days) that's the right call: correctness for free, and
 * still a handful of indexed queries.
 *
 * Where a metric is compared to a previous period, the two windows are always the
 * *same length*, so "vs last week" means what it says.
 */

/** Restricts aggregate queries to a manager's own reporting line. */
function scope(actor: Actor) {
  return actor.role === "MANAGER"
    ? { user: { OR: [{ managerId: actor.id }, { id: actor.id }] } }
    : {};
}

// ---------------------------------------------------------------------------
//  Dashboard
// ---------------------------------------------------------------------------

export interface DashboardData {
  today: Awaited<ReturnType<typeof getTodaySnapshot>>;
  headcount: number;
  pendingLeave: number;
  dsrToday: { submitted: number; expected: number; rate: number };
  dsrDelta: number;
  hoursThisWeek: number;
  hoursLastWeek: number;
  completionTrend: Array<{ date: string; submitted: number; expected: number; hours: number }>;
  attendanceTrend: Awaited<ReturnType<typeof getAttendanceTrend>>;
  departmentActivity: DepartmentActivityRow[];
  topContributors: ContributorRow[];
  recentActivity: ActivityEntry[];
  weekRange: DayRange;
}

export async function getDashboardData(actor: Actor): Promise<DashboardData> {
  const now = today();
  const thisWeek: DayRange = { start: startOfWeek(now), end: endOfWeek(now) };
  const lastWeek: DayRange = { start: subDays(thisWeek.start, 7), end: subDays(thisWeek.start, 1) };
  const trailing30 = lastNDays(30, now);

  const [
    snapshot,
    headcount,
    pendingLeave,
    submittedToday,
    submittedYesterday,
    hoursThisWeek,
    hoursLastWeek,
    completionTrend,
    attendanceTrend,
    departmentActivity,
    topContributors,
    recentActivity,
  ] = await Promise.all([
    getTodaySnapshot(actor),
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.leaveRequest.count({
      where: {
        status: "PENDING",
        userId: { not: actor.id },
        ...(actor.role === "MANAGER" ? { user: { managerId: actor.id } } : {}),
      },
    }),
    prisma.dailyStatusReport.count({
      where: { date: now, status: { in: ["SUBMITTED", "REVIEWED", "FLAGGED"] }, ...scope(actor) },
    }),
    prisma.dailyStatusReport.count({
      where: {
        date: subDays(now, 1),
        status: { in: ["SUBMITTED", "REVIEWED", "FLAGGED"] },
        ...scope(actor),
      },
    }),
    sumHours(thisWeek, actor),
    sumHours(lastWeek, actor),
    getCompletionTrend(trailing30, actor),
    getAttendanceTrend(lastNDays(21, now), actor),
    getDepartmentActivity(trailing30, actor),
    getTopContributors(trailing30, actor, 6),
    getRecentActivity(actor, 8),
  ]);

  const expectedToday = snapshot.isNonWorkingDay
    ? 0
    : snapshot.total - snapshot.counts.LEAVE - snapshot.counts.HOLIDAY;

  return {
    today: snapshot,
    headcount,
    pendingLeave,
    dsrToday: {
      submitted: submittedToday,
      expected: Math.max(0, expectedToday),
      rate: percentage(submittedToday, Math.max(1, expectedToday)),
    },
    dsrDelta: submittedToday - submittedYesterday,
    hoursThisWeek,
    hoursLastWeek,
    completionTrend,
    attendanceTrend,
    departmentActivity,
    topContributors,
    recentActivity,
    weekRange: thisWeek,
  };
}

async function sumHours(range: DayRange, actor: Actor): Promise<number> {
  const result = await prisma.dailyStatusReport.aggregate({
    where: {
      date: { gte: range.start, lte: range.end },
      status: { in: ["SUBMITTED", "REVIEWED", "FLAGGED"] },
      ...scope(actor),
    },
    _sum: { hoursWorked: true },
  });
  return Math.round((result._sum.hoursWorked ?? 0) * 10) / 10;
}

// ---------------------------------------------------------------------------
//  Department & contributor breakdowns
// ---------------------------------------------------------------------------

export interface DepartmentActivityRow {
  id: string;
  name: string;
  color: string;
  headcount: number;
  reports: number;
  hours: number;
  completionRate: number;
  avgHoursPerReport: number;
}

export async function getDepartmentActivity(
  range: DayRange,
  actor: Actor,
): Promise<DepartmentActivityRow[]> {
  const [departments, holidays] = await Promise.all([
    prisma.department.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        color: true,
        members: {
          where: {
            status: "ACTIVE",
            ...(actor.role === "MANAGER" ? { OR: [{ managerId: actor.id }, { id: actor.id }] } : {}),
          },
          select: {
            id: true,
            joinedAt: true,
            reports_dsr: {
              where: {
                date: { gte: range.start, lte: range.end },
                status: { in: ["SUBMITTED", "REVIEWED", "FLAGGED"] },
              },
              select: { hoursWorked: true },
            },
          },
        },
      },
    }),
    prisma.holiday.findMany({
      where: { date: { gte: range.start, lte: range.end } },
      select: { date: true },
    }),
  ]);

  const workingDays = workingDaysIn(
    range,
    new Set(holidays.map((holiday) => toDayKey(holiday.date))),
  );

  return departments
    // A manager's view drops departments with nobody in their line.
    .filter((department) => department.members.length > 0)
    .map((department) => {
      const reports = department.members.reduce(
        (total, member) => total + member.reports_dsr.length,
        0,
      );
      const hours = department.members.reduce(
        (total, member) =>
          total + member.reports_dsr.reduce((sum, report) => sum + report.hoursWorked, 0),
        0,
      );
      const expected = department.members.reduce(
        (total, member) =>
          total + workingDays.filter((day) => day >= member.joinedAt).length,
        0,
      );

      return {
        id: department.id,
        name: department.name,
        color: department.color,
        headcount: department.members.length,
        reports,
        hours: Math.round(hours * 10) / 10,
        completionRate: expected === 0 ? 0 : Math.min(100, Math.round((reports / expected) * 100)),
        avgHoursPerReport: reports === 0 ? 0 : Math.round((hours / reports) * 10) / 10,
      };
    });
}

export interface ContributorRow {
  id: string;
  name: string;
  avatarUrl: string | null;
  department: string | null;
  reports: number;
  hours: number;
  streak: number;
}

/**
 * Most active contributors.
 *
 * Ranked by reports filed, then hours — deliberately *not* by hours alone, which
 * would reward whoever types the biggest number into a self-reported field.
 */
export async function getTopContributors(
  range: DayRange,
  actor: Actor,
  limit = 8,
): Promise<ContributorRow[]> {
  const rows = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      ...(actor.role === "MANAGER" ? { OR: [{ managerId: actor.id }, { id: actor.id }] } : {}),
    },
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      department: { select: { name: true } },
      reports_dsr: {
        where: {
          date: { gte: range.start, lte: range.end },
          status: { in: ["SUBMITTED", "REVIEWED", "FLAGGED"] },
        },
        orderBy: { date: "desc" },
        select: { date: true, hoursWorked: true },
      },
    },
  });

  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      avatarUrl: row.avatarUrl,
      department: row.department?.name ?? null,
      reports: row.reports_dsr.length,
      hours: Math.round(row.reports_dsr.reduce((sum, r) => sum + r.hoursWorked, 0) * 10) / 10,
      streak: countStreak(row.reports_dsr.map((report) => report.date)),
    }))
    .filter((row) => row.reports > 0)
    .sort((a, b) => b.reports - a.reports || b.hours - a.hours)
    .slice(0, limit);
}

/** Consecutive-day streak from a descending list of report dates. */
function countStreak(dates: Date[]): number {
  if (dates.length === 0) return 0;

  let streak = 1;
  for (let index = 1; index < dates.length; index += 1) {
    const gap = differenceInDays(dates[index]!, dates[index - 1]!);
    // A gap of 1 day is consecutive; 2–3 days bridges a weekend.
    if (gap === 1 || gap <= 3) streak += 1;
    else break;
  }
  return streak;
}

// ---------------------------------------------------------------------------
//  Activity feed
// ---------------------------------------------------------------------------

export interface ActivityEntry {
  id: string;
  kind: "DSR" | "LEAVE" | "ANNOUNCEMENT" | "JOIN";
  at: Date;
  actor: { id: string; name: string; avatarUrl: string | null };
  summary: string;
  href: string;
  tone: "neutral" | "success" | "warning" | "danger" | "info" | "accent";
}

/**
 * Cross-module activity feed.
 *
 * Assembled from three narrow queries and merged in memory rather than from the
 * audit log: the audit log records *changes* (including internal ones), whereas
 * this answers "what has the team been doing", which is a different question and
 * a much smaller set of event types.
 */
export async function getRecentActivity(actor: Actor, limit = 10): Promise<ActivityEntry[]> {
  const since = subDays(today(), 14);

  const [reports, leave, announcements, joiners] = await Promise.all([
    prisma.dailyStatusReport.findMany({
      where: { submittedAt: { not: null, gte: since }, ...scope(actor) },
      orderBy: { submittedAt: "desc" },
      take: limit,
      select: {
        id: true,
        submittedAt: true,
        hoursWorked: true,
        date: true,
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
    }),
    prisma.leaveRequest.findMany({
      where: {
        updatedAt: { gte: since },
        ...(actor.role === "MANAGER" ? { user: { managerId: actor.id } } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true,
        status: true,
        type: true,
        days: true,
        updatedAt: true,
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
    }),
    prisma.announcement.findMany({
      where: { publishedAt: { gte: since } },
      orderBy: { publishedAt: "desc" },
      take: 3,
      select: {
        id: true,
        title: true,
        publishedAt: true,
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    }),
    prisma.user.findMany({
      where: { joinedAt: { gte: since } },
      orderBy: { joinedAt: "desc" },
      take: 3,
      select: { id: true, name: true, avatarUrl: true, joinedAt: true, designation: true },
    }),
  ]);

  const entries: ActivityEntry[] = [
    ...reports.map((report) => ({
      id: `dsr-${report.id}`,
      kind: "DSR" as const,
      at: report.submittedAt!,
      actor: report.user,
      summary: `submitted a status report (${report.hoursWorked}h)`,
      href: `/dsr/${report.id}`,
      tone: "info" as const,
    })),
    ...leave.map((request) => ({
      id: `leave-${request.id}`,
      kind: "LEAVE" as const,
      at: request.updatedAt,
      actor: request.user,
      summary:
        request.status === "PENDING"
          ? `requested ${request.days} day(s) of ${request.type.toLowerCase()} leave`
          : `had ${request.days} day(s) of leave ${request.status.toLowerCase()}`,
      href: `/leave/${request.id}`,
      tone:
        request.status === "APPROVED"
          ? ("success" as const)
          : request.status === "REJECTED"
            ? ("danger" as const)
            : ("warning" as const),
    })),
    ...announcements.map((announcement) => ({
      id: `announcement-${announcement.id}`,
      kind: "ANNOUNCEMENT" as const,
      at: announcement.publishedAt,
      actor: announcement.author,
      summary: `posted “${announcement.title}”`,
      href: `/announcements`,
      tone: "accent" as const,
    })),
    ...joiners.map((person) => ({
      id: `join-${person.id}`,
      kind: "JOIN" as const,
      at: person.joinedAt,
      actor: { id: person.id, name: person.name, avatarUrl: person.avatarUrl },
      summary: person.designation ? `joined as ${person.designation}` : "joined the team",
      href: `/employees/${person.id}`,
      tone: "success" as const,
    })),
  ];

  return entries.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

// ---------------------------------------------------------------------------
//  Analytics page
// ---------------------------------------------------------------------------

export interface AnalyticsData {
  range: DayRange;
  completionTrend: Awaited<ReturnType<typeof getCompletionTrend>>;
  attendanceTrend: Awaited<ReturnType<typeof getAttendanceTrend>>;
  leaveTrend: Awaited<ReturnType<typeof getLeaveTrend>>;
  departmentActivity: DepartmentActivityRow[];
  contributors: ContributorRow[];
  completion: Awaited<ReturnType<typeof getCompletionByEmployee>>;
  totals: {
    reports: number;
    hours: number;
    avgHoursPerDay: number;
    completionRate: number;
    leaveDays: number;
    activePeople: number;
  };
}

export async function getAnalyticsData(range: DayRange, actor: Actor): Promise<AnalyticsData> {
  const [completionTrend, attendanceTrend, leaveTrend, departmentActivity, contributors, completion] =
    await Promise.all([
      getCompletionTrend(range, actor),
      getAttendanceTrend(range, actor),
      getLeaveTrend(range, actor),
      getDepartmentActivity(range, actor),
      getTopContributors(range, actor, 10),
      getCompletionByEmployee(range, actor),
    ]);

  const reports = completion.reduce((sum, row) => sum + row.submitted, 0);
  const expected = completion.reduce((sum, row) => sum + row.expected, 0);
  const hours = Math.round(completion.reduce((sum, row) => sum + row.totalHours, 0) * 10) / 10;
  const leaveDays =
    Math.round(
      leaveTrend.reduce(
        (sum, month) => sum + month.casual + month.sick + month.earned + month.unpaid,
        0,
      ) * 10,
    ) / 10;

  return {
    range,
    completionTrend,
    attendanceTrend,
    leaveTrend,
    departmentActivity,
    contributors,
    completion,
    totals: {
      reports,
      hours,
      avgHoursPerDay: reports === 0 ? 0 : Math.round((hours / reports) * 10) / 10,
      completionRate: expected === 0 ? 0 : Math.min(100, Math.round((reports / expected) * 100)),
      leaveDays,
      activePeople: completion.filter((row) => row.submitted > 0).length,
    },
  };
}
