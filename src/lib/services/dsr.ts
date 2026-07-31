import "server-only";
import type { Prisma } from "@prisma/client";
import { containsInsensitive, prisma } from "@/lib/db/prisma";
import { isManagerOrAdmin, type Actor } from "@/lib/auth/rbac";
import {
  asDsrStatus,
  type DsrStatus,
} from "@/lib/constants/enums";
import { markdownToText } from "@/lib/utils/markdown";
import { truncate } from "@/lib/utils/format";
import {
  endOfMonth,
  endOfWeek,
  lastNDays,
  parseDayKey,
  startOfMonth,
  startOfWeek,
  subDays,
  toDayKey,
  today,
  workingDaysIn,
  type DayRange,
} from "@/lib/utils/date";
import type { DsrFilterInput } from "@/lib/validation/schemas";
import type { DsrDto } from "@/types/dsr";

/**
 * Daily status report reads.
 *
 * Writes live in `src/server/actions/dsr.ts`; this module is query-only, which
 * keeps the "what can this person see" logic in one place. Every list function
 * takes an `Actor` and applies role scoping itself rather than trusting the
 * caller to have filtered.
 */

/**
 * The record shape is declared in `@/types/dsr` so client components can consume
 * it without importing this server-only module. Re-exported here for callers
 * already working against the service.
 */
export type { DsrAuthorDto as DsrAuthor, DsrDto as DsrRecord } from "@/types/dsr";

// A re-export doesn't create a local binding, so the imported name is aliased
// here for the signatures below.
type DsrRecord = DsrDto;

const AUTHOR_SELECT = {
  id: true,
  name: true,
  employeeCode: true,
  avatarUrl: true,
  designation: true,
  department: { select: { id: true, name: true, color: true } },
  team: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
  manager: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;

const DSR_SELECT = {
  id: true,
  date: true,
  status: true,
  tasksCompleted: true,
  blockers: true,
  nextSteps: true,
  notes: true,
  hoursWorked: true,
  submittedAt: true,
  reviewedAt: true,
  reviewComment: true,
  reviewedBy: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
  user: { select: AUTHOR_SELECT },
} satisfies Prisma.DailyStatusReportSelect;

type RawDsr = Prisma.DailyStatusReportGetPayload<{ select: typeof DSR_SELECT }>;

function toRecord(row: RawDsr): DsrRecord {
  const { user, ...rest } = row;
  return { ...rest, status: asDsrStatus(row.status), author: user };
}

// ---------------------------------------------------------------------------
//  Single report
// ---------------------------------------------------------------------------

export async function getDsrById(id: string): Promise<DsrRecord | null> {
  const row = await prisma.dailyStatusReport.findUnique({ where: { id }, select: DSR_SELECT });
  return row ? toRecord(row) : null;
}

export async function getDsrForDate(userId: string, day: Date): Promise<DsrRecord | null> {
  const row = await prisma.dailyStatusReport.findUnique({
    // The composite unique is what makes "one report per person per day" a
    // database guarantee rather than an application convention.
    where: { userId_date: { userId, date: day } },
    select: DSR_SELECT,
  });
  return row ? toRecord(row) : null;
}

// ---------------------------------------------------------------------------
//  Personal history
// ---------------------------------------------------------------------------

export async function listMyReports(
  userId: string,
  { page = 1, pageSize = 20, range }: { page?: number; pageSize?: number; range?: DayRange } = {},
): Promise<{ rows: DsrRecord[]; total: number }> {
  const where: Prisma.DailyStatusReportWhereInput = {
    userId,
    ...(range ? { date: { gte: range.start, lte: range.end } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.dailyStatusReport.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: DSR_SELECT,
    }),
    prisma.dailyStatusReport.count({ where }),
  ]);

  return { rows: rows.map(toRecord), total };
}

// ---------------------------------------------------------------------------
//  Review board
// ---------------------------------------------------------------------------

/** Resolves the named window (`?range=week`) into concrete dates. */
export function resolveDateRange(filters: Pick<DsrFilterInput, "range" | "from" | "to">): DayRange {
  const now = today();

  switch (filters.range) {
    case "today":
      return { start: now, end: now };
    case "yesterday": {
      const yesterday = subDays(now, 1);
      return { start: yesterday, end: yesterday };
    }
    case "week":
      return { start: startOfWeek(now), end: endOfWeek(now) };
    case "last-week": {
      const lastWeek = subDays(startOfWeek(now), 7);
      return { start: lastWeek, end: endOfWeek(lastWeek) };
    }
    case "month":
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case "last-30":
      return lastNDays(30, now);
    case "custom":
    default: {
      const start = filters.from ? parseDayKey(filters.from) : lastNDays(14, now).start;
      const end = filters.to ? parseDayKey(filters.to) : now;
      // A reversed range is a UI slip, not an error worth showing — swap it.
      return start <= end ? { start, end } : { start: end, end: start };
    }
  }
}

