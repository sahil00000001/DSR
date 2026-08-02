import "server-only";
import type { Prisma } from "@prisma/client";
import { containsInsensitive, prisma } from "@/lib/db/prisma";
import { isManagerOrAdmin, type Actor } from "@/lib/auth/rbac";
import {
  asLeaveStatus,
  asLeaveType,
  BALANCED_LEAVE_TYPES,
  DEFAULT_LEAVE_ALLOCATION,
  type BalancedLeaveType,
  type LeaveStatus,
  type LeaveType,
} from "@/lib/constants/enums";
import { countWorkingDays, eachDay, toDayKey, today, type DayRange } from "@/lib/utils/date";

/**
 * Leave management.
 *
 * Two rules define the model:
 *
 *  • **Duration is measured in working days.** Requesting Friday→Monday costs two
 *    days, not four. Weekends and public holidays never consume balance.
 *  • **Pending requests reserve balance.** A `pending` column sits alongside
 *    `used`, so someone can't get two overlapping requests approved that together
 *    exceed their entitlement. Approval moves days from `pending` to `used`;
 *    rejection or cancellation releases them.
 */

export interface LeaveBalanceRow {
  type: BalancedLeaveType;
  allocated: number;
  used: number;
  pending: number;
  available: number;
}

export interface LeaveRequestRecord {
  id: string;
  type: LeaveType;
  status: LeaveStatus;
  startDate: Date;
  endDate: Date;
  days: number;
  halfDay: boolean;
  reason: string;
  decisionNote: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  user: {
    id: string;
    name: string;
    employeeCode: string;
    avatarUrl: string | null;
    email: string;
    department: { id: string; name: string; color: string } | null;
    manager: { id: string; name: string; email: string } | null;
  };
  decidedBy: { id: string; name: string } | null;
}

const LEAVE_SELECT = {
  id: true,
  type: true,
  status: true,
  startDate: true,
  endDate: true,
  days: true,
  halfDay: true,
  reason: true,
  decisionNote: true,
  decidedAt: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      name: true,
      employeeCode: true,
      avatarUrl: true,
      email: true,
      department: { select: { id: true, name: true, color: true } },
      manager: { select: { id: true, name: true, email: true } },
    },
  },
  decidedBy: { select: { id: true, name: true } },
} satisfies Prisma.LeaveRequestSelect;

type RawLeave = Prisma.LeaveRequestGetPayload<{ select: typeof LEAVE_SELECT }>;

function toRecord(row: RawLeave): LeaveRequestRecord {
  return { ...row, type: asLeaveType(row.type), status: asLeaveStatus(row.status) };
}

// ---------------------------------------------------------------------------
//  Duration
// ---------------------------------------------------------------------------

/** Holiday keys in a window — needed to price a request in working days. */
export async function getHolidayKeys(range: DayRange): Promise<Set<string>> {
  const holidays = await prisma.holiday.findMany({
    // Optional holidays don't automatically excuse a working day.
    where: { date: { gte: range.start, lte: range.end }, type: { in: ["PUBLIC", "COMPANY"] } },
    select: { date: true },
  });
  return new Set(holidays.map((holiday) => toDayKey(holiday.date)));
}

export async function calculateLeaveDays(
  range: DayRange,
  halfDay: boolean,
): Promise<{ days: number; holidayKeys: Set<string> }> {
  const holidayKeys = await getHolidayKeys(range);
  const workingDays = countWorkingDays(range, holidayKeys);

  // A half day on a non-working day costs nothing, which is the honest answer.
  if (halfDay) return { days: workingDays > 0 ? 0.5 : 0, holidayKeys };
  return { days: workingDays, holidayKeys };
}

/** Approved or pending requests that collide with a window. */
export async function findOverlappingLeave(
  userId: string,
  range: DayRange,
  excludeId?: string,
): Promise<LeaveRequestRecord[]> {
  const rows = await prisma.leaveRequest.findMany({
    where: {
      userId,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: range.end },
      endDate: { gte: range.start },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: LEAVE_SELECT,
  });
  return rows.map(toRecord);
}

// ---------------------------------------------------------------------------
//  Balances
// ---------------------------------------------------------------------------

/**
 * Reads a person's balances, creating the year's rows on first access.
 *
 * Lazy creation rather than a January batch job: a new joiner gets correct
 * balances the moment they open the screen, and there's no scheduled task that
 * can fail silently and leave people with no entitlement.
 */
