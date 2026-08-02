import "server-only";
import { formatReference, parseReference } from "@/lib/services/reference";
import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma, containsInsensitive } from "@/lib/db/prisma";
import { isManagerOrAdmin, type Actor } from "@/lib/auth/rbac";
import {
  asOrderActivityKind,
  asOrderStatus,
  asTaskPriority,
  asTaskStatus,
  ORDER_ATTENTION_STATUSES,
  ORDER_OPEN_STATUSES,
  type OrderActivityKind,
  type OrderStatus,
  type TaskPriority,
} from "@/lib/constants/enums";
import { addDays, startOfYear, today, toDayKey } from "@/lib/utils/date";
import {
  explainProjection,
  projectOrder,
  type OrderProjection,
} from "@/lib/orders/projection";

/**
 * Order reads.
 *
 * Writes live in `src/server/actions/orders.ts`. The projection engine in
 * `lib/orders/projection.ts` does the forecasting; this module's job is to feed it the
 * right rows and cache the answer.
 */

/** The holiday set the projection needs. Request-cached — every order shares it. */
export const getHolidaySet = cache(async function getHolidaySet(): Promise<ReadonlySet<string>> {
  const rows = await prisma.holiday.findMany({
    where: { type: { in: ["PUBLIC", "COMPANY"] } },
    select: { date: true },
  });
  return new Set(rows.map((row) => toDayKey(row.date)));
});

const ORDER_SELECT = {
  id: true,
  orderNumber: true,
  title: true,
  customerName: true,
  customerRef: true,
  description: true,
  product: true,
  quantity: true,
  priority: true,
  status: true,
  startedOn: true,
  promisedOn: true,
  completedOn: true,
  projectedOn: true,
  slipDays: true,
  projectedAt: true,
  riskNotifiedAt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true } },
  stages: {
    orderBy: { orderPosition: "asc" },
    select: {
      id: true,
      taskNumber: true,
      title: true,
      status: true,
      orderPosition: true,
      allottedDays: true,
      startedAt: true,
      completedAt: true,
      progressPercent: true,
      blockedReason: true,
      dueOn: true,
      assignees: {
        select: { user: { select: { id: true, name: true, avatarUrl: true } } },
      },
    },
  },
} satisfies Prisma.OrderSelect;

type RawOrder = Prisma.OrderGetPayload<{ select: typeof ORDER_SELECT }>;

export interface OrderStageDto {
  id: string;
  taskNumber: string;
  name: string;
  position: number;
  allottedDays: number;
  used: number;
  remaining: number;
  overrun: number;
  isCurrent: boolean;
  status: string;
  progressPercent: number;
  blockedReason: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  assignees: Array<{ id: string; name: string; avatarUrl: string | null }>;
}

export interface OrderDto {
  id: string;
  orderNumber: string;
  title: string;
  customerName: string;
  customerRef: string | null;
  description: string | null;
  product: string | null;
  quantity: number | null;
  priority: TaskPriority;
  /** The stored status; `projection.derivedStatus` is the computed truth. */
  status: OrderStatus;
  startedOn: Date | null;
  promisedOn: Date;
  completedOn: Date | null;
  createdAt: Date;
  createdBy: { id: string; name: string };
  stages: OrderStageDto[];
  /** The forecast, computed fresh on every read of this shape. */
  projection: {
    projectedOn: Date | null;
    slipDays: number;
    daysToPromise: number;
    derivedStatus: OrderStatus;
    totalAllotted: number;
    stageCompletion: number;
    weightedProgress: number;
    currentStageName: string | null;
    /**
     * Historical. Includes finished stages that ran over, because they are the reason the
     * order is behind. Never use it to answer "what is it waiting on".
     */
    bottleneckNames: string[];
    /** The stage genuinely holding the order up, and who owns it. */
    holdingUpName: string | null;
    holdingUpOwner: string | null;
    holdingUpIsLate: boolean;
    /** Something is stopped, so the forecast above is not one. Branch on this first. */
    isStopped: boolean;
    /** One sentence, phrased identically in the UI, the email and WhatsApp. */
    summary: string;
  };
}

