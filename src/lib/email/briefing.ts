import "server-only";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { BRAND } from "@/lib/constants/brand";
import {
  ATTENDANCE_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  asAttendanceStatus,
  asOrderStatus,
  asTaskPriority,
  asTaskStatus,
} from "@/lib/constants/enums";
import { formatDayShort, subDays, today, toDayKey } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/format";
import { listOpenOrdersProjected } from "@/lib/services/orders";

/**
 * The one email the admin gets.
 *
 * ## What this replaces
 *
 * Every routine event used to send its own mail, and the admin is the only person who
 * decides leave, decides expenses, and owns the schedule — so a normal Tuesday put eight or
 * nine separate emails in front of one man. This is that same information, once, ordered so
 * that the part he can act on is at the top.
 *
 * ## Ordered by what it costs to ignore
 *
 *   1. Orders in trouble — a promise to somebody outside the company, **with the stage and
 *      the person**, because "ORD-0007 is late" only prompts a question and
 *      "stuck on Assembly (Ramesh)" answers it.
 *   2. Waiting on you — leave and claims that cannot move until he decides.
 *   3. Blocked work — somebody is stopped and cannot unstick themselves.
 *   4. Done today — the reassuring part, and short.
 *   5. Exceptions — who was absent, who did not file.
 *
 * Anything with nothing in it is dropped. A briefing that always has nine headings teaches
 * you to skim past all nine.
 *
 * ## Per-order, per-stage
 *
 * The client asked to know "what is happening at each level for each order". That is why the
 * order section nests: one line for the order, then a line per stage with days used against
 * days allotted. It is the only section that goes two levels deep, because it is the only
 * one where the detail changes what you would do.
 */

export interface BriefingSection {
  heading: string;
  tone: "critical" | "warning" | "neutral" | "good";
  /** Optional one-line explanation under the heading. */
  note?: string;
  items: BriefingItem[];
}

export interface BriefingItem {
  /** Bold leading text — a reference, a name. */
  label: string;
  /** The substance of the line. */
  text: string;
  /** Small trailing detail: a date, an amount, a count. */
  meta?: string;
  url?: string;
  /** Nested detail, used by the order section for its stages. */
  children?: Array<{ text: string; meta?: string; late?: boolean }>;
}

export interface Briefing {
  sections: BriefingSection[];
  stats: {
    ordersOpen: number;
    ordersLate: number;
    awaitingDecision: number;
    blocked: number;
    completedToday: number;
    absent: number;
  };
  /** False when the day genuinely produced nothing worth an email. */
  worthSending: boolean;
}