/**
 * Translates the filter object into a Prisma `where`, including the actor's own
 * visibility scope.
 */
function buildBoardWhere(filters: DsrFilterInput, actor: Actor): Prisma.DailyStatusReportWhereInput {
  const range = resolveDateRange(filters);

  const userWhere: Prisma.UserWhereInput = {
    ...(filters.department.length ? { departmentId: { in: filters.department } } : {}),
    ...(filters.team.length ? { teamId: { in: filters.team } } : {}),
    ...(filters.location.length ? { locationId: { in: filters.location } } : {}),
    ...(filters.manager.length ? { managerId: { in: filters.manager } } : {}),
    // A manager's board is scoped to their own reporting line.
    ...(actor.role === "MANAGER" ? { OR: [{ managerId: actor.id }, { id: actor.id }] } : {}),
  };

  const search = filters.q?.trim();

  return {
    date: { gte: range.start, lte: range.end },
    ...(filters.employee.length ? { userId: { in: filters.employee } } : {}),
    ...(filters.status.length ? { status: { in: filters.status } } : {}),
    // Employees only ever see their own, whatever else the URL asks for.
    ...(isManagerOrAdmin(actor) ? {} : { userId: actor.id }),
    ...(Object.keys(userWhere).length ? { user: userWhere } : {}),
    ...(search
      ? {
          OR: [
            { tasksCompleted: containsInsensitive(search) },
            { blockers: containsInsensitive(search) },
            { nextSteps: containsInsensitive(search) },
            { notes: containsInsensitive(search) },
            { user: { name: containsInsensitive(search) } },
            { user: { employeeCode: containsInsensitive(search) } },
          ],
        }
      : {}),
  };
}

const SORT_MAP: Record<
  NonNullable<DsrFilterInput["sort"]>,
  Prisma.DailyStatusReportOrderByWithRelationInput[]
> = {
  "date-desc": [{ date: "desc" }, { user: { name: "asc" } }],
  "date-asc": [{ date: "asc" }, { user: { name: "asc" } }],
  "name-asc": [{ user: { name: "asc" } }, { date: "desc" }],
  "hours-desc": [{ hoursWorked: "desc" }, { date: "desc" }],
};

export interface DsrBoardResult {
  rows: DsrRecord[];
  total: number;
  range: DayRange;
  /** Aggregates over the *whole* filtered set, not just the current page. */
  summary: {
    totalHours: number;
    byStatus: Record<DsrStatus, number>;
    contributors: number;
  };
}

export async function listDsrBoard(
  filters: DsrFilterInput,
  actor: Actor,
): Promise<DsrBoardResult> {
  const where = buildBoardWhere(filters, actor);
  const range = resolveDateRange(filters);
  const page = filters.page ?? 1;
  const pageSize = filters.size ?? 25;

  const [rows, total, statusGroups, aggregate, contributors] = await Promise.all([
    prisma.dailyStatusReport.findMany({
      where,
      orderBy: SORT_MAP[filters.sort ?? "date-desc"],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: DSR_SELECT,
    }),
    prisma.dailyStatusReport.count({ where }),
    prisma.dailyStatusReport.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.dailyStatusReport.aggregate({ where, _sum: { hoursWorked: true } }),
    prisma.dailyStatusReport.findMany({ where, distinct: ["userId"], select: { userId: true } }),
  ]);

  const byStatus: Record<DsrStatus, number> = {
    DRAFT: 0,
    SUBMITTED: 0,
    REVIEWED: 0,
    FLAGGED: 0,
  };
  for (const group of statusGroups) {
    byStatus[asDsrStatus(group.status)] = group._count._all;
  }

  return {
    rows: rows.map(toRecord),
    total,
    range,
    summary: {
      totalHours: aggregate._sum.hoursWorked ?? 0,
      byStatus,
      contributors: contributors.length,
    },
  };
}

/** Every row in the current filter, for export. Capped to protect the runtime. */
export async function listDsrForExport(
  filters: DsrFilterInput,
  actor: Actor,
  limit = 5000,
): Promise<DsrRecord[]> {
  const rows = await prisma.dailyStatusReport.findMany({
    where: buildBoardWhere(filters, actor),
    orderBy: SORT_MAP[filters.sort ?? "date-desc"],
    take: limit,
    select: DSR_SELECT,
  });
  return rows.map(toRecord);
}

// ---------------------------------------------------------------------------
//  Completion analytics
// ---------------------------------------------------------------------------

export interface CompletionRow {
  user: { id: string; name: string; avatarUrl: string | null; department: string | null };
  expected: number;
  submitted: number;
  rate: number;
  totalHours: number;
  lastSubmittedAt: Date | null;
}