/**
 * Turns a row into a DTO, projecting as it goes.
 *
 * The forecast is recomputed here rather than read from the cached columns, so a page
 * never shows a stale date — `Order.projectedOn` exists for *sorting and filtering* in
 * SQL, which cannot call a TypeScript function. The two agree because the cron and every
 * write recompute the cache with this same engine.
 */
function toDto(row: RawOrder, holidays: ReadonlySet<string>, asOf: Date): OrderDto {
  const projection = projectOrder(
    { promisedOn: row.promisedOn, startedOn: row.startedOn },
    row.stages.map((stage) => ({
      id: stage.id,
      name: stage.title,
      position: stage.orderPosition ?? 0,
      allottedDays: stage.allottedDays,
      status: asTaskStatus(stage.status),
      startedAt: stage.startedAt,
      completedAt: stage.completedAt,
      progressPercent: stage.progressPercent,
      assignees: stage.assignees.map((entry) => ({
        id: entry.user.id,
        name: entry.user.name,
      })),
    })),
    { asOf, holidays },
  );

  const byId = new Map(row.stages.map((stage) => [stage.id, stage]));

  return {
    id: row.id,
    orderNumber: row.orderNumber,
    title: row.title,
    customerName: row.customerName,
    customerRef: row.customerRef,
    description: row.description,
    product: row.product,
    quantity: row.quantity,
    priority: asTaskPriority(row.priority),
    status: asOrderStatus(row.status),
    startedOn: row.startedOn,
    promisedOn: row.promisedOn,
    completedOn: row.completedOn,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    stages: projection.stages.map((stage) => {
      const raw = byId.get(stage.id);
      return {
        id: stage.id,
        taskNumber: raw?.taskNumber ?? "",
        name: stage.name,
        position: stage.position,
        allottedDays: stage.allotted,
        used: stage.used,
        remaining: stage.remaining,
        overrun: stage.overrun,
        isCurrent: stage.isCurrent,
        status: stage.status,
        progressPercent: stage.progressPercent,
        blockedReason: raw?.blockedReason ?? null,
        startedAt: stage.startedAt,
        completedAt: stage.completedAt,
        assignees:
          raw?.assignees.map((entry) => ({
            id: entry.user.id,
            name: entry.user.name,
            avatarUrl: entry.user.avatarUrl,
          })) ?? [],
      };
    }),
    projection: {
      projectedOn: projection.projectedOn,
      slipDays: projection.slipDays,
      daysToPromise: projection.daysToPromise,
      // A cancelled order keeps its stored status; the engine has no concept of it.
      derivedStatus:
        row.status === "CANCELLED" ? "CANCELLED" : (projection.derivedStatus as OrderStatus),
      totalAllotted: projection.totalAllotted,
      stageCompletion: projection.stageCompletion,
      weightedProgress: projection.weightedProgress,
      currentStageName: projection.currentStage?.name ?? null,
      bottleneckNames: projection.bottlenecks.map((stage) => stage.name),
      holdingUpName: projection.holdingUp?.name ?? null,
      holdingUpOwner: projection.holdingUp?.assignees[0]?.name.split(" ")[0] ?? null,
      holdingUpIsLate: projection.holdingUpIsLate,
      isStopped: projection.isStopped,
      summary: explainProjection(projection),
    },
  };
}

// ---------------------------------------------------------------------------
//  Visibility
// ---------------------------------------------------------------------------

/**
 * Scoping clause.
 *
 * Managers and admins see every order — an order is a company commitment, and hiding
 * half of them from the people running the floor defeats the purpose. Everyone else sees
 * only orders they have a stage on.
 */