export async function getLeaveBalances(
  userId: string,
  year = today().getUTCFullYear(),
): Promise<LeaveBalanceRow[]> {
  const existing = await prisma.leaveBalance.findMany({ where: { userId, year } });

  const missing = BALANCED_LEAVE_TYPES.filter(
    (type) => !existing.some((row) => row.type === type),
  );

  if (missing.length > 0) {
    await prisma.leaveBalance.createMany({
      data: missing.map((type) => ({
        userId,
        year,
        type,
        allocated: DEFAULT_LEAVE_ALLOCATION[type],
        used: 0,
        pending: 0,
      })),
    });
  }

  const rows = missing.length > 0
    ? await prisma.leaveBalance.findMany({ where: { userId, year } })
    : existing;

  return BALANCED_LEAVE_TYPES.map((type) => {
    const row = rows.find((candidate) => candidate.type === type);
    const allocated = row?.allocated ?? DEFAULT_LEAVE_ALLOCATION[type];
    const used = row?.used ?? 0;
    const pending = row?.pending ?? 0;
    return {
      type,
      allocated,
      used,
      pending,
      // Never negative, even if an admin lowers an allocation after the fact.
      available: Math.max(0, allocated - used - pending),
    };
  });
}

export async function getBalanceFor(
  userId: string,
  type: LeaveType,
  year = today().getUTCFullYear(),
): Promise<LeaveBalanceRow | null> {
  if (type === "UNPAID") return null; // Unpaid leave is unlimited by policy.
  const balances = await getLeaveBalances(userId, year);
  return balances.find((balance) => balance.type === type) ?? null;
}

/** Whole-team balance table for the admin view. */
export async function getTeamBalances(actor: Actor, year = today().getUTCFullYear()) {
  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      ...(actor.role === "MANAGER" ? { OR: [{ managerId: actor.id }, { id: actor.id }] } : {}),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      employeeCode: true,
      avatarUrl: true,
      department: { select: { name: true } },
      leaveBalances: { where: { year } },
    },
  });

  return users.map((user) => ({
    user: {
      id: user.id,
      name: user.name,
      employeeCode: user.employeeCode,
      avatarUrl: user.avatarUrl,
      department: user.department?.name ?? null,
    },
    balances: BALANCED_LEAVE_TYPES.map((type) => {
      const row = user.leaveBalances.find((balance) => balance.type === type);
      const allocated = row?.allocated ?? DEFAULT_LEAVE_ALLOCATION[type];
      const used = row?.used ?? 0;
      const pending = row?.pending ?? 0;
      return { type, allocated, used, pending, available: Math.max(0, allocated - used - pending) };
    }),
  }));
}

// ---------------------------------------------------------------------------
//  Requests
// ---------------------------------------------------------------------------

export async function getLeaveById(id: string): Promise<LeaveRequestRecord | null> {
  const row = await prisma.leaveRequest.findUnique({ where: { id }, select: LEAVE_SELECT });
  return row ? toRecord(row) : null;
}

export async function listMyLeave(
  userId: string,
  { page = 1, pageSize = 20 } = {},
): Promise<{ rows: LeaveRequestRecord[]; total: number }> {
  const [rows, total] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { userId },
      orderBy: [{ startDate: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: LEAVE_SELECT,
    }),
    prisma.leaveRequest.count({ where: { userId } }),
  ]);

  return { rows: rows.map(toRecord), total };
}

export interface LeaveFilters {
  status?: string[];
  type?: string[];
  department?: string[];
  q?: string;
  from?: Date;
  to?: Date;
}

export async function listLeaveRequests(
  actor: Actor,
  filters: LeaveFilters = {},
  { page = 1, pageSize = 25 } = {},
): Promise<{ rows: LeaveRequestRecord[]; total: number; pendingCount: number }> {
  const search = filters.q?.trim();

  const where: Prisma.LeaveRequestWhereInput = {
    ...(filters.status?.length ? { status: { in: filters.status } } : {}),
    ...(filters.type?.length ? { type: { in: filters.type } } : {}),
    ...(filters.from || filters.to
      ? {
          startDate: { lte: filters.to ?? new Date("2100-01-01") },
          endDate: { gte: filters.from ?? new Date("1970-01-01") },
        }
      : {}),
    user: {
      ...(filters.department?.length ? { departmentId: { in: filters.department } } : {}),
      ...(actor.role === "MANAGER" ? { managerId: actor.id } : {}),
      ...(search ? { name: containsInsensitive(search) } : {}),
    },
    // Employees only see their own requests.
    ...(isManagerOrAdmin(actor) ? {} : { userId: actor.id }),
  };

  const [rows, total, pendingCount] = await Promise.all([
    prisma.leaveRequest.findMany({
      where,
      // Pending first: this screen exists to clear a queue.
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: LEAVE_SELECT,
    }),
    prisma.leaveRequest.count({ where }),
    prisma.leaveRequest.count({
      where: {
        status: "PENDING",
        userId: { not: actor.id },
        ...(actor.role === "MANAGER" ? { user: { managerId: actor.id } } : {}),
      },
    }),
  ]);

  return { rows: rows.map(toRecord), total, pendingCount };
}