/**
 * "Who is actually filing reports" — the question managers open this product to
 * answer.
 *
 * `expected` counts working days minus public holidays minus each person's own
 * approved leave, so someone who was away for a week isn't shown as delinquent.
 * That per-person adjustment is why this can't be a single `groupBy`.
 */
export async function getCompletionByEmployee(
  range: DayRange,
  actor: Actor,
): Promise<CompletionRow[]> {
  const userWhere: Prisma.UserWhereInput = {
    status: "ACTIVE",
    ...(actor.role === "MANAGER" ? { OR: [{ managerId: actor.id }, { id: actor.id }] } : {}),
  };

  const [users, holidays, reports, leaveDays] = await Promise.all([
    prisma.user.findMany({
      where: userWhere,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        joinedAt: true,
        department: { select: { name: true } },
      },
    }),
    prisma.holiday.findMany({
      where: { date: { gte: range.start, lte: range.end } },
      select: { date: true },
    }),
    prisma.dailyStatusReport.groupBy({
      by: ["userId"],
      where: {
        date: { gte: range.start, lte: range.end },
        status: { in: ["SUBMITTED", "REVIEWED", "FLAGGED"] },
      },
      _count: { _all: true },
      _sum: { hoursWorked: true },
      _max: { submittedAt: true },
    }),
    prisma.attendance.findMany({
      where: {
        date: { gte: range.start, lte: range.end },
        status: { in: ["LEAVE", "HOLIDAY"] },
      },
      select: { userId: true, date: true },
    }),
  ]);

  const holidayKeys = new Set(holidays.map((holiday) => toDayKey(holiday.date)));
  const allWorkingDays = workingDaysIn(range, holidayKeys);

  const offByUser = new Map<string, Set<string>>();
  for (const entry of leaveDays) {
    const set = offByUser.get(entry.userId) ?? new Set<string>();
    set.add(toDayKey(entry.date));
    offByUser.set(entry.userId, set);
  }

  const submittedByUser = new Map(reports.map((report) => [report.userId, report]));

  return users.map((user) => {
    const off = offByUser.get(user.id) ?? new Set<string>();
    const expected = allWorkingDays.filter(
      // Not expected before they joined, and not while they were away.
      (day) => day >= user.joinedAt && !off.has(toDayKey(day)),
    ).length;

    const stats = submittedByUser.get(user.id);
    const submitted = stats?._count._all ?? 0;

    return {
      user: {
        id: user.id,
        name: user.name,
        avatarUrl: user.avatarUrl,
        department: user.department?.name ?? null,
      },
      expected,
      submitted,
      // Capped at 100: back-filling two reports in one day shouldn't read as 120%.
      rate: expected === 0 ? 100 : Math.min(100, Math.round((submitted / expected) * 100)),
      totalHours: stats?._sum.hoursWorked ?? 0,
      lastSubmittedAt: stats?._max.submittedAt ?? null,
    };
  });
}

/** Daily submitted/expected series for the trend chart. */
export async function getCompletionTrend(
  range: DayRange,
  actor: Actor,
): Promise<Array<{ date: string; submitted: number; expected: number; hours: number }>> {
  const [activeUsers, holidays, reports] = await Promise.all([
    prisma.user.count({
      where: {
        status: "ACTIVE",
        ...(actor.role === "MANAGER" ? { OR: [{ managerId: actor.id }, { id: actor.id }] } : {}),
      },
    }),
    prisma.holiday.findMany({
      where: { date: { gte: range.start, lte: range.end } },
      select: { date: true },
    }),
    prisma.dailyStatusReport.groupBy({
      by: ["date"],
      where: {
        date: { gte: range.start, lte: range.end },
        status: { in: ["SUBMITTED", "REVIEWED", "FLAGGED"] },
        ...(actor.role === "MANAGER" ? { user: { OR: [{ managerId: actor.id }, { id: actor.id }] } } : {}),
      },
      _count: { _all: true },
      _sum: { hoursWorked: true },
    }),
  ]);

  const holidayKeys = new Set(holidays.map((holiday) => toDayKey(holiday.date)));
  const byDate = new Map(reports.map((report) => [toDayKey(report.date), report]));

  return workingDaysIn(range, holidayKeys).map((day) => {
    const key = toDayKey(day);
    const stats = byDate.get(key);
    return {
      date: key,
      submitted: stats?._count._all ?? 0,
      expected: activeUsers,
      hours: Math.round((stats?._sum.hoursWorked ?? 0) * 10) / 10,
    };
  });
}

/** Short preview for cards, tables and the command palette. */
export function dsrExcerpt(report: Pick<DsrRecord, "tasksCompleted">, length = 130): string {
  return truncate(markdownToText(report.tasksCompleted), length);
}