export function orderVisibilityFor(actor: Actor): Prisma.OrderWhereInput {
  if (isManagerOrAdmin(actor)) return {};
  return { stages: { some: { assignees: { some: { userId: actor.id } } } } };
}

export const getOrder = cache(async function getOrder(id: string): Promise<OrderDto | null> {
  const [row, holidays] = await Promise.all([
    prisma.order.findUnique({ where: { id }, select: ORDER_SELECT }),
    getHolidaySet(),
  ]);
  return row ? toDto(row, holidays, today()) : null;
});

/** Stage assignee ids, for the view policy, without widening the DTO. */
export const getOrderPolicySubject = cache(async function getOrderPolicySubject(id: string) {
  const row = await prisma.order.findUnique({
    where: { id },
    select: { stages: { select: { assignees: { select: { userId: true } } } } },
  });
  if (!row) return null;

  return {
    stageAssigneeIds: row.stages.flatMap((stage) =>
      stage.assignees.map((entry) => entry.userId),
    ),
  };
});

// ---------------------------------------------------------------------------
//  Lists
// ---------------------------------------------------------------------------

export interface OrderFilters {
  q?: string;
  status?: string[];
  /** Named shortcuts the one-page view offers. */
  scope?: "open" | "attention" | "all" | "delivered";
}

export interface OrderListResult {
  rows: OrderDto[];
  summary: {
    open: number;
    onTrack: number;
    atRisk: number;
    delayed: number;
    deliveredThisMonth: number;
    /** Total working days of slip across everything at risk or late. */
    totalSlip: number;
  };
}

function buildWhere(filters: OrderFilters, actor: Actor): Prisma.OrderWhereInput {
  const search = filters.q?.trim();

  return {
    AND: [
      orderVisibilityFor(actor),
      ...(filters.status?.length ? [{ status: { in: filters.status } }] : []),
      ...(filters.scope === "open" ? [{ status: { in: [...ORDER_OPEN_STATUSES] } }] : []),
      ...(filters.scope === "attention"
        ? [{ status: { in: [...ORDER_ATTENTION_STATUSES] } }]
        : []),
      ...(filters.scope === "delivered" ? [{ status: "COMPLETED" }] : []),
      ...(search
        ? [
            {
              OR: [
                { orderNumber: containsInsensitive(search) },
                { title: containsInsensitive(search) },
                { customerName: containsInsensitive(search) },
                { customerRef: containsInsensitive(search) },
                { product: containsInsensitive(search) },
                { stages: { some: { title: containsInsensitive(search) } } },
                {
                  stages: {
                    some: { assignees: { some: { user: { name: containsInsensitive(search) } } } },
                  },
                },
              ],
            },
          ]
        : []),
    ],
  };
}

/**
 * The one-page list.
 *
 * Ordered by **slip descending, then promised date** — the order most likely to embarrass
 * somebody is at the top, which is the whole reason the page exists. Sorting by promised
 * date alone buries a badly slipping order behind an on-track one due sooner.
 *
 * Capped: this page shows everything expanded inline, so it is bounded rather than
 * paginated. A plant with more than 200 live orders needs a different screen.
 */