// ---------------------------------------------------------------------------
//  Calendar & analytics
// ---------------------------------------------------------------------------

export interface WhoIsOffEntry {
  userId: string;
  name: string;
  avatarUrl: string | null;
  type: LeaveType;
  halfDay: boolean;
  range: DayRange;
}

/** Approved leave overlapping a window, expanded per day for calendar views. */
export async function getWhoIsOff(range: DayRange): Promise<Map<string, WhoIsOffEntry[]>> {
  const rows = await prisma.leaveRequest.findMany({
    where: {
      status: "APPROVED",
      startDate: { lte: range.end },
      endDate: { gte: range.start },
    },
    select: {
      userId: true,
      type: true,
      halfDay: true,
      startDate: true,
      endDate: true,
      user: { select: { name: true, avatarUrl: true } },
    },
  });

  const byDay = new Map<string, WhoIsOffEntry[]>();

  for (const row of rows) {
    for (const day of eachDay({ start: row.startDate, end: row.endDate })) {
      if (day < range.start || day > range.end) continue;
      const key = toDayKey(day);
      const list = byDay.get(key) ?? [];
      list.push({
        userId: row.userId,
        name: row.user.name,
        avatarUrl: row.user.avatarUrl,
        type: asLeaveType(row.type),
        halfDay: row.halfDay,
        range: { start: row.startDate, end: row.endDate },
      });
      byDay.set(key, list);
    }
  }

  return byDay;
}

/** Monthly leave-days-taken series, split by type, for the analytics screen. */
export async function getLeaveTrend(
  range: DayRange,
  actor: Actor,
): Promise<Array<{ month: string; casual: number; sick: number; earned: number; unpaid: number }>> {
  const rows = await prisma.leaveRequest.findMany({
    where: {
      status: "APPROVED",
      startDate: { lte: range.end },
      endDate: { gte: range.start },
      ...(actor.role === "MANAGER" ? { user: { managerId: actor.id } } : {}),
    },
    select: { type: true, startDate: true, days: true },
  });

  const buckets = new Map<string, { casual: number; sick: number; earned: number; unpaid: number }>();

  for (const row of rows) {
    // Bucketed by start month — a request spanning a boundary lands where it began.
    const key = `${row.startDate.getUTCFullYear()}-${String(row.startDate.getUTCMonth() + 1).padStart(2, "0")}`;
    const bucket = buckets.get(key) ?? { casual: 0, sick: 0, earned: 0, unpaid: 0 };

    const type = asLeaveType(row.type);
    if (type === "CASUAL") bucket.casual += row.days;
    else if (type === "SICK") bucket.sick += row.days;
    else if (type === "EARNED") bucket.earned += row.days;
    else bucket.unpaid += row.days;

    buckets.set(key, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, values]) => ({ month, ...values }));
}

/** Who to notify about a request: the person's manager, or all admins. */
export async function getApproversFor(
  userId: string,
): Promise<
  Array<{
    id: string;
    name: string;
    email: string;
    notifyByEmail: boolean;
    // Required by the policy gate: without it every request emails immediately.
    emailDigestOnly: boolean;
  }>
> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      manager: {
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          notifyByEmail: true,
          emailDigestOnly: true,
        },
      },
    },
  });

  if (user?.manager && user.manager.status === "ACTIVE") {
    return [
      {
        id: user.manager.id,
        name: user.manager.name,
        email: user.manager.email,
        notifyByEmail: user.manager.notifyByEmail,
        emailDigestOnly: user.manager.emailDigestOnly,
      },
    ];
  }

  // No manager (or a disabled one) must never mean "nobody gets told".
  return prisma.user.findMany({
    where: { role: "ADMIN", status: "ACTIVE", id: { not: userId } },
    select: { id: true, name: true, email: true, notifyByEmail: true, emailDigestOnly: true },
  });
}
