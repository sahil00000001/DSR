import { addDays, isWeekend, toDayKey } from "@/lib/utils/date";
import type { TaskStatus } from "@/lib/constants/enums";

/**
 * Order timeline projection.
 *
 * ## The problem this solves
 *
 * An order is promised to a dealer for a date and delivered by a sequence of stages,
 * each given to one person for a number of days. Order A: three people, one day each,
 * promised in three days. Person one takes three days instead of one. Nobody has done
 * anything wrong yet — stage two has not even started — but the order is already going
 * to be two days late, and the only way anyone finds out today is if somebody does this
 * arithmetic in their head across every open order.
 *
 * So the arithmetic lives here: **actual time used on what is finished and running,
 * plus allotted time for what has not started, gives a forecast finish date.** Compare
 * that to the promise and you know the slip before the promise is broken, which is the
 * only moment the information is worth anything.
 *
 * ## Working days, not calendar days
 *
 * A plant does not run on Sunday, so a two-day stage starting Saturday finishes
 * Tuesday. Every duration and every gap here is counted in working days, with the
 * company holiday list passed in. Using calendar days would forecast Sunday deliveries
 * and quietly under-report every slip that spans a weekend.
 *
 * ## Pure by design
 *
 * No database, no `Date.now()` beyond the `asOf` argument the caller supplies. That is
 * what makes the forecast testable — and it needs to be, because it is the number the
 * works manager will make promises on.
 */

/** A stage as the projection needs to see it. Deliberately narrower than `Task`. */
export interface ProjectableStage {
  id: string;
  name: string;
  position: number;
  /** Working days the stage was given. Missing is treated as one day. */
  allottedDays: number | null;
  status: TaskStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  progressPercent: number;
  assignees: Array<{ id: string; name: string }>;
}

export interface StageProjection extends ProjectableStage {
  allotted: number;
  /** Working days actually consumed so far. Zero until it starts. */
  used: number;
  /** Working days still expected. Zero once done. */
  remaining: number;
  /** `used - allotted`, floored at zero. This is the number that names a bottleneck. */
  overrun: number;
  /** True while this is the stage the order is actually sitting on. */
  isCurrent: boolean;
}

export interface OrderProjection {
  stages: StageProjection[];
  /** Forecast finish. Null when there are no stages to forecast from. */
  projectedOn: Date | null;
  /** Working days late the forecast is. Negative is ahead of the promise. */
  slipDays: number;
  /** Working days between today and the promise. Negative means the date has passed. */
  daysToPromise: number;
  /** Derived state — never set by hand. See the note on `Order.status`. */
  derivedStatus: "PENDING" | "IN_PROGRESS" | "AT_RISK" | "DELAYED" | "COMPLETED";
  /** The stage the order is waiting on, if any. */
  currentStage: StageProjection | null;
  /** Stages that have taken longer than they were given, worst first. */
  bottlenecks: StageProjection[];
  /**
   * Stages that are blocked. Non-empty means the day count is a floor, not a forecast —
   * a blocked stage resumes when somebody clears it, which nothing here can know.
   */
  blockedStages: StageProjection[];
  /** Working days of allotted time across the whole order. */
  totalAllotted: number;
  /** Completed stages over total, as a percentage. */
  stageCompletion: number;
  /** Mean of stage progress, so a half-finished stage counts for something. */
  weightedProgress: number;
}

/** True when the plant is not running on this day. */
function isNonWorking(day: Date, holidays: ReadonlySet<string>): boolean {
  return isWeekend(day) || holidays.has(toDayKey(day));
}

/**
 * `from` plus `count` working days.
 *
 * Zero returns `from` itself even if `from` is a Sunday — the caller asked for no
 * elapsed work, not for the next working day. Guarded at 3,650 iterations so a corrupt
 * `count` cannot spin forever inside a request.
 */