export async function listOrders(
  filters: OrderFilters,
  actor: Actor,
  limit = 200,
): Promise<OrderListResult> {
  const asOf = today();
  const visible = orderVisibilityFor(actor);

  const [rows, holidays, grouped, deliveredThisMonth] = await Promise.all([
    prisma.order.findMany({
      where: buildWhere(filters, actor),
      orderBy: [{ slipDays: "desc" }, { promisedOn: "asc" }],
      take: limit,
      select: ORDER_SELECT,
    }),
    getHolidaySet(),
    prisma.order.groupBy({ by: ["status"], where: visible, _count: { _all: true } }),
    prisma.order.count({
      where: {
        AND: [visible, { status: "COMPLETED", completedOn: { gte: startOfYear(asOf) } }],
      },
    }),
  ]);

  const counts = Object.fromEntries(
    grouped.map((row) => [asOrderStatus(row.status), row._count._all]),
  ) as Partial<Record<OrderStatus, number>>;

  const dtos = rows.map((row) => toDto(row, holidays, asOf));

  return {
    rows: dtos,
    summary: {
      open: ORDER_OPEN_STATUSES.reduce((sum, status) => sum + (counts[status] ?? 0), 0),
      onTrack: (counts.PENDING ?? 0) + (counts.IN_PROGRESS ?? 0),
      atRisk: counts.AT_RISK ?? 0,
      delayed: counts.DELAYED ?? 0,
      deliveredThisMonth,
      totalSlip: dtos
        .filter((order) => order.projection.slipDays > 0)
        .reduce((sum, order) => sum + order.projection.slipDays, 0),
    },
  };
}

/** Every open order, projected — for the digest and the nightly risk sweep. */
export async function listOpenOrdersProjected(): Promise<OrderDto[]> {
  const [rows, holidays] = await Promise.all([
    prisma.order.findMany({
      where: { status: { in: [...ORDER_OPEN_STATUSES] } },
      orderBy: [{ promisedOn: "asc" }],
      select: ORDER_SELECT,
    }),
    getHolidaySet(),
  ]);

  return rows.map((row) => toDto(row, holidays, today()));
}

// ---------------------------------------------------------------------------
//  Activity
// ---------------------------------------------------------------------------

export interface OrderActivityDto {
  id: string;
  kind: OrderActivityKind | "task";
  /** Free text already resolved to a sentence, so the feed component stays dumb. */
  text: string;
  comment: string | null;
  createdAt: Date;
  actor: { id: string; name: string; avatarUrl: string | null } | null;
  /** Set when the entry came from a stage rather than the order itself. */
  stage: { id: string; name: string } | null;
}

/**
 * The order's history, merging order-level events with its stages' task activity.
 *
 * Merged here rather than in the component because "what happened on this order" is one
 * question, and a reader should not have to interleave two feeds by timestamp in their
 * head. This is what the client asked for: open an order, see the latest thing that
 * happened on it.
 */
export async function getOrderFeed(orderId: string, limit = 40): Promise<OrderActivityDto[]> {
  const [orderEvents, stageUpdates] = await Promise.all([
    prisma.orderActivity.findMany({
      where: { orderId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        kind: true,
        meta: true,
        comment: true,
        createdAt: true,
        actor: { select: { id: true, name: true, avatarUrl: true } },
      },
    }),
    // The stages' own updates — the notes people post while doing the work.
    prisma.taskUpdate.findMany({
      where: { task: { orderId } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        body: true,
        progressPercent: true,
        createdAt: true,
        author: { select: { id: true, name: true, avatarUrl: true } },
        task: { select: { id: true, title: true } },
      },
    }),
  ]);

  const merged: OrderActivityDto[] = [
    ...orderEvents.map((event) => {
      const kind = asOrderActivityKind(event.kind);
      return {
        id: event.id,
        kind,
        text: describeOrderEvent(kind, event.meta),
        comment: event.comment,
        createdAt: event.createdAt,
        actor: event.actor,
        stage: null,
      };
    }),
    ...stageUpdates.map((update) => ({
      id: update.id,
      kind: "task" as const,
      text:
        update.progressPercent !== null
          ? `posted an update on ${update.task.title} (${update.progressPercent}%)`
          : `posted an update on ${update.task.title}`,
      comment: update.body,
      createdAt: update.createdAt,
      actor: update.author,
      stage: { id: update.task.id, name: update.task.title },
    })),
  ];

  return merged
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}

