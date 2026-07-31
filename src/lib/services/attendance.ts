import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { isManagerOrAdmin, type Actor } from "@/lib/auth/rbac";
import {
  asAttendanceStatus,
  WORKING_ATTENDANCE,
  type AttendanceStatus,
} from "@/lib/constants/enums";
import {
  eachDay,
  endOfMonth,
  isWeekend,
  startOfMonth,
  toDayKey,
  today,
  type DayRange,
} from "@/lib/utils/date";

/**
 * Attendance reads.
 *
 * The design decision worth knowing: **absence is inferred, never stored.**
 * A working day with no row and no approved leave *is* an absence — so nothing
 * has to run at midnight to mark people absent, and a cron job that fails can't
 * silently corrupt the register. `resolveDay()` is the single place that
 * inference lives.
 */

export interface AttendanceRecord {
  id: string;
  date: Date;
  status: AttendanceStatus;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  workedMinutes: number;
  note: string | null;
  source: string;
}

export interface ResolvedDay {
  date: Date;
  key: string;
  status: AttendanceStatus;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  workedMinutes: number;
  note: string | null;
  /** True when the status was inferred rather than recorded. */
  inferred: boolean;
}

interface ResolveContext {
  records: Map<string, AttendanceRecord>;
  holidays: Set<string>;
  /** Approved leave days, so they aren't reported as absences. */
  leave: Set<string>;
  joinedAt: Date;
}

/**
 * Decides what a given day *means* for one person.
 *
 * Order matters: an explicit record always wins, then weekend, then holiday,
 * then approved leave, then — only for a past working day after they joined —
 * absent. Future days are left blank rather than pre-emptively marked absent.
 */
function resolveDay(day: Date, context: ResolveContext, reference: Date): ResolvedDay | null {
  const key = toDayKey(day);
  const record = context.records.get(key);

  if (record) {
    return {
      date: day,
      key,
      status: record.status,
      checkInAt: record.checkInAt,
      checkOutAt: record.checkOutAt,
      workedMinutes: record.workedMinutes,
      note: record.note,
      inferred: false,
    };
  }

  const blank = (status: AttendanceStatus): ResolvedDay => ({
    date: day,
    key,
    status,
    checkInAt: null,
    checkOutAt: null,
    workedMinutes: 0,
    note: null,
    inferred: true,
  });

  if (isWeekend(day)) return blank("WEEKEND");
  if (context.holidays.has(key)) return blank("HOLIDAY");
  if (context.leave.has(key)) return blank("LEAVE");

  // Nothing to say about the future, or about days before someone joined.
  if (day > reference) return null;
  if (day < context.joinedAt) return null;

  return blank("ABSENT");
}