export function addWorkingDays(
  from: Date,
  count: number,
  holidays: ReadonlySet<string> = new Set(),
): Date {
  if (count <= 0) return from;

  let cursor = from;
  let added = 0;
  let guard = 0;

  while (added < count && guard < 3650) {
    cursor = addDays(cursor, 1);
    guard += 1;
    if (!isNonWorking(cursor, holidays)) added += 1;
  }

  return cursor;
}

/**
 * Working days from `start` to `end`, counting `start` as day one.
 *
 * Inclusive of both ends, because "this stage took two days" means Monday and Tuesday,
 * not the 24 hours between them. Returns a negative count when `end` precedes `start`,
 * which is what makes it usable for slip in both directions.
 */
export function workingDaysBetween(
  start: Date,
  end: Date,
  holidays: ReadonlySet<string> = new Set(),
): number {
  if (end < start) return -workingDaysBetween(end, start, holidays);

  let count = 0;
  let cursor = start;
  let guard = 0;

  while (cursor <= end && guard < 3650) {
    if (!isNonWorking(cursor, holidays)) count += 1;
    cursor = addDays(cursor, 1);
    guard += 1;
  }

  return count;
}

/**
 * Projects an order forward.
 *
 * `asOf` is the day to project from — normally today, but passed in so the forecast can
 * be reproduced for any date, which is what makes it testable.
 */
export function projectOrder(
  order: { promisedOn: Date; startedOn: Date | null },
  rawStages: ProjectableStage[],
  {
    asOf,
    holidays = new Set<string>(),
  }: { asOf: Date; holidays?: ReadonlySet<string> },
): OrderProjection {
  const stages = [...rawStages].sort((a, b) => a.position - b.position);

  const totalAllotted = stages.reduce((sum, stage) => sum + (stage.allottedDays ?? 1), 0);
  const daysToPromise = workingDaysBetween(asOf, order.promisedOn, holidays) - 1;

  // The first stage that is not finished is what the order is sitting on.
  const currentIndex = stages.findIndex((stage) => stage.status !== "COMPLETED");

  const projected: StageProjection[] = stages.map((stage, index) => {
    const allotted = stage.allottedDays ?? 1;

    let used = 0;
    if (stage.startedAt) {
      // A finished stage is measured to its completion; a running one to today.
      const end = stage.completedAt ?? asOf;
      used = Math.max(0, workingDaysBetween(stage.startedAt, end, holidays));
    }

    const done = stage.status === "COMPLETED";
    // A running stage that has already burned its allowance still needs *something*
    // left, or the forecast would claim it finishes today. One day is the honest
    // minimum: it is not done, so it takes at least the rest of today.
    const remaining = done ? 0 : stage.startedAt ? Math.max(1, allotted - used) : allotted;

    return {
      ...stage,
      allotted,
      used,
      remaining,
      overrun: Math.max(0, used - allotted),
      isCurrent: index === currentIndex,
    };
  });

  const allDone = stages.length > 0 && currentIndex === -1;
  const remainingWork = projected.reduce((sum, stage) => sum + stage.remaining, 0);

  /**
   * A blocked stage makes the order need attention, whatever the arithmetic says.
   *
   * This is not a rounding nicety. A blocked stage has **no known end** — it resumes
   * when somebody clears the blocker, which could be tomorrow or next month. The
   * day-counting above can only assume it needs the rest of its allowance, which for a
   * stage sitting on a rejected bearing consignment produced "6 days early" on real
   * seeded data. A forecast that reports a stopped order as comfortable is worse than no
   * forecast, because somebody will believe it.
   *
   * So the days stay honest and the *status* tells the truth: a blocked order is never
   * reported as on track.
   */
  const blocked = projected.filter((stage) => stage.status === "BLOCKED");

  /**
   * Forecast finish.
   *
   * A completed order finishes on its last completion, not on a forecast. An order
   * with no stages has nothing to forecast from — null rather than a guess, so the UI
   * can say "no stages yet" instead of showing a confident wrong date.
   */
  const projectedOn = allDone
    ? (projected.reduce<Date | null>(
        (latest, stage) =>
          stage.completedAt && (!latest || stage.completedAt > latest) ? stage.completedAt : latest,
        null,
      ) ?? asOf)
    : stages.length === 0
      ? null
      : // `remainingWork - 1` because the first remaining day is today, not tomorrow.
        addWorkingDays(asOf, Math.max(0, remainingWork - 1), holidays);

  const slipDays = projectedOn
    ? workingDaysBetween(order.promisedOn, projectedOn, holidays) - 1
    : 0;

  const started = projected.some((stage) => stage.startedAt !== null);

  const derivedStatus: OrderProjection["derivedStatus"] = allDone
    ? "COMPLETED"
    : daysToPromise < 0
      ? // The promise date has gone and the work has not finished. Late is a fact now,
        // not a forecast.
        "DELAYED"
      : slipDays > 0 || blocked.length > 0
        ? // Either the sum says late, or something has stopped. Both need attention.
          "AT_RISK"
        : started
          ? "IN_PROGRESS"
          : "PENDING";

  const completedCount = projected.filter((stage) => stage.status === "COMPLETED").length;

  return {
    stages: projected,
    projectedOn,
    slipDays,
    daysToPromise,
    derivedStatus,
    currentStage: projected.find((stage) => stage.isCurrent) ?? null,
    bottlenecks: projected
      .filter((stage) => stage.overrun > 0)
      .sort((a, b) => b.overrun - a.overrun),
    blockedStages: blocked,
    totalAllotted,
    stageCompletion: stages.length === 0 ? 0 : Math.round((completedCount / stages.length) * 100),
    weightedProgress:
      stages.length === 0
        ? 0
        : Math.round(
            projected.reduce((sum, stage) => sum + stage.progressPercent, 0) / stages.length,
          ),
  };
}

