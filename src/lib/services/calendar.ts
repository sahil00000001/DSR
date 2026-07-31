import "server-only";
import { prisma } from "@/lib/db/prisma";
import { asLeaveType, type HolidayType, type LeaveType } from "@/lib/constants/enums";
import { addDays, eachDay, endOfMonth, startOfMonth, toDayKey, today, type DayRange } from "@/lib/utils/date";
import { getWhoIsOff } from "@/lib/services/leave";

/**
 * Team calendar: holidays, approved leave, birthdays and work anniversaries.
 *
 * Birthdays and anniversaries are matched on month/day only, because the year
 * differs by definition. SQL date functions vary between SQLite and Postgres, so
 * the comparison is done in application code against a narrow candidate set
 * rather than in a provider-specific query — that keeps the schema portable.
 */

export type CalendarEventKind = "HOLIDAY" | "LEAVE" | "BIRTHDAY" | "ANNIVERSARY";

export interface CalendarEvent {
  id: string;
  kind: CalendarEventKind;
  title: string;
  dayKey: string;
  /** Present for person-centred events. */
  person?: { id: string; name: string; avatarUrl: string | null };
  holidayType?: HolidayType;
  leaveType?: LeaveType;
  halfDay?: boolean;
  /** Years of service, for anniversaries. */
  years?: number;
}

export async function getHolidays(range: DayRange) {
  return prisma.holiday.findMany({
    where: { date: { gte: range.start, lte: range.end } },
    orderBy: { date: "asc" },
    select: {
      id: true,
      name: true,
      date: true,
      type: true,
      location: { select: { id: true, name: true } },
    },
  });
}

/**
 * Birthdays and work anniversaries inside a window.
 *
 * Only two months of `(month, day)` pairs can ever match a ≤31-day window, so we
 * fetch the small set of people with the relevant dates and filter in memory.
 */
async function getPeopleMilestones(range: DayRange): Promise<CalendarEvent[]> {
  const people = await prisma.user.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, avatarUrl: true, dateOfBirth: true, joinedAt: true },
  });

  const wanted = new Set(
    eachDay(range).map((day) => `${day.getUTCMonth() + 1}-${day.getUTCDate()}`),
  );

  const dayKeyFor = (source: Date): string | null => {
    // Project the recurring date onto the year(s) covered by the window.
    for (const day of eachDay(range)) {
      if (
        day.getUTCMonth() === source.getUTCMonth() &&
        day.getUTCDate() === source.getUTCDate()
      ) {
        return toDayKey(day);
      }
    }
    return null;
  };

  const events: CalendarEvent[] = [];

  for (const person of people) {
    if (person.dateOfBirth) {
      const monthDay = `${person.dateOfBirth.getUTCMonth() + 1}-${person.dateOfBirth.getUTCDate()}`;
      if (wanted.has(monthDay)) {
        const dayKey = dayKeyFor(person.dateOfBirth);
        if (dayKey) {
          events.push({
            id: `birthday-${person.id}`,
            kind: "BIRTHDAY",
            title: `${person.name}'s birthday`,
            dayKey,
            person: { id: person.id, name: person.name, avatarUrl: person.avatarUrl },
          });
        }
      }
    }

    const joinMonthDay = `${person.joinedAt.getUTCMonth() + 1}-${person.joinedAt.getUTCDate()}`;
    if (wanted.has(joinMonthDay)) {
      const dayKey = dayKeyFor(person.joinedAt);
      // Skip the join date itself — that's an arrival, not an anniversary.
      if (dayKey) {
        const years = Number(dayKey.slice(0, 4)) - person.joinedAt.getUTCFullYear();
        if (years >= 1) {
          events.push({
            id: `anniversary-${person.id}`,
            kind: "ANNIVERSARY",
            title: `${person.name} — ${years} ${years === 1 ? "year" : "years"}`,
            dayKey,
            person: { id: person.id, name: person.name, avatarUrl: person.avatarUrl },
            years,
          });
        }
      }
    }
  }

  return events;
}

/** All calendar events in a window, grouped by day key. */
export async function getCalendarEvents(range: DayRange): Promise<Map<string, CalendarEvent[]>> {
  const [holidays, whoIsOff, milestones] = await Promise.all([
    getHolidays(range),
    getWhoIsOff(range),
    getPeopleMilestones(range),
  ]);

  const byDay = new Map<string, CalendarEvent[]>();

  const push = (event: CalendarEvent) => {
    const list = byDay.get(event.dayKey) ?? [];
    list.push(event);
    byDay.set(event.dayKey, list);
  };

  for (const holiday of holidays) {
    push({
      id: holiday.id,
      kind: "HOLIDAY",
      title: holiday.location ? `${holiday.name} (${holiday.location.name})` : holiday.name,
      dayKey: toDayKey(holiday.date),
      holidayType: holiday.type as HolidayType,
    });
  }

  for (const [dayKey, entries] of whoIsOff) {
    for (const entry of entries) {
      push({
        id: `leave-${entry.userId}-${dayKey}`,
        kind: "LEAVE",
        title: `${entry.name} — ${asLeaveType(entry.type).toLowerCase()} leave`,
        dayKey,
        person: { id: entry.userId, name: entry.name, avatarUrl: entry.avatarUrl },
        leaveType: entry.type,
        halfDay: entry.halfDay,
      });
    }
  }

  for (const milestone of milestones) push(milestone);

  return byDay;
}

export async function getCalendarMonth(month: Date) {
  const range = { start: startOfMonth(month), end: endOfMonth(month) };
  return { range, events: await getCalendarEvents(range) };
}

/** Upcoming items for the dashboard sidebar. */
export async function getUpcoming(days = 21) {
  const start = today();
  const range: DayRange = { start, end: addDays(start, days) };
  const events = await getCalendarEvents(range);

  return [...events.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([dayKey, list]) => list.map((event) => ({ ...event, dayKey })))
    .slice(0, 12);
}

export async function getNextHoliday() {
  return prisma.holiday.findFirst({
    where: { date: { gte: today() }, type: { in: ["PUBLIC", "COMPANY"] } },
    orderBy: { date: "asc" },
    select: { id: true, name: true, date: true, type: true },
  });
}
