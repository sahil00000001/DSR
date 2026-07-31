/**
 * Calendar-day utilities.
 *
 * ## Why this file exists
 *
 * DSR, attendance and leave records are keyed by *calendar day*, not by an
 * instant. Storing them as local-midnight timestamps is the classic source of
 * off-by-one-day bugs: a record written at midnight IST reads back as the
 * previous day for a viewer in New York, and vice versa.
 *
 * Cadence therefore normalises every calendar day to **UTC midnight** and only
 * ever reads those values back with UTC accessors. All arithmetic below is done
 * on UTC components so it is immune to DST transitions.
 *
 * Rule of thumb:
 *   • a calendar day (a DSR's `date`)      → helpers in this file
 *   • an instant (`createdAt`, `checkInAt`) → `formatDateTime` / `formatRelative`
 */

const MS_PER_DAY = 86_400_000;

/** `YYYY-MM-DD` — the canonical wire format for a calendar day. */
export type DayKey = string;

// ---------------------------------------------------------------------------
//  Construction & parsing
// ---------------------------------------------------------------------------

/** UTC midnight for the given calendar components. */
export function utcDay(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

/** Parses `YYYY-MM-DD` into UTC midnight. Throws on malformed input. */
export function parseDayKey(key: DayKey): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.trim());
  if (!match) throw new Error(`Invalid day key: "${key}" (expected YYYY-MM-DD)`);
  const [, y, m, d] = match;
  const date = utcDay(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: "${key}"`);
  return date;
}

/** Safe variant — returns null instead of throwing. */
export function tryParseDayKey(key: string | null | undefined): Date | null {
  if (!key) return null;
  try {
    return parseDayKey(key);
  } catch {
    return null;
  }
}

/** Serialises a stored calendar day back to `YYYY-MM-DD`. */
export function toDayKey(date: Date): DayKey {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/**
 * Normalises an arbitrary Date to the UTC midnight of the calendar day the
 * viewer would call it — i.e. it reads the *local* components. Use this when
 * turning "now" into a day key.
 */
export function startOfDayFromLocal(date: Date): Date {
  return utcDay(date.getFullYear(), date.getMonth(), date.getDate());
}

/** UTC midnight of today, according to the server's local clock. */
export function today(): Date {
  return startOfDayFromLocal(new Date());
}

export function todayKey(): DayKey {
  return toDayKey(today());
}

// ---------------------------------------------------------------------------
//  Arithmetic (all DST-safe: pure UTC millisecond maths)
// ---------------------------------------------------------------------------

export function addDays(day: Date, amount: number): Date {
  return new Date(day.getTime() + amount * MS_PER_DAY);
}

export function subDays(day: Date, amount: number): Date {
  return addDays(day, -amount);
}

export function addMonths(day: Date, amount: number): Date {
  const target = utcDay(day.getUTCFullYear(), day.getUTCMonth() + amount, 1);
  // Clamp to the last valid day when the target month is shorter (Jan 31 + 1mo).
  const lastDay = daysInMonth(target.getUTCFullYear(), target.getUTCMonth());
  return utcDay(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day.getUTCDate(), lastDay));
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Whole calendar days between two days (b - a). */
export function differenceInDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}

export function isBefore(a: Date, b: Date): boolean {
  return a.getTime() < b.getTime();
}

export function isAfter(a: Date, b: Date): boolean {
  return a.getTime() > b.getTime();
}

export function clampDay(day: Date, min: Date, max: Date): Date {
  if (day < min) return min;
  if (day > max) return max;
  return day;
}

// ---------------------------------------------------------------------------
//  Ranges
// ---------------------------------------------------------------------------

export interface DayRange {
  start: Date;
  end: Date;
}

/** ISO week: Monday-first. */
export function startOfWeek(day: Date): Date {
  const dow = day.getUTCDay(); // 0 = Sunday
  const offset = dow === 0 ? 6 : dow - 1;
  return subDays(day, offset);
}

export function endOfWeek(day: Date): Date {
  return addDays(startOfWeek(day), 6);
}

export function startOfMonth(day: Date): Date {
  return utcDay(day.getUTCFullYear(), day.getUTCMonth(), 1);
}

export function endOfMonth(day: Date): Date {
  return utcDay(day.getUTCFullYear(), day.getUTCMonth() + 1, 0);
}

export function startOfYear(day: Date): Date {
  return utcDay(day.getUTCFullYear(), 0, 1);
}

export function endOfYear(day: Date): Date {
  return utcDay(day.getUTCFullYear(), 11, 31);
}

/** Inclusive list of days between start and end. Guards against absurd ranges. */
export function eachDay(range: DayRange, limit = 1_000): Date[] {
  const out: Date[] = [];
  const total = differenceInDays(range.start, range.end);
  if (total < 0) return out;
  for (let i = 0; i <= Math.min(total, limit - 1); i += 1) {
    out.push(addDays(range.start, i));
  }
  return out;
}

/** Trailing window ending today, e.g. `lastNDays(30)`. */
export function lastNDays(n: number, from: Date = today()): DayRange {
  return { start: subDays(from, n - 1), end: from };
}

/**
 * Calendar grid for a month view: whole weeks (Mon–Sun) covering the month,
 * always 6 rows so the layout never jumps between months.
 */
export function monthGrid(day: Date): Date[] {
  const first = startOfWeek(startOfMonth(day));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

// ---------------------------------------------------------------------------
//  Working days
// ---------------------------------------------------------------------------

export function isWeekend(day: Date): boolean {
  const dow = day.getUTCDay();
  return dow === 0 || dow === 6;
}

/**
 * Counts working days in an inclusive range, excluding weekends and any day
 * present in `holidayKeys`.
 */
export function countWorkingDays(range: DayRange, holidayKeys: ReadonlySet<string> = new Set()) {
  return eachDay(range).filter((d) => !isWeekend(d) && !holidayKeys.has(toDayKey(d))).length;
}

export function workingDaysIn(
  range: DayRange,
  holidayKeys: ReadonlySet<string> = new Set(),
): Date[] {
  return eachDay(range).filter((d) => !isWeekend(d) && !holidayKeys.has(toDayKey(d)));
}

// ---------------------------------------------------------------------------
//  Formatting
// ---------------------------------------------------------------------------

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

function dayFormatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  let formatter = dayFormatters.get(key);
  if (!formatter) {
    // timeZone: "UTC" is essential — stored days *are* UTC midnight.
    formatter = new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" });
    dayFormatters.set(key, formatter);
  }
  return formatter;
}

/** "14 Mar 2026" */
export function formatDay(day: Date): string {
  return dayFormatter({ day: "numeric", month: "short", year: "numeric" }).format(day);
}

/** "Sat, 14 Mar" */
export function formatDayShort(day: Date): string {
  return dayFormatter({ weekday: "short", day: "numeric", month: "short" }).format(day);
}

/** "Saturday, 14 March 2026" */
export function formatDayLong(day: Date): string {
  return dayFormatter({
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(day);
}

/** "Mar 2026" */
export function formatMonth(day: Date): string {
  return dayFormatter({ month: "short", year: "numeric" }).format(day);
}

/** "March 2026" */
export function formatMonthLong(day: Date): string {
  return dayFormatter({ month: "long", year: "numeric" }).format(day);
}

/** "Mon" */
export function formatWeekday(day: Date): string {
  return dayFormatter({ weekday: "short" }).format(day);
}

/** "14" */
export function formatDayOfMonth(day: Date): string {
  return String(day.getUTCDate());
}

/** "14 Mar – 20 Mar 2026", collapsing shared month/year. */
export function formatDayRange(range: DayRange): string {
  const { start, end } = range;
  if (isSameDay(start, end)) return formatDay(start);

  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();

  if (sameMonth) {
    return `${start.getUTCDate()}–${end.getUTCDate()} ${formatMonth(end)}`;
  }
  if (sameYear) {
    const left = dayFormatter({ day: "numeric", month: "short" }).format(start);
    return `${left} – ${formatDay(end)}`;
  }
  return `${formatDay(start)} – ${formatDay(end)}`;
}

/** "Today" / "Yesterday" / "Sat, 14 Mar" — for day-keyed records. */
export function formatDayFriendly(day: Date, reference: Date = today()): string {
  const diff = differenceInDays(day, reference);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  if (diff > -7 && diff < 0) return dayFormatter({ weekday: "long" }).format(day);
  return formatDayShort(day);
}

/** ISO week number (1–53). */
export function isoWeekNumber(day: Date): number {
  const target = new Date(day.getTime());
  const dayNum = (day.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = target.getTime();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
  }
  return 1 + Math.ceil((firstThursday - target.getTime()) / (7 * MS_PER_DAY));
}

/** "W12 · 16–22 Mar" */
export function formatWeekLabel(day: Date): string {
  const start = startOfWeek(day);
  return `W${isoWeekNumber(start)} · ${formatDayRange({ start, end: endOfWeek(start) })}`;
}

// --- Instants (not calendar days) ------------------------------------------

const instantFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

/** "14 Mar 2026, 09:42 am" */
export function formatDateTime(value: Date | string): string {
  return instantFormatter.format(new Date(value));
}

/** "09:42 am" */
export function formatTime(value: Date | string): string {
  return timeFormatter.format(new Date(value));
}

/** "3 minutes ago" / "in 2 days" */
export function formatRelative(value: Date | string, now: Date = new Date()): string {
  const date = new Date(value);
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 604_800) return rtf.format(Math.round(seconds / 86_400), "day");
  if (abs < 2_629_800) return rtf.format(Math.round(seconds / 604_800), "week");
  if (abs < 31_557_600) return rtf.format(Math.round(seconds / 2_629_800), "month");
  return rtf.format(Math.round(seconds / 31_557_600), "year");
}

/** Turns `<input type="date">` values into a day, tolerating empty strings. */
export function fromDateInput(value: FormDataEntryValue | null): Date | null {
  if (typeof value !== "string" || !value) return null;
  return tryParseDayKey(value);
}

/** Value for `<input type="date">`. */
export function toDateInput(day: Date | null | undefined): string {
  return day ? toDayKey(day) : "";
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
