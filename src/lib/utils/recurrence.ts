import type { TaskRecurrence } from "@/lib/constants/enums";

/**
 * Recurrence arithmetic for repeating tasks.
 *
 * Its own pure module rather than living beside the action that uses it: a
 * `"use server"` file may only export async functions, so a synchronous helper there
 * fails the build outright. Being pure also makes it the one part of recurrence that
 * can be checked without a database.
 *
 * All dates are UTC-midnight calendar days, matching the rest of the schema.
 */

const MS_PER_DAY = 86_400_000;

/**
 * The next occurrence after `from`, or null if the task does not repeat.
 *
 * Monthly steps use calendar months and **clamp** rather than overflow: the 31st of a
 * 30-day month lands on the 30th. Adding a month to 31 January by day arithmetic would
 * skip February entirely and produce 3 March, which is not what "monthly on the 31st"
 * means to anyone.
 */
export function nextOccurrence(
  from: Date,
  recurrence: TaskRecurrence,
  every: number,
): Date | null {
  const step = Math.max(1, Math.floor(every));

  switch (recurrence) {
    case "DAILY":
      return new Date(from.getTime() + step * MS_PER_DAY);

    case "WEEKLY":
      return new Date(from.getTime() + step * 7 * MS_PER_DAY);

    case "MONTHLY": {
      const year = from.getUTCFullYear();
      const month = from.getUTCMonth() + step;
      const wanted = from.getUTCDate();
      // Day 0 of the following month is the last day of the target month.
      const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      return new Date(Date.UTC(year, month, Math.min(wanted, lastDay)));
    }

    default:
      return null;
  }
}
