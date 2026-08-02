/**
 * Run with: npm run check:projection
 *
 * Proves the projection engine against the scenario the client described, plus the
 * edge cases that would silently produce a wrong delivery date.
 */
import {
  addWorkingDays,
  workingDaysBetween,
  projectOrder,
  explainProjection,
  type ProjectableStage,
} from "../src/lib/orders/projection";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) {
    pass += 1;
    console.log(`  OK  ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail += 1;
    console.log(`  !!  ${label}${detail ? ` — ${detail}` : ""}`);
  }
};

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const key = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "null");

// 2026-08-03 is a Monday. Using a fixed Monday keeps every expectation readable.
const MON = day("2026-08-03");

const stage = (
  over: Partial<ProjectableStage> & { position: number; name: string },
): ProjectableStage => ({
  id: `s${over.position}`,
  allottedDays: 1,
  status: "TODO",
  startedAt: null,
  completedAt: null,
  progressPercent: 0,
  assignees: [{ id: "u1", name: "Ramesh Kumar" }],
  ...over,
});

console.log("\n=== Working-day arithmetic ===");
{
  check("Mon + 0 working days is Mon", key(addWorkingDays(MON, 0)) === "2026-08-03");
  check("Mon + 1 is Tue", key(addWorkingDays(MON, 1)) === "2026-08-04");
  // Mon 3rd + 5 working days = Mon 10th, skipping Sat 8th and Sun 9th.
  check("Mon + 5 skips the weekend to Mon", key(addWorkingDays(MON, 5)) === "2026-08-10", key(addWorkingDays(MON, 5)));

  const fri = day("2026-08-07");
  check("Fri + 1 is Mon, not Sat", key(addWorkingDays(fri, 1)) === "2026-08-10", key(addWorkingDays(fri, 1)));

  // A company holiday on Tue 4th pushes Mon + 1 to Wed 5th.
  const holidays = new Set(["2026-08-04"]);
  check(
    "a holiday is skipped",
    key(addWorkingDays(MON, 1, holidays)) === "2026-08-05",
    key(addWorkingDays(MON, 1, holidays)),
  );

  check("Mon to Mon is 1 working day (inclusive)", workingDaysBetween(MON, MON) === 1);
  check("Mon to Fri is 5 working days", workingDaysBetween(MON, day("2026-08-07")) === 5);
  check("Mon to next Mon is 6 working days", workingDaysBetween(MON, day("2026-08-10")) === 6);
  check("reversed range is negative", workingDaysBetween(day("2026-08-07"), MON) === -5);
}

console.log("\n=== The client's scenario: 3 people, 1 day each, promised in 3 ===");
{
  // Promised Wed 5th: Mon + 3 working days inclusive.
  const order = { promisedOn: day("2026-08-05"), startedOn: MON };

  // Nothing started yet, on the Monday it was created.
  const fresh = projectOrder(
    order,
    [
      stage({ position: 1, name: "Machine shop" }),
      stage({ position: 2, name: "Assembly" }),
      stage({ position: 3, name: "Final testing" }),
    ],
    { asOf: MON },
  );
  check("fresh order forecasts the promised date", key(fresh.projectedOn) === "2026-08-05", key(fresh.projectedOn));
  check("fresh order has no slip", fresh.slipDays === 0, `${fresh.slipDays}`);
  check("fresh order is PENDING", fresh.derivedStatus === "PENDING");
  check("current stage is the first", fresh.currentStage?.name === "Machine shop");

  // Now the failure the client described: person one takes three days, not one.
  // It is Wednesday, stage 1 is still running and has used 3 of its 1 day.
  const slipping = projectOrder(
    order,
    [
      stage({
        position: 1,
        name: "Machine shop",
        status: "IN_PROGRESS",
        startedAt: MON,
        progressPercent: 60,
        assignees: [{ id: "u1", name: "Satish Chandra Dubey" }],
      }),
      stage({ position: 2, name: "Assembly" }),
      stage({ position: 3, name: "Final testing" }),
    ],
    { asOf: day("2026-08-05") },
  );

  check(
    "stage 1 shows 3 working days used against 1 allotted",
    slipping.stages[0]!.used === 3 && slipping.stages[0]!.allotted === 1,
    `used ${slipping.stages[0]!.used}, allotted ${slipping.stages[0]!.allotted}`,
  );
  check("stage 1 overrun is 2 days", slipping.stages[0]!.overrun === 2, `${slipping.stages[0]!.overrun}`);
  // Wed + (1 left on stage 1 + 1 + 1) - 1 = Fri 7th. Promise was Wed 5th → 2 days late.
  check("forecast slips to Friday", key(slipping.projectedOn) === "2026-08-07", key(slipping.projectedOn));
  check("slip is 2 working days", slipping.slipDays === 2, `${slipping.slipDays}`);
  check("status is AT_RISK before the date passes", slipping.derivedStatus === "AT_RISK");
  check("the bottleneck is named", slipping.bottlenecks[0]?.name === "Machine shop");
  check(
    "the explanation names the person and the overrun",
    explainProjection(slipping).includes("Satish") && explainProjection(slipping).includes("2 days late"),
    explainProjection(slipping),
  );
}

console.log("\n=== Status derivation ===");
{
  const threeStages = [
    stage({ position: 1, name: "A" }),
    stage({ position: 2, name: "B" }),
    stage({ position: 3, name: "C" }),
  ];

  // Promise already gone, work unfinished.
  const late = projectOrder({ promisedOn: day("2026-07-30"), startedOn: MON }, threeStages, {
    asOf: MON,
  });
  check("past the promise with work left is DELAYED", late.derivedStatus === "DELAYED");
  check("daysToPromise is negative once past", late.daysToPromise < 0, `${late.daysToPromise}`);

  // All done, and early.
  const done = projectOrder(
    { promisedOn: day("2026-08-10"), startedOn: MON },
    threeStages.map((s, i) =>
      stage({
        ...s,
        position: i + 1,
        name: s.name,
        status: "COMPLETED",
        startedAt: MON,
        completedAt: day("2026-08-04"),
        progressPercent: 100,
      }),
    ),
    { asOf: day("2026-08-06") },
  );
  check("all stages done is COMPLETED", done.derivedStatus === "COMPLETED");
  check(
    "a finished order forecasts its actual last completion, not today",
    key(done.projectedOn) === "2026-08-04",
    key(done.projectedOn),
  );
  check("finishing early gives a negative slip", done.slipDays < 0, `${done.slipDays}`);
  check("stage completion is 100%", done.stageCompletion === 100);

  // Started and comfortably on track.
  const running = projectOrder(
    { promisedOn: day("2026-08-14"), startedOn: MON },
    [
      stage({ position: 1, name: "A", status: "COMPLETED", startedAt: MON, completedAt: MON, progressPercent: 100 }),
      stage({ position: 2, name: "B", status: "IN_PROGRESS", startedAt: day("2026-08-04"), progressPercent: 50 }),
      stage({ position: 3, name: "C" }),
    ],
    { asOf: day("2026-08-04") },
  );
  check("running and ahead is IN_PROGRESS", running.derivedStatus === "IN_PROGRESS", running.derivedStatus);
  check("explanation mentions spare days", explainProjection(running).includes("to spare"), explainProjection(running));
}

console.log("\n=== A blocked stage is never reported as on track ===");
{
  /**
   * The case real seeded data exposed.
   *
   * A stage blocked on a rejected bearing consignment, with a generous promise date, was
   * forecast "6 days early" — because the day count can only assume a blocked stage needs
   * the rest of its allowance. A stopped order reported as comfortable is worse than no
   * forecast at all, because somebody will believe it.
   */
  const blocked = projectOrder(
    { promisedOn: day("2026-08-21"), startedOn: MON },
    [
      stage({
        position: 1,
        name: "Machine shop",
        status: "COMPLETED",
        startedAt: MON,
        completedAt: day("2026-08-04"),
        progressPercent: 100,
      }),
      stage({
        position: 2,
        name: "Assembly",
        allottedDays: 3,
        status: "BLOCKED",
        startedAt: day("2026-08-05"),
        progressPercent: 30,
        assignees: [{ id: "u2", name: "Ramesh Kumar Sahu" }],
      }),
      stage({ position: 3, name: "Final testing" }),
    ],
    { asOf: day("2026-08-10") },
  );

  check("a blocked stage is surfaced", blocked.blockedStages.length === 1, blocked.blockedStages[0]?.name);
  check(
    "the order is AT_RISK even though the day count says early",
    blocked.derivedStatus === "AT_RISK",
    `${blocked.derivedStatus}, slip ${blocked.slipDays}`,
  );
  check("and the slip arithmetic stays honest", blocked.slipDays < 0, `${blocked.slipDays}`);

  /*
   * `isStopped` exists so no screen has to re-derive this. Every consumer that inferred it
   * for itself eventually shipped "At risk · 6d spare" — two true numbers, one false claim.
   */
  check("the projection says outright that it is stopped", blocked.isStopped === true);
  check(
    "the explanation leads with the block, not a date",
    explainProjection(blocked).startsWith("Stopped:") &&
      explainProjection(blocked).includes("Ramesh") &&
      explainProjection(blocked).includes("cannot be forecast"),
    explainProjection(blocked),
  );

  // Clearing the block must let the order read normally again.
  const unblocked = projectOrder(
    { promisedOn: day("2026-08-21"), startedOn: MON },
    [
      stage({
        position: 1,
        name: "Machine shop",
        status: "COMPLETED",
        startedAt: MON,
        completedAt: day("2026-08-04"),
        progressPercent: 100,
      }),
      stage({
        position: 2,
        name: "Assembly",
        allottedDays: 3,
        status: "IN_PROGRESS",
        startedAt: day("2026-08-05"),
        progressPercent: 30,
      }),
      stage({ position: 3, name: "Final testing" }),
    ],
    { asOf: day("2026-08-10") },
  );
  check(
    "clearing the block restores a normal reading",
    unblocked.derivedStatus === "IN_PROGRESS",
    unblocked.derivedStatus,
  );
  check("and no blocked stages remain", unblocked.blockedStages.length === 0);
  check("so the forecast becomes quotable again", unblocked.isStopped === false);

  // Blocked *and* past the promise is DELAYED, not merely at risk.
  const blockedAndLate = projectOrder(
    { promisedOn: day("2026-08-05"), startedOn: MON },
    [stage({ position: 1, name: "Assembly", allottedDays: 2, status: "BLOCKED", startedAt: MON })],
    { asOf: day("2026-08-10") },
  );
  check("blocked and past the date is DELAYED", blockedAndLate.derivedStatus === "DELAYED");
  check(
    "and the explanation says how far past",
    explainProjection(blockedAndLate).includes("past the promise"),
    explainProjection(blockedAndLate),
  );
}

console.log("\n=== `holdingUp` never names a finished stage ===");
{
  /**
   * The bug this covers reached the WhatsApp summary and pointed the works manager at the
   * wrong person: reading `bottlenecks[0]` produced "stuck on Machine shop" while Machine
   * shop was complete and Assembly was the blocked stage.
   */
  const overranThenBlocked = projectOrder(
    { promisedOn: day("2026-08-21"), startedOn: MON },
    [
      stage({
        position: 1,
        name: "Machine shop",
        allottedDays: 2,
        status: "COMPLETED",
        startedAt: MON,
        // Mon–Wed is 3 working days against 2 allotted, so it overran by 1.
        completedAt: day("2026-08-05"),
        progressPercent: 100,
        assignees: [{ id: "u1", name: "Satish Chandra Dubey" }],
      }),
      stage({
        position: 2,
        name: "Assembly",
        allottedDays: 3,
        status: "BLOCKED",
        startedAt: day("2026-08-06"),
        assignees: [{ id: "u2", name: "Ramesh Kumar Sahu" }],
      }),
      stage({ position: 3, name: "Final testing" }),
    ],
    { asOf: day("2026-08-10") },
  );

  check(
    "the completed stage is still listed as a historical bottleneck",
    overranThenBlocked.bottlenecks.some((s) => s.name === "Machine shop"),
    overranThenBlocked.bottlenecks.map((s) => s.name).join(", "),
  );
  check(
    "but holdingUp names the blocked stage, not the finished one",
    overranThenBlocked.holdingUp?.name === "Assembly",
    overranThenBlocked.holdingUp?.name,
  );
  check("and flags it as late", overranThenBlocked.holdingUpIsLate === true);
  check(
    "so the owner to ring is the blocked one",
    overranThenBlocked.holdingUp?.assignees[0]?.name === "Ramesh Kumar Sahu",
    overranThenBlocked.holdingUp?.assignees[0]?.name,
  );

  // An on-track order whose *earlier* stage overran must not read as stuck.
  const overranButFine = projectOrder(
    { promisedOn: day("2026-08-28"), startedOn: MON },
    [
      stage({
        position: 1,
        name: "Motor winding",
        allottedDays: 1,
        status: "COMPLETED",
        startedAt: MON,
        completedAt: day("2026-08-05"),
        progressPercent: 100,
      }),
      stage({
        position: 2,
        name: "Blade balancing",
        allottedDays: 5,
        status: "IN_PROGRESS",
        startedAt: day("2026-08-10"),
        progressPercent: 20,
      }),
    ],
    { asOf: day("2026-08-11") },
  );
  check(
    "an on-track order points at the running stage",
    overranButFine.holdingUp?.name === "Blade balancing",
    overranButFine.holdingUp?.name,
  );
  check(
    "and does not claim it is stuck",
    overranButFine.holdingUpIsLate === false,
    `late=${overranButFine.holdingUpIsLate}`,
  );

  // A delivered order is waiting on nothing at all.
  const delivered = projectOrder(
    { promisedOn: day("2026-08-21"), startedOn: MON },
    [
      stage({
        position: 1,
        name: "Everything",
        status: "COMPLETED",
        startedAt: MON,
        completedAt: day("2026-08-05"),
        progressPercent: 100,
      }),
    ],
    { asOf: day("2026-08-10") },
  );
  check("a delivered order holds nothing up", delivered.holdingUp === null);
  check("and is not flagged late", delivered.holdingUpIsLate === false);
}

console.log("\n=== Edge cases that would produce a wrong date ===");
{
  // A running stage that has burned its whole allowance must still need a day left,
  // or the forecast would claim it finishes the moment you look at it.
  const burned = projectOrder(
    { promisedOn: day("2026-08-05"), startedOn: MON },
    [stage({ position: 1, name: "A", allottedDays: 1, status: "IN_PROGRESS", startedAt: MON })],
    { asOf: day("2026-08-07") },
  );
  check(
    "an overrunning stage still needs at least one day",
    burned.stages[0]!.remaining === 1,
    `${burned.stages[0]!.remaining}`,
  );
  check("so the forecast is today, not the past", key(burned.projectedOn) === "2026-08-07", key(burned.projectedOn));

  // No stages: nothing to forecast from.
  const empty = projectOrder({ promisedOn: day("2026-08-05"), startedOn: null }, [], { asOf: MON });
  check("an order with no stages forecasts null", empty.projectedOn === null);
  check("and does not claim a slip", empty.slipDays === 0);
  check("and says so plainly", explainProjection(empty).includes("No stages"), explainProjection(empty));

  // A missing allotment is treated as one day rather than zero, which would make a
  // stage free and under-forecast the whole order.
  const noAllotment = projectOrder(
    { promisedOn: day("2026-08-05"), startedOn: null },
    [stage({ position: 1, name: "A", allottedDays: null })],
    { asOf: MON },
  );
  check("a null allotment counts as one day", noAllotment.stages[0]!.allotted === 1);
  check("total allotted reflects it", noAllotment.totalAllotted === 1);

  // Stages arriving out of order must still be sequenced correctly.
  const shuffled = projectOrder(
    { promisedOn: day("2026-08-10"), startedOn: null },
    [
      stage({ position: 3, name: "Third" }),
      stage({ position: 1, name: "First" }),
      stage({ position: 2, name: "Second" }),
    ],
    { asOf: MON },
  );
  check(
    "stages are sorted by position regardless of input order",
    shuffled.stages.map((s) => s.name).join(",") === "First,Second,Third",
    shuffled.stages.map((s) => s.name).join(","),
  );
  check("the current stage is the first by position", shuffled.currentStage?.name === "First");

  // A weekend inside a stage must not be counted as work.
  const overWeekend = projectOrder(
    { promisedOn: day("2026-08-10"), startedOn: day("2026-08-07") },
    [stage({ position: 1, name: "A", allottedDays: 2, status: "IN_PROGRESS", startedAt: day("2026-08-07") })],
    { asOf: day("2026-08-10") },
  );
  // Fri, Sat, Sun, Mon → 2 working days used, not 4.
  check(
    "a weekend inside a stage is not counted as work",
    overWeekend.stages[0]!.used === 2,
    `${overWeekend.stages[0]!.used} working days`,
  );
  check("so an on-time stage is not reported as overrunning", overWeekend.stages[0]!.overrun === 0);

  // A holiday must behave the same way.
  const withHoliday = projectOrder(
    { promisedOn: day("2026-08-20"), startedOn: null },
    [stage({ position: 1, name: "A", allottedDays: 3 })],
    { asOf: day("2026-08-13"), holidays: new Set(["2026-08-14"]) },
  );
  // Thu 13 + 3 working days, skipping Fri 14 (holiday) and the weekend → Tue 18.
  check(
    "a holiday pushes the forecast out",
    key(withHoliday.projectedOn) === "2026-08-18",
    key(withHoliday.projectedOn),
  );

  // Weighted progress should reflect partial work, unlike stage completion.
  const partial = projectOrder(
    { promisedOn: day("2026-08-14"), startedOn: MON },
    [
      stage({ position: 1, name: "A", status: "COMPLETED", startedAt: MON, completedAt: MON, progressPercent: 100 }),
      stage({ position: 2, name: "B", status: "IN_PROGRESS", startedAt: MON, progressPercent: 50 }),
    ],
    { asOf: day("2026-08-04") },
  );
  check("stage completion counts only finished stages", partial.stageCompletion === 50);
  check("weighted progress counts partial work", partial.weightedProgress === 75, `${partial.weightedProgress}`);
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