/**
 * One line explaining the forecast, in the words the works manager would use.
 *
 * Lives here beside the maths so the WhatsApp digest, the orders page and the email all
 * say the same thing. A forecast phrased three different ways is three chances to be
 * misread.
 */
export function explainProjection(projection: OrderProjection): string {
  const { slipDays, daysToPromise, derivedStatus, currentStage, bottlenecks } = projection;

  if (derivedStatus === "COMPLETED") return "Delivered.";
  if (projection.stages.length === 0) return "No stages set up yet.";

  /**
   * Blocked comes first, ahead of any day count.
   *
   * Nothing can forecast when a blocker clears, so quoting a date here would be
   * inventing one. The useful sentence names what has stopped and who is on it.
   */
  const stuck = projection.blockedStages[0];
  if (stuck) {
    const owner = stuck.assignees[0] ? ` (${stuck.assignees[0].name.split(" ")[0]})` : "";
    const late = daysToPromise < 0 ? ` Already ${Math.abs(daysToPromise)} working days past the promise.` : "";
    return `Stopped: ${stuck.name}${owner} is blocked, so the finish date cannot be forecast.${late}`;
  }

  const blame = bottlenecks[0];
  const because = blame
    ? ` ${blame.name} has taken ${blame.used} of ${blame.allotted} day${
        blame.allotted === 1 ? "" : "s"
      }${blame.assignees[0] ? ` (${blame.assignees[0].name.split(" ")[0]})` : ""}.`
    : "";

  if (derivedStatus === "DELAYED") {
    const late = Math.abs(daysToPromise);
    return `Past the promised date by ${late} working day${late === 1 ? "" : "s"}.${because}`;
  }

  if (derivedStatus === "AT_RISK") {
    return `Forecast ${slipDays} day${slipDays === 1 ? "" : "s"} late.${because}`;
  }

  const spare = -slipDays;
  const where = currentStage ? ` On ${currentStage.name}.` : "";
  return spare > 0
    ? `On track with ${spare} day${spare === 1 ? "" : "s"} to spare.${where}`
    : `On track.${where}`;
}
