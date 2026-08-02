import "server-only";
import { BRAND } from "@/lib/constants/brand";
import { ORDER_STATUS_LABEL } from "@/lib/constants/enums";
import { formatDayShort, formatDayLong, toDayKey, today } from "@/lib/utils/date";
import { listOpenOrdersProjected, type OrderDto } from "@/lib/services/orders";

/**
 * The WhatsApp order summary.
 *
 * ## Written for a phone, not a report
 *
 * This is read standing up, on a small screen, at the end of a shift. So:
 *
 *   • **Worst first.** Delayed, then at risk, then on track. If the admin reads only
 *     the first three lines, those are the three that matter.
 *   • **One line per order**, and every line answers the same four things: which order,
 *     which customer, when it was promised, and how far off it now looks.
 *   • **The reason is on the line.** "ORD-0007 · 2d late · Machine shop (Satish)" tells
 *     you who to ring. A summary that reports a slip without naming the stage just moves
 *     the question along.
 *   • **No links in the body.** WhatsApp turns a bare URL into a link preview card that
 *     pushes the text off the screen, and the admin does not need a link to know who to
 *     call. One link goes at the very bottom.
 *
 * WhatsApp markup is used sparingly: `*bold*` for headings only. Underscores and
 * backticks are avoided because order references and customer names contain characters
 * that would accidentally open formatting and swallow half a line.
 */