async function loadContext(userId: string, range: DayRange): Promise<ResolveContext> {
  const [rows, holidays, leave, user] = await Promise.all([
    prisma.attendance.findMany({
      where: { userId, date: { gte: range.start, lte: range.end } },
      select: {
        id: true,
        date: true,
        status: true,
        checkInAt: true,
        checkOutAt: true,
        workedMinutes: true,
        note: true,
        source: true,
      },
    }),
    prisma.holiday.findMany({
      where: { date: { gte: range.start, lte: range.end } },
      select: { date: true },
    }),
    prisma.leaveRequest.findMany({
      where: {
        userId,
        status: "APPROVED",
        // Any request that overlaps the window at all.
        startDate: { lte: range.end },
        endDate: { gte: range.start },
      },
      select: { startDate: true, endDate: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { joinedAt: true } }),
  ]);

  const leaveKeys = new Set<string>();
  for (const request of leave) {
    for (const day of eachDay({ start: request.startDate, end: request.endDate })) {
      leaveKeys.add(toDayKey(day));
    }
  }

  return {
    records: new Map(
      rows.map((row) => [
        toDayKey(row.date),
        { ...row, status: asAttendanceStatus(row.status) },
      ]),
    ),
    holidays: new Set(holidays.map((holiday) => toDayKey(holiday.date))),
    leave: leaveKeys,
    joinedAt: user?.joinedAt ?? new Date(0),
  };
}

// ---------------------------------------------------------------------------
//  Personal views
// ---------------------------------------------------------------------------

export async function getAttendanceRange(userId: string, range: DayRange): Promise<ResolvedDay[]> {
  const context = await loadContext(userId, range);
  const reference = today();

  return eachDay(range)
    .map((day) => resolveDay(day, context, reference))
    .filter((day): day is ResolvedDay => day !== null);
}

export async function getAttendanceMonth(userId: string, month: Date): Promise<ResolvedDay[]> {
  return getAttendanceRange(userId, { start: startOfMonth(month), end: endOfMonth(month) });
}

export async function getTodayAttendance(userId: string): Promise<ResolvedDay | null> {
  const now = today();
  const [day] = await getAttendanceRange(userId, { start: now, end: now });
  return day ?? null;
}

export interface AttendanceSummary {
  present: number;
  wfh: number;
  halfDay: number;
  leave: number;
  absent: number;
  holiday: number;
  workingDays: number;
  /** Percentage of expected working days actually worked. */
  rate: number;
  totalMinutes: number;
}

export async function getAttendanceSummary(
  userId: string,
  range: DayRange,
): Promise<AttendanceSummary> {
  const days = await getAttendanceRange(userId, range);

  const summary: AttendanceSummary = {
    present: 0,
    wfh: 0,
    halfDay: 0,
    leave: 0,
    absent: 0,
    holiday: 0,
    workingDays: 0,
    rate: 0,
    totalMinutes: 0,
  };

  for (const day of days) {
    summary.totalMinutes += day.workedMinutes;

    switch (day.status) {
      case "PRESENT":
        summary.present += 1;
        break;
      case "WFH":
        summary.wfh += 1;
        break;
      case "HALF_DAY":
        summary.halfDay += 1;
        break;
      case "LEAVE":
        summary.leave += 1;
        break;
      case "ABSENT":
        summary.absent += 1;
        break;
      case "HOLIDAY":
        summary.holiday += 1;
        break;
      default:
        break; // WEEKEND
    }
  }

  // Half days count as half a day worked, which is the whole point of the status.
  const worked = summary.present + summary.wfh + summary.halfDay * 0.5;
  summary.workingDays = summary.present + summary.wfh + summary.halfDay + summary.absent + summary.leave;
  summary.rate =
    summary.workingDays === 0 ? 0 : Math.round((worked / summary.workingDays) * 1000) / 10;

  return summary;
}

// ---------------------------------------------------------------------------
//  Team board
// ---------------------------------------------------------------------------

export interface BoardPerson {
  id: string;
  name: string;
  employeeCode: string;
  avatarUrl: string | null;
  department: string | null;
  departmentColor: string | null;
  days: ResolvedDay[];
  summary: { worked: number; absent: number; leave: number };
}

/**
 * Matrix of people × days for the attendance board.
 *
 * Loads the whole window in three queries and resolves in memory, rather than
 * per-person queries in a loop — at 20 people × 31 days that's the difference
 * between 3 round-trips and 60.
 */
export async function getAttendanceBoard(
  range: DayRange,
  actor: Actor,
  filters: { department?: string[]; location?: string[]; q?: string } = {},
): Promise<{ people: BoardPerson[]; days: Date[]; holidays: Set<string> }> {
  const userWhere: Prisma.UserWhereInput = {
    status: "ACTIVE",
    ...(filters.department?.length ? { departmentId: { in: filters.department } } : {}),
    ...(filters.location?.length ? { locationId: { in: filters.location } } : {}),
    ...(actor.role === "MANAGER" ? { OR: [{ managerId: actor.id }, { id: actor.id }] } : {}),
    ...(isManagerOrAdmin(actor) ? {} : { id: actor.id }),
  };

  const [users, records, holidays, leave] = await Promise.all([
    prisma.user.findMany({
      where: userWhere,
      orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        employeeCode: true,
        avatarUrl: true,
        joinedAt: true,
        department: { select: { name: true, color: true } },
      },
    }),
    prisma.attendance.findMany({
      where: { date: { gte: range.start, lte: range.end } },
      select: {
        id: true,
        userId: true,
        date: true,
        status: true,
        checkInAt: true,
        checkOutAt: true,
        workedMinutes: true,
        note: true,
        source: true,
      },
    }),
    prisma.holiday.findMany({
      where: { date: { gte: range.start, lte: range.end } },
      select: { date: true },
    }),
    prisma.leaveRequest.findMany({
      where: {
        status: "APPROVED",
        startDate: { lte: range.end },
        endDate: { gte: range.start },
      },
      select: { userId: true, startDate: true, endDate: true },
    }),
  ]);

  const holidayKeys = new Set(holidays.map((holiday) => toDayKey(holiday.date)));

  const recordsByUser = new Map<string, Map<string, AttendanceRecord>>();
  for (const row of records) {
    const map = recordsByUser.get(row.userId) ?? new Map<string, AttendanceRecord>();
    map.set(toDayKey(row.date), { ...row, status: asAttendanceStatus(row.status) });
    recordsByUser.set(row.userId, map);
  }

  const leaveByUser = new Map<string, Set<string>>();
  for (const request of leave) {
    const set = leaveByUser.get(request.userId) ?? new Set<string>();
    for (const day of eachDay({ start: request.startDate, end: request.endDate })) {
      set.add(toDayKey(day));
    }
    leaveByUser.set(request.userId, set);
  }

  const days = eachDay(range);
  const reference = today();

  const people: BoardPerson[] = users.map((user) => {
    const context: ResolveContext = {
      records: recordsByUser.get(user.id) ?? new Map(),
      holidays: holidayKeys,
      leave: leaveByUser.get(user.id) ?? new Set(),
      joinedAt: user.joinedAt,
    };

    const resolved = days
      .map((day) => resolveDay(day, context, reference))
      .filter((day): day is ResolvedDay => day !== null);

    return {
      id: user.id,
      name: user.name,
      employeeCode: user.employeeCode,
      avatarUrl: user.avatarUrl,
      department: user.department?.name ?? null,
      departmentColor: user.department?.color ?? null,
      days: resolved,
      summary: {
        worked: resolved.filter((day) => WORKING_ATTENDANCE.includes(day.status)).length,
        absent: resolved.filter((day) => day.status === "ABSENT").length,
        leave: resolved.filter((day) => day.status === "LEAVE").length,
      },
    };
  });

  const search = filters.q?.trim().toLowerCase();
  const filtered = search
    ? people.filter(
        (person) =>
          person.name.toLowerCase().includes(search) ||
          person.employeeCode.toLowerCase().includes(search),
      )
    : people;

  return { people: filtered, days, holidays: holidayKeys };
}