/**
 * Feeds for many orders at once.
 *
 * The list page shows a few recent entries under every row, and calling `getOrderFeed` per
 * row meant **two queries per order** — forty on a twenty-order page, four hundred at the
 * 200 cap. Two queries total instead, grouped in memory.
 *
 * `perOrder` is applied after grouping rather than in SQL, because "the newest four per
 * order" is a window function Prisma cannot express. Bounded by taking a generous slice of
 * the most recent rows across the whole set, which is correct here: the page only ever
 * shows recent activity, and an order with nothing recent shows nothing.
 */
export async function getOrderFeeds(
  orderIds: string[],
  perOrder = 4,
): Promise<Map<string, OrderActivityDto[]>> {
  const byOrder = new Map<string, OrderActivityDto[]>();
  if (orderIds.length === 0) return byOrder;

  // Enough rows that every order gets its quota even when one is very chatty.
  const ceiling = Math.min(2000, orderIds.length * perOrder * 4);

  const [events, updates] = await Promise.all([
    prisma.orderActivity.findMany({
      where: { orderId: { in: orderIds } },
      orderBy: { createdAt: "desc" },
      take: ceiling,
      select: {
        id: true,
        orderId: true,
        kind: true,
        meta: true,
        comment: true,
        createdAt: true,
        actor: { select: { id: true, name: true, avatarUrl: true } },
      },
    }),
    prisma.taskUpdate.findMany({
      where: { task: { orderId: { in: orderIds } } },
      orderBy: { createdAt: "desc" },
      take: ceiling,
      select: {
        id: true,
        body: true,
        progressPercent: true,
        createdAt: true,
        author: { select: { id: true, name: true, avatarUrl: true } },
        task: { select: { id: true, title: true, orderId: true } },
      },
    }),
  ]);

  const push = (orderId: string, entry: OrderActivityDto) => {
    byOrder.set(orderId, [...(byOrder.get(orderId) ?? []), entry]);
  };

  for (const event of events) {
    const kind = asOrderActivityKind(event.kind);
    push(event.orderId, {
      id: event.id,
      kind,
      text: describeOrderEvent(kind, event.meta),
      comment: event.comment,
      createdAt: event.createdAt,
      actor: event.actor,
      stage: null,
    });
  }

  for (const update of updates) {
    if (!update.task.orderId) continue;
    push(update.task.orderId, {
      id: update.id,
      kind: "task",
      text:
        update.progressPercent !== null
          ? `posted an update on ${update.task.title} (${update.progressPercent}%)`
          : `posted an update on ${update.task.title}`,
      comment: update.body,
      createdAt: update.createdAt,
      actor: update.author,
      stage: { id: update.task.id, name: update.task.title },
    });
  }

  // Interleave the two sources per order, then trim.
  for (const [orderId, entries] of byOrder) {
    byOrder.set(
      orderId,
      entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, perOrder),
    );
  }

  return byOrder;
}

/** The sentence for an order-level event, built from its recorded detail. */
function describeOrderEvent(kind: OrderActivityKind, rawMeta: string | null): string {
  let meta: Record<string, unknown> = {};
  try {
    if (rawMeta) meta = JSON.parse(rawMeta) as Record<string, unknown>;
  } catch {
    // A corrupt meta must not take the feed down.
  }

  switch (kind) {
    case "promised_date_changed":
      return typeof meta.from === "string" && typeof meta.to === "string"
        ? `moved the promised date from ${meta.from} to ${meta.to}`
        : "moved the promised date";
    case "stage_completed":
      return typeof meta.stage === "string" ? `finished ${meta.stage}` : "finished a stage";
    case "stage_started":
      return typeof meta.stage === "string" ? `started ${meta.stage}` : "started a stage";
    case "stage_overran":
      return typeof meta.stage === "string" && typeof meta.overrun === "number"
        ? `${meta.stage} ran ${meta.overrun} day${meta.overrun === 1 ? "" : "s"} over`
        : "a stage ran over its allotted time";
    case "at_risk":
      return typeof meta.slipDays === "number"
        ? `was forecast ${meta.slipDays} day${meta.slipDays === 1 ? "" : "s"} late`
        : "was forecast to run late";
    case "recovered":
      return "came back on track";
    case "delivered":
      return "was delivered";
    case "created":
      return typeof meta.stages === "number"
        ? `created the order with ${meta.stages} stage${meta.stages === 1 ? "" : "s"}`
        : "created the order";
    default:
      return kind.replace(/_/g, " ");
  }
}