export async function buildDailyBriefing(): Promise<Briefing> {
  const now = today();
  // `today()` is already UTC midnight, so it *is* the start of the day.
  const dayStart = now;
  const since = subDays(now, 1);
  const base = env.NEXT_PUBLIC_APP_URL;

  const [
    orders,
    pendingLeave,
    pendingClaims,
    blockedTasks,
    completedTasks,
    deliveredOrders,
    attendance,
    missingReports,
  ] = await Promise.all([
    listOpenOrdersProjected(),

    prisma.leaveRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 12,
      select: {
        id: true,
        type: true,
        days: true,
        startDate: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    }),

    prisma.expenseClaim.findMany({
      where: { status: "SUBMITTED" },
      orderBy: { submittedAt: "asc" },
      take: 12,
      select: {
        id: true,
        claimNumber: true,
        title: true,
        amountMinor: true,
        currency: true,
        submittedAt: true,
        user: { select: { name: true } },
      },
    }),

    prisma.task.findMany({
      where: { status: "BLOCKED" },
      orderBy: { updatedAt: "desc" },
      take: 12,
      select: {
        id: true,
        taskNumber: true,
        title: true,
        blockedReason: true,
        order: { select: { orderNumber: true } },
        assignees: { select: { user: { select: { name: true } } } },
      },
    }),

    prisma.task.findMany({
      where: { status: "COMPLETED", completedAt: { gte: dayStart } },
      orderBy: { completedAt: "desc" },
      take: 15,
      select: {
        id: true,
        taskNumber: true,
        title: true,
        order: { select: { orderNumber: true } },
        assignees: { select: { user: { select: { name: true } } } },
      },
    }),

    prisma.order.findMany({
      where: { status: "COMPLETED", completedOn: { gte: since } },
      select: { id: true, orderNumber: true, customerName: true, slipDays: true },
    }),

    prisma.attendance.findMany({
      where: { date: now, status: { in: ["ABSENT", "LEAVE", "HALF_DAY"] } },
      select: { status: true, user: { select: { name: true } } },
    }),

    prisma.user.findMany({
      where: {
        status: "ACTIVE",
        dsrReminderOptOut: false,
        attendance: { none: { date: now, status: { in: ["LEAVE", "HOLIDAY", "ABSENT"] } } },
        reports_dsr: { none: { date: now, status: { in: ["SUBMITTED", "REVIEWED", "FLAGGED"] } } },
      },
      select: { name: true },
    }),
  ]);

  const sections: BriefingSection[] = [];

  // --- 1. Orders in trouble, with their stages ----------------------------
  const late = orders.filter((order) => order.projection.derivedStatus === "DELAYED");
  const atRisk = orders.filter((order) => order.projection.derivedStatus === "AT_RISK");
  const trouble = [...late, ...atRisk].sort(
    (a, b) => b.projection.slipDays - a.projection.slipDays,
  );

  if (trouble.length > 0) {
    sections.push({
      heading: "Orders that will miss their date",
      tone: late.length > 0 ? "critical" : "warning",
      note: "Each stage shows working days used against days allotted.",
      items: trouble.map((order) => ({
        label: order.orderNumber,
        text: `${order.customerName} — ${order.projection.summary}`,
        meta: `promised ${formatDayShort(order.promisedOn)} · ${
          ORDER_STATUS_LABEL[order.projection.derivedStatus]
        }`,
        url: `${base}/orders/${order.id}`,
        // The per-stage detail the client asked for.
        children: order.stages.map((stage) => ({
          text: `${stage.position}. ${stage.name}${
            stage.assignees[0] ? ` — ${stage.assignees[0].name}` : " — unassigned"
          }`,
          meta:
            stage.status === "COMPLETED"
              ? `done in ${stage.used}/${stage.allottedDays}d`
              : stage.status === "BLOCKED"
                ? `blocked · ${stage.used}/${stage.allottedDays}d used`
                : stage.startedAt
                  ? `${stage.used}/${stage.allottedDays}d used · ${stage.progressPercent}%`
                  : `not started · ${stage.allottedDays}d allotted`,
          late: stage.overrun > 0 || stage.status === "BLOCKED",
        })),
      })),
    });
  }

  // --- 2. Waiting on a decision ------------------------------------------
  const decisions: BriefingItem[] = [
    ...pendingClaims.map((claim) => ({
      label: claim.claimNumber,
      text: `${claim.user.name} — ${claim.title}`,
      meta: `${formatMoney(claim.amountMinor, claim.currency)} · waiting ${daysWaiting(
        claim.submittedAt,
        now,
      )}`,
      url: `${base}/expenses/${claim.id}`,
    })),
    ...pendingLeave.map((request) => ({
      label: request.user.name,
      text: `${request.days} day${request.days === 1 ? "" : "s"} of ${request.type.toLowerCase()} leave from ${formatDayShort(
        request.startDate,
      )}`,
      meta: `waiting ${daysWaiting(request.createdAt, now)}`,
      url: `${base}/leave/${request.id}`,
    })),
  ];

  if (decisions.length > 0) {
    sections.push({
      heading: "Waiting on you",
      tone: "warning",
      note: "Nothing here moves until you decide.",
      items: decisions,
    });
  }

  // --- 3. Blocked work ---------------------------------------------------
  if (blockedTasks.length > 0) {
    sections.push({
      heading: "Blocked",
      tone: "critical",
      note: "Somebody is stopped and cannot clear this themselves.",
      items: blockedTasks.map((task) => ({
        label: task.order?.orderNumber ?? task.taskNumber,
        text: `${task.title}${
          task.assignees[0] ? ` — ${task.assignees[0].user.name}` : ""
        }`,
        meta: task.blockedReason ?? "no reason recorded",
        url: `${base}/tasks/${task.id}`,
      })),
    });
  }

  // --- 4. Finished today -------------------------------------------------
  const done: BriefingItem[] = [
    ...deliveredOrders.map((order) => ({
      label: order.orderNumber,
      text: `Delivered to ${order.customerName}`,
      meta:
        order.slipDays > 0
          ? `${order.slipDays}d late`
          : order.slipDays < 0
            ? `${Math.abs(order.slipDays)}d early`
            : "on the date",
      url: `${base}/orders/${order.id}`,
    })),
    ...completedTasks.map((task) => ({
      label: task.order?.orderNumber ?? task.taskNumber,
      text: task.title,
      meta: task.assignees[0]?.user.name ?? undefined,
      url: `${base}/tasks/${task.id}`,
    })),
  ];

  if (done.length > 0) {
    sections.push({
      heading: "Finished today",
      tone: "good",
      items: done,
    });
  }

  // --- 5. Exceptions -----------------------------------------------------
  const exceptions: BriefingItem[] = [];

  const away = attendance.filter((row) => asAttendanceStatus(row.status) !== "HALF_DAY");
  if (away.length > 0) {
    exceptions.push({
      label: "Not in",
      text: away
        .map((row) => `${row.user.name} (${ATTENDANCE_STATUS_LABEL[asAttendanceStatus(row.status)]})`)
        .join(", "),
    });
  }

  if (missingReports.length > 0) {
    exceptions.push({
      label: "No report filed",
      text: missingReports.map((person) => person.name).join(", "),
      meta: `${missingReports.length} of the team`,
    });
  }

  if (exceptions.length > 0) {
    sections.push({ heading: "Today on the floor", tone: "neutral", items: exceptions });
  }

  const stats = {
    ordersOpen: orders.length,
    ordersLate: late.length + atRisk.length,
    awaitingDecision: decisions.length,
    blocked: blockedTasks.length,
    completedToday: done.length,
    absent: away.length,
  };

  return {
    sections,
    stats,
    // A quiet day still earns one short email — it is the record that the system is alive,
    // and its absence would be indistinguishable from a broken cron.
    worthSending: true,
  };
}

/** "2 days" / "since this morning" — how long something has sat unanswered. */
function daysWaiting(from: Date | null, now: Date): string {
  if (!from) return "unknown";
  const days = Math.floor((now.getTime() - toDayStart(from).getTime()) / 86_400_000);
  if (days <= 0) return "since today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

function toDayStart(value: Date): Date {
  return new Date(`${toDayKey(value)}T00:00:00Z`);
}

/** Re-exported so the template and the sweep agree on the shape. */
export type { BriefingSection as DailyBriefingSection };

/** Labels the template needs but should not import the enums for. */
export const BRIEFING_BRAND = BRAND.name;
export { TASK_PRIORITY_LABEL, TASK_STATUS_LABEL, asOrderStatus, asTaskPriority, asTaskStatus };