/** Today's roll-call for the dashboard. */
export async function getTodaySnapshot(actor: Actor) {
  const now = today();
  const board = await getAttendanceBoard({ start: now, end: now }, actor);

  const counts: Record<AttendanceStatus, number> = {
    PRESENT: 0,
    WFH: 0,
    HALF_DAY: 0,
    LEAVE: 0,
    ABSENT: 0,
    HOLIDAY: 0,
    WEEKEND: 0,
  };

  const notYetMarked: BoardPerson[] = [];

  for (const person of board.people) {
    const day = person.days[0];
    if (!day) continue;
    counts[day.status] += 1;
    // "Absent" on today usually means "hasn't marked in yet" — worth separating.
    if (day.status === "ABSENT" && day.inferred) notYetMarked.push(person);
  }

  return {
    counts,
    total: board.people.length,
    notYetMarked,
    isNonWorkingDay: isWeekend(now) || board.holidays.has(toDayKey(now)),
    people: board.people,
  };
}

/** Daily composition series for the analytics trend chart. */
export async function getAttendanceTrend(
  range: DayRange,
  actor: Actor,
): Promise<Array<{ date: string; present: number; wfh: number; halfDay: number; leave: number; absent: number }>> {
  const board = await getAttendanceBoard(range, actor);

  return board.days
    .map((day) => {
      const key = toDayKey(day);
      const row = { date: key, present: 0, wfh: 0, halfDay: 0, leave: 0, absent: 0 };

      for (const person of board.people) {
        const resolved = person.days.find((entry) => entry.key === key);
        if (!resolved) continue;
        if (resolved.status === "PRESENT") row.present += 1;
        else if (resolved.status === "WFH") row.wfh += 1;
        else if (resolved.status === "HALF_DAY") row.halfDay += 1;
        else if (resolved.status === "LEAVE") row.leave += 1;
        else if (resolved.status === "ABSENT") row.absent += 1;
      }

      return { ...row, isWorkingDay: !isWeekend(day) && !board.holidays.has(key) };
    })
    // Weekends would flatline every series and make the trend unreadable.
    .filter((row) => row.isWorkingDay)
    .map(({ isWorkingDay: _isWorkingDay, ...row }) => row);
}