// ---------------------------------------------------------------------------
//  Dashboard & badges
// ---------------------------------------------------------------------------

export interface OrderSnapshot {
  open: number;
  atRisk: number;
  delayed: number;
  dueThisWeek: number;
  deliveredThisMonth: number;
  worstSlip: number;
  /** The handful that need attention, worst first. */
  attention: Array<{
    id: string;
    orderNumber: string;
    title: string;
    customerName: string;
    slipDays: number;
    status: OrderStatus;
    currentStageName: string | null;
    summary: string;
  }>;
}

export async function getOrderSnapshot(actor: Actor): Promise<OrderSnapshot> {
  const asOf = today();
  const visible = orderVisibilityFor(actor);
  // The next seven days, inclusive of today.
  const weekEnd = addDays(asOf, 7);

  const [grouped, dueSoon, delivered, attentionRows, holidays] = await Promise.all([
    prisma.order.groupBy({ by: ["status"], where: visible, _count: { _all: true } }),
    prisma.order.count({
      where: {
        AND: [
          visible,
          { status: { in: [...ORDER_OPEN_STATUSES] }, promisedOn: { gte: asOf, lte: weekEnd } },
        ],
      },
    }),
    prisma.order.count({
      where: { AND: [visible, { status: "COMPLETED", completedOn: { gte: startOfYear(asOf) } }] },
    }),
    prisma.order.findMany({
      where: { AND: [visible, { status: { in: [...ORDER_ATTENTION_STATUSES] } }] },
      orderBy: [{ slipDays: "desc" }],
      take: 5,
      select: ORDER_SELECT,
    }),
    getHolidaySet(),
  ]);

  const counts = Object.fromEntries(
    grouped.map((row) => [asOrderStatus(row.status), row._count._all]),
  ) as Partial<Record<OrderStatus, number>>;

  const attention = attentionRows.map((row) => toDto(row, holidays, asOf));

  return {
    open: ORDER_OPEN_STATUSES.reduce((sum, status) => sum + (counts[status] ?? 0), 0),
    atRisk: counts.AT_RISK ?? 0,
    delayed: counts.DELAYED ?? 0,
    dueThisWeek: dueSoon,
    deliveredThisMonth: delivered,
    worstSlip: attention[0]?.projection.slipDays ?? 0,
    attention: attention.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      title: order.title,
      customerName: order.customerName,
      slipDays: order.projection.slipDays,
      status: order.projection.derivedStatus,
      currentStageName: order.projection.currentStageName,
      summary: order.projection.summary,
    })),
  };
}

/** Nav badge: orders needing attention. */
export async function countOrdersNeedingAttention(actor: Actor): Promise<number> {
  if (!isManagerOrAdmin(actor)) return 0;
  return prisma.order.count({
    where: {
      AND: [orderVisibilityFor(actor), { status: { in: [...ORDER_ATTENTION_STATUSES] } }],
    },
  });
}

/**
 * Next order reference, e.g. ORD-0043.
 *
 * Ordered by the reference, **not** by `createdAt` — a backdated row (a seed, an import)
 * holds a high number in the middle of the timeline, so newest-by-date returned a
 * reference that was already taken. See lib/services/reference.ts.
 */
export async function nextOrderNumber(): Promise<string> {
  const latest = await prisma.order.findFirst({
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });

  return formatReference("ORD", parseReference(latest?.orderNumber) + 1);
}

export { projectOrder, explainProjection };
export type { OrderProjection };