/** Text that WhatsApp will not accidentally treat as markup. */
function safe(value: string): string {
  // A stray asterisk or underscore in a customer name would open formatting and eat
  // the rest of the line. Replacing rather than escaping, because WhatsApp has no
  // escape character.
  return value.replace(/[*_~`]/g, "-");
}

/**
 * One order, one line.
 *
 * ## The timing phrase is derived from the status, never from the raw day count
 *
 * A blocked order can have a comfortable-looking day count — the arithmetic can only assume
 * a blocked stage needs the rest of its allowance — so reading `slipDays` directly produced
 * lines like "at risk … 6d spare", which contradict themselves and teach the reader to
 * distrust the whole summary. `derivedStatus` decides the wording; the number only fills it
 * in where it means something.
 *
 * ## "Stuck on" names the stage that is actually stuck
 *
 * This used to read `bottleneckNames[0]`, which is a *historical* list and includes finished
 * stages that ran over. The result was "stuck on Machine shop" while Machine shop was
 * complete and Assembly was the blocked one — pointing the works manager at the wrong
 * person. `holdingUp` excludes completed stages by construction.
 */
function orderLine(order: OrderDto): string {
  const { projection } = order;
  const promised = formatDayShort(order.promisedOn);

  const timing =
    projection.derivedStatus === "DELAYED"
      ? `${Math.abs(projection.daysToPromise)}d past due`
      : projection.isStopped
        ? // A blocked stage has no knowable end, so there is no date to quote.
          "stopped — no finish date"
        : projection.derivedStatus === "AT_RISK"
          ? `forecast ${projection.slipDays}d late`
        : projection.derivedStatus === "COMPLETED"
          ? "delivered"
          : projection.slipDays < 0
            ? `${Math.abs(projection.slipDays)}d spare`
            : "on the date";

  // Who to ring. Blocked stage first, then whatever is currently running.
  const where = projection.holdingUpName
    ? projection.holdingUpIsLate
      ? ` · stuck on ${safe(projection.holdingUpName)}`
      : ` · on ${safe(projection.holdingUpName)}`
    : "";

  const who = projection.holdingUpOwner ? ` (${safe(projection.holdingUpOwner)})` : "";

  return `• ${order.orderNumber} ${safe(order.customerName)} — due ${promised}, ${timing}${where}${who}`;
}

export interface OrderDigest {
  /** The full multi-line report, for a free-form send. */
  text: string;
  /** Single-line values for the template used when no service window is open. */
  templateParams: string[];
  counts: { open: number; delayed: number; atRisk: number; onTrack: number };
  /** False when there is genuinely nothing to report. */
  worthSending: boolean;
}

/**
 * Builds the digest.
 *
 * `orders` is injectable so the inbound "STATUS" reply and the scheduled push share one
 * implementation — the admin asking at 11am must get the same answer the cron would send
 * at 6pm.
 */
export async function buildOrderDigest(orders?: OrderDto[]): Promise<OrderDigest> {
  const all = orders ?? (await listOpenOrdersProjected());
  const now = today();

  const delayed = all.filter((order) => order.projection.derivedStatus === "DELAYED");
  const atRisk = all.filter((order) => order.projection.derivedStatus === "AT_RISK");
  const onTrack = all.filter(
    (order) => !delayed.includes(order) && !atRisk.includes(order),
  );

  const worstFirst = (a: OrderDto, b: OrderDto) => b.projection.slipDays - a.projection.slipDays;

  const lines: string[] = [`*${BRAND.name} — orders as at ${formatDayLong(now)}*`, ""];

  if (all.length === 0) {
    lines.push("No open orders.");
  } else {
    lines.push(
      `${all.length} open · ${delayed.length} late · ${atRisk.length} at risk · ${onTrack.length} on track`,
      "",
    );

    if (delayed.length > 0) {
      lines.push(`*Late (${delayed.length})*`);
      lines.push(...[...delayed].sort(worstFirst).map(orderLine), "");
    }

    if (atRisk.length > 0) {
      lines.push(`*Will be late unless something changes (${atRisk.length})*`);
      lines.push(...[...atRisk].sort(worstFirst).map(orderLine), "");
    }

    if (onTrack.length > 0) {
      lines.push(`*On track (${onTrack.length})*`);
      // On-track orders sort by promised date: the next thing out of the door first.
      lines.push(
        ...[...onTrack]
          .sort((a, b) => a.promisedOn.getTime() - b.promisedOn.getTime())
          .map(orderLine),
        "",
      );
    }
  }

  // A single link, last, so WhatsApp's preview card cannot push the report off screen.
  lines.push("Reply STATUS any time for this list.");

  const worstSlip = Math.max(0, ...all.map((order) => order.projection.slipDays));
  const worst = [...all].sort(worstFirst)[0];

  return {
    text: lines.join("\n").trim(),
    // Single-line values only — see the note in lib/messaging/send.ts.
    templateParams: [
      formatDayShort(now),
      String(all.length),
      String(delayed.length + atRisk.length),
      worst && worstSlip > 0
        ? `${worst.orderNumber} (${worstSlip}d)`
        : "none",
    ],
    counts: {
      open: all.length,
      delayed: delayed.length,
      atRisk: atRisk.length,
      onTrack: onTrack.length,
    },
    // An empty board still gets the morning "nothing open" once, but there is no point
    // sending it when there is nothing and nothing changed.
    worthSending: all.length > 0,
  };
}

/**
 * The message sent the moment an order starts forecasting late.
 *
 * Separate from the digest because it is a different job: the digest is a review, this
 * is an interruption. It is deliberately three lines — if it takes longer to read than
 * to act on, it will be ignored.
 */
export function buildRiskAlert(order: OrderDto): string {
  const { projection } = order;

  /*
   * `holdingUpName`, not `bottleneckNames[0]`. The latter is ranked by overrun and includes
   * finished stages, so an alert could name a stage that was already done while the actual
   * blocker went unmentioned — the one fact the reader needed.
   */
  const blame = projection.holdingUpName;
  const owner = projection.holdingUpOwner ? ` (${projection.holdingUpOwner})` : "";

  return [
    projection.isStopped ? `*${order.orderNumber} is stopped*` : `*${order.orderNumber} will be late*`,
    "",
    `${safe(order.title)}`,
    `${safe(order.customerName)} · promised ${formatDayShort(order.promisedOn)}`,
    // A stopped stage has no knowable end, so quoting a date would be inventing one.
    projection.isStopped
      ? "No finish date until it is unblocked"
      : projection.projectedOn
        ? `Now forecast ${formatDayShort(projection.projectedOn)} — ${projection.slipDays}d late`
        : `Forecast ${projection.slipDays}d late`,
    blame ? `Held up on ${safe(blame)}${owner}` : "",
    "",
    projection.summary,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Confirmation when an order goes out of the door. Short on purpose. */
export function buildDeliveredAlert(order: OrderDto): string {
  const early = -order.projection.slipDays;

  return [
    `*${order.orderNumber} delivered*`,
    "",
    `${safe(order.title)}`,
    `${safe(order.customerName)} · promised ${formatDayShort(order.promisedOn)}`,
    early > 0
      ? `Finished ${early} day${early === 1 ? "" : "s"} early.`
      : early === 0
        ? "Finished on the date."
        : `Finished ${Math.abs(early)} day${Math.abs(early) === 1 ? "" : "s"} late.`,
  ].join("\n");
}

/**
 * The reply to an unrecognised inbound message.
 *
 * Worth having: the admin will text "hi" or "?" at some point, and a silent number reads
 * as broken. It also opens the service window, which makes the next message free.
 */
export function buildHelpReply(): string {
  return [
    `*${BRAND.name}*`,
    "",
    "Reply with:",
    "STATUS — every open order and where it stands",
    "LATE — only the orders running behind",
    "",
    "You will also get this automatically at the end of each working day.",
  ].join("\n");
}

/**
 * The morning brief.
 *
 * ## Why this exists as well as the evening digest
 *
 * The evening summary is a review — it tells you what happened. By then the day is gone.
 * The whole premise of the forecast is acting *before* a promise breaks, and the only time
 * you can act on a day is at the start of it.
 *
 * So this answers a narrower, more useful question: **what needs a decision today.** It
 * leads with what is due today, then what is already late, then what will be late unless
 * something changes. Orders that are comfortably on track are reduced to a single count —
 * they need nothing from anybody this morning, and listing them buries the three that do.
 */
export async function buildMorningBrief(orders?: OrderDto[]): Promise<OrderDigest> {
  const all = orders ?? (await listOpenOrdersProjected());
  const now = today();
  const todayKey = toDayKey(now);

  const dueToday = all.filter((order) => toDayKey(order.promisedOn) === todayKey);
  const late = all.filter((order) => order.projection.derivedStatus === "DELAYED");
  const atRisk = all.filter((order) => order.projection.derivedStatus === "AT_RISK");

  // An order due today that is also late belongs in one place, not two.
  const alsoDue = new Set(dueToday.map((order) => order.id));
  const lateNotDue = late.filter((order) => !alsoDue.has(order.id));
  const riskNotDue = atRisk.filter((order) => !alsoDue.has(order.id));

  const needsNothing = all.length - dueToday.length - lateNotDue.length - riskNotDue.length;
  const worstFirst = (a: OrderDto, b: OrderDto) => b.projection.slipDays - a.projection.slipDays;

  const lines: string[] = [`*Good morning — ${formatDayLong(now)}*`, ""];

  if (dueToday.length + lateNotDue.length + riskNotDue.length === 0) {
    lines.push(
      all.length === 0
        ? "No open orders."
        : `Nothing needs a decision today. All ${all.length} open order${
            all.length === 1 ? "" : "s"
          } are forecast to land on or before the promised date.`,
    );
  } else {
    if (dueToday.length > 0) {
      lines.push(`*Due today (${dueToday.length})*`);
      lines.push(...[...dueToday].sort(worstFirst).map(orderLine), "");
    }
    if (lateNotDue.length > 0) {
      lines.push(`*Already late (${lateNotDue.length})*`);
      lines.push(...[...lateNotDue].sort(worstFirst).map(orderLine), "");
    }
    if (riskNotDue.length > 0) {
      lines.push(`*Will slip unless something changes (${riskNotDue.length})*`);
      lines.push(...[...riskNotDue].sort(worstFirst).map(orderLine), "");
    }
    if (needsNothing > 0) {
      lines.push(
        `${needsNothing} other order${needsNothing === 1 ? "" : "s"} on track — nothing needed.`,
        "",
      );
    }
  }

  lines.push("Reply STATUS for everything, or LATE for just the problems.");

  const worst = [...all].sort(worstFirst)[0];
  const worstSlip = Math.max(0, ...all.map((order) => order.projection.slipDays));

  return {
    text: lines.join("\n").trim(),
    templateParams: [
      formatDayShort(now),
      String(all.length),
      String(dueToday.length + lateNotDue.length + riskNotDue.length),
      worst && worstSlip > 0 ? `${worst.orderNumber} (${worstSlip}d)` : "none",
    ],
    counts: {
      open: all.length,
      delayed: late.length,
      atRisk: atRisk.length,
      onTrack: Math.max(0, needsNothing),
    },
    // A morning with nothing to decide is worth saying once — it is a short line, and
    // silence would read as the integration having stopped.
    worthSending: all.length > 0,
  };
}

/** Just the orders running behind, for the LATE command. */
export async function buildLateDigest(orders?: OrderDto[]): Promise<OrderDigest> {
  const all = orders ?? (await listOpenOrdersProjected());
  const behind = all.filter((order) =>
    ["DELAYED", "AT_RISK"].includes(order.projection.derivedStatus),
  );

  if (behind.length === 0) {
    const digest = await buildOrderDigest(all);
    return {
      ...digest,
      text: [
        `*${BRAND.name}*`,
        "",
        "Nothing running late. All " +
          `${all.length} open order${all.length === 1 ? "" : "s"} ` +
          "are forecast to land on or before the promised date.",
      ].join("\n"),
      worthSending: true,
    };
  }

  return buildOrderDigest(behind);
}

/** Human-readable status label, exported so the webhook and the UI agree. */
export function statusLabel(order: OrderDto): string {
  return ORDER_STATUS_LABEL[order.projection.derivedStatus];
}
