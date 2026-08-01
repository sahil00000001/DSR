"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { errors, toUserMessage } from "@/lib/errors";
import { can } from "@/lib/auth/rbac";
import { requireUserAction } from "@/lib/auth/session";
import { orderSchema, orderStageSchema, parseFormData } from "@/lib/validation/schemas";
import {
  asOrderStatus,
  type OrderActivityKind,
  type OrderStatus,
} from "@/lib/constants/enums";
import { parseDayKey, toDayKey, today } from "@/lib/utils/date";
import { getHolidaySet, nextOrderNumber } from "@/lib/services/orders";
import { nextTaskNumber } from "@/lib/services/tasks";
import { projectOrder } from "@/lib/orders/projection";
import { recordAudit } from "@/lib/services/audit";
import { notifyMany } from "@/lib/services/notifications";
import { formError, formSuccess, type FormState } from "@/server/actions/form-state";

/**
 * Order writes.
 *
 * ## Stages are tasks
 *
 * Creating an order creates one `Task` per stage, each carrying `orderId`,
 * `orderPosition` and `allottedDays`. Everything the task module already does — updates,
 * photos, voice notes, its own timeline, notifications — therefore works on order work
 * without a line of new code.
 *
 * ## The projection cache is recomputed on every write that can move it
 *
 * `Order.projectedOn`, `slipDays` and `status` are derived. They are stored anyway so
 * SQL can sort and filter by slip, which it cannot do by calling the engine. Every path
 * that could change the forecast calls `recomputeOrder`, and the nightly cron sweeps the
 * rest — because time passing changes a forecast even when nobody touches anything.
 */

const MAX_STAGES = 20;

async function recordOrderActivity(input: {
  orderId: string;
  actorId: string | null;
  kind: OrderActivityKind;
  meta?: Record<string, unknown>;
  comment?: string | null;
}) {
  await prisma.orderActivity.create({
    data: {
      orderId: input.orderId,
      actorId: input.actorId,
      kind: input.kind,
      meta: input.meta ? JSON.stringify(input.meta) : null,
      comment: input.comment ?? null,
    },
  });
}

function revalidateOrders(id?: string) {
  revalidatePath("/orders");
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/orders/${id}`);
}

/**
 * Recomputes and stores an order's forecast.
 *
 * Returns what changed, so a caller can act on a transition — going at-risk is worth a
 * WhatsApp message, and staying at-risk is not.
 */
export async function recomputeOrder(orderId: string): Promise<{
  status: OrderStatus;
  previousStatus: OrderStatus;
  slipDays: number;
  previousSlip: number;
  becameAtRisk: boolean;
  recovered: boolean;
  delivered: boolean;
} | null> {
  const [order, holidays] = await Promise.all([
    prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        slipDays: true,
        promisedOn: true,
        startedOn: true,
        completedOn: true,
        stages: {
          select: {
            id: true,
            title: true,
            orderPosition: true,
            allottedDays: true,
            status: true,
            startedAt: true,
            completedAt: true,
            progressPercent: true,
            assignees: { select: { user: { select: { id: true, name: true } } } },
          },
        },
      },
    }),
    getHolidaySet(),
  ]);

  if (!order) return null;

  const previousStatus = asOrderStatus(order.status);
  const previousSlip = order.slipDays;

  // A cancelled order is not forecast. Nothing is going to happen to it.
  if (previousStatus === "CANCELLED") {
    return {
      status: "CANCELLED",
      previousStatus,
      slipDays: previousSlip,
      previousSlip,
      becameAtRisk: false,
      recovered: false,
      delivered: false,
    };
  }

  const projection = projectOrder(
    { promisedOn: order.promisedOn, startedOn: order.startedOn },
    order.stages.map((stage) => ({
      id: stage.id,
      name: stage.title,
      position: stage.orderPosition ?? 0,
      allottedDays: stage.allottedDays,
      status: stage.status as never,
      startedAt: stage.startedAt,
      completedAt: stage.completedAt,
      progressPercent: stage.progressPercent,
      assignees: stage.assignees.map((entry) => entry.user),
    })),
    { asOf: today(), holidays },
  );

  const status = projection.derivedStatus as OrderStatus;

  await prisma.order.update({
    where: { id: order.id },
    data: {
      status,
      slipDays: projection.slipDays,
      projectedOn: projection.projectedOn,
      projectedAt: new Date(),
      // The first stage to start starts the order.
      startedOn:
        order.startedOn ??
        (projection.stages.some((stage) => stage.startedAt) ? today() : null),
      completedOn:
        status === "COMPLETED" ? (order.completedOn ?? projection.projectedOn ?? today()) : null,
      // Clear the risk stamp on recovery, so a later slip warns again.
      ...(status !== "AT_RISK" && status !== "DELAYED" ? { riskNotifiedAt: null } : {}),
    },
  });

  const wasBehind = previousStatus === "AT_RISK" || previousStatus === "DELAYED";
  const isBehind = status === "AT_RISK" || status === "DELAYED";

  if (isBehind && !wasBehind) {
    await recordOrderActivity({
      orderId: order.id,
      actorId: null,
      kind: "at_risk",
      meta: { slipDays: projection.slipDays, stage: projection.currentStage?.name ?? null },
    });
  }
  if (!isBehind && wasBehind && status !== "COMPLETED") {
    await recordOrderActivity({ orderId: order.id, actorId: null, kind: "recovered" });
  }
  if (status === "COMPLETED" && previousStatus !== "COMPLETED") {
    await recordOrderActivity({
      orderId: order.id,
      actorId: null,
      kind: "delivered",
      meta: { slipDays: projection.slipDays },
    });
  }

  return {
    status,
    previousStatus,
    slipDays: projection.slipDays,
    previousSlip,
    becameAtRisk: isBehind && !wasBehind,
    recovered: !isBehind && wasBehind && status !== "COMPLETED",
    delivered: status === "COMPLETED" && previousStatus !== "COMPLETED",
  };
}

/** Recomputes the order a task belongs to, if it belongs to one. Cheap no-op otherwise. */
export async function recomputeOrderForTask(taskId: string): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { orderId: true },
  });
  if (task?.orderId) {
    await recomputeOrder(task.orderId);
    revalidateOrders(task.orderId);
  }
}

// ---------------------------------------------------------------------------
//  Create
// ---------------------------------------------------------------------------

export async function createOrderAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseFormData(orderSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  try {
    const actor = await requireUserAction();
    if (!can.manageOrders(actor)) {
      throw errors.forbidden("Only admins can create orders.");
    }

    const input = parsed.data;

    /**
     * Stages arrive as three parallel arrays from the form — name, assignee and days,
     * one entry per row. Zipped here rather than posted as JSON so the form still works
     * without JavaScript, which is the same reason every other form in this app posts
     * plain fields.
     */
    const names = formData.getAll("stageName").map(String);
    const assigneeIds = formData.getAll("stageAssignee").map(String);
    const allotted = formData.getAll("stageDays").map(String);

    const stages = names
      .map((name, index) => ({
        name: name.trim(),
        assigneeId: assigneeIds[index]?.trim() ?? "",
        days: Number(allotted[index] ?? 1),
      }))
      .filter((stage) => stage.name.length > 0);

    if (stages.length === 0) {
      return formError("Add at least one stage — an order with no stages cannot be tracked.", {
        stageName: "Give the first stage a name and an owner.",
      });
    }
    if (stages.length > MAX_STAGES) {
      return formError(`An order can have at most ${MAX_STAGES} stages.`);
    }
    if (stages.some((stage) => !stage.assigneeId)) {
      return formError("Every stage needs somebody responsible for it.", {
        stageAssignee: "Pick an owner for each stage.",
      });
    }
    if (stages.some((stage) => !Number.isFinite(stage.days) || stage.days < 1 || stage.days > 90)) {
      return formError("Each stage needs between 1 and 90 working days.", {
        stageDays: "Enter a whole number of days.",
      });
    }

    const people = await prisma.user.findMany({
      where: { id: { in: stages.map((stage) => stage.assigneeId) }, status: "ACTIVE" },
      select: { id: true, name: true },
    });
    const known = new Set(people.map((person) => person.id));
    if (stages.some((stage) => !known.has(stage.assigneeId))) {
      return formError("One of those people is no longer active.", {
        stageAssignee: "Pick the owners again.",
      });
    }

    const promisedOn = parseDayKey(input.promisedOn);
    const totalAllotted = stages.reduce((sum, stage) => sum + stage.days, 0);

    const order = await prisma.order.create({
      data: {
        orderNumber: await nextOrderNumber(),
        title: input.title,
        customerName: input.customerName,
        customerRef: input.customerRef ?? null,
        description: input.description ?? null,
        product: input.product ?? null,
        quantity: input.quantity ?? null,
        priority: input.priority,
        status: "PENDING",
        promisedOn,
        createdById: actor.id,
      },
      select: { id: true, orderNumber: true },
    });

    // One task per stage. Each stage's own due date is the running total of the
    // allotments before it, so a stage has a date of its own to be judged against
    // rather than only the order's promise.
    let cursor = 0;
    for (const [index, stage] of stages.entries()) {
      cursor += stage.days;

      await prisma.task.create({
        data: {
          taskNumber: await nextTaskNumber(),
          title: stage.name,
          description: `Stage ${index + 1} of ${order.orderNumber} — ${input.title}. ${
            stage.days
          } working day${stage.days === 1 ? "" : "s"} allotted.`,
          priority: input.priority,
          status: "TODO",
          orderId: order.id,
          orderPosition: index + 1,
          allottedDays: stage.days,
          createdById: actor.id,
          assignees: { create: { userId: stage.assigneeId, assignedById: actor.id } },
        },
      });
    }

    await recordOrderActivity({
      orderId: order.id,
      actorId: actor.id,
      kind: "created",
      meta: {
        stages: stages.length,
        totalAllotted,
        promisedOn: toDayKey(promisedOn),
        customer: input.customerName,
      },
    });

    await recomputeOrder(order.id);

    // Everybody with a stage hears about it, so nobody has to be told twice.
    await notifyMany(
      [...new Set(stages.map((stage) => stage.assigneeId))].map((userId) => ({
        userId,
        actorId: actor.id,
        type: "TASK_ASSIGNED" as const,
        title: `${order.orderNumber} — ${input.customerName}`,
        body: `You have a stage on this order. Promised ${toDayKey(promisedOn)}.`,
        href: `/orders/${order.id}`,
      })),
    );

    await recordAudit({
      actorId: actor.id,
      action: "order.create",
      entity: "order",
      entityId: order.id,
      meta: {
        orderNumber: order.orderNumber,
        customer: input.customerName,
        stages: stages.length,
        totalAllotted,
        promisedOn: toDayKey(promisedOn),
      },
    });

    revalidateOrders(order.id);
    revalidatePath("/tasks");

    // The most useful thing to say back is whether the plan is even possible.
    const feasible = totalAllotted <= Math.max(1, workingDaysUntil(promisedOn));
    return formSuccess(
      feasible
        ? `${order.orderNumber} created with ${stages.length} stage${
            stages.length === 1 ? "" : "s"
          }.`
        : `${order.orderNumber} created — but ${totalAllotted} allotted days will not fit before ${toDayKey(
            promisedOn,
          )}. It is already forecast late.`,
      { id: order.id, orderNumber: order.orderNumber },
    );
  } catch (error) {
    return formError(toUserMessage(error, { action: "createOrder" }));
  }
}

/** Rough working-day count to a date, for the feasibility hint. Weekends only. */
function workingDaysUntil(target: Date): number {
  const now = today();
  if (target <= now) return 0;

  let count = 0;
  let cursor = new Date(now.getTime());
  while (cursor < target) {
    cursor = new Date(cursor.getTime() + 86_400_000);
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) count += 1;
  }
  return count;
}

// ---------------------------------------------------------------------------
//  Promised date
// ---------------------------------------------------------------------------

/**
 * Moves the promised date.
 *
 * Always recorded with the old value and a reason. A promise that quietly moves is how a
 * delivery record looks perfect while every dealer remembers otherwise — the whole point
 * of tracking this is that the original date survives.
 */
export async function movePromisedDateAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const actor = await requireUserAction();
    if (!can.changePromisedDate(actor)) {
      throw errors.forbidden("Only admins can move a promised delivery date.");
    }

    const orderId = String(formData.get("orderId") ?? "");
    const dayKey = String(formData.get("promisedOn") ?? "");
    const reason = String(formData.get("reason") ?? "").trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
      return formError("Pick a valid date.", { promisedOn: "Pick a valid date." });
    }
    if (reason.length < 5) {
      return formError("Say why the date is moving — it stays on the record.", {
        reason: "Give a short reason.",
      });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, orderNumber: true, promisedOn: true, customerName: true },
    });
    if (!order) throw errors.notFound("That order");

    const next = parseDayKey(dayKey);
    if (next.getTime() === order.promisedOn.getTime()) {
      return formSuccess("The date is unchanged.");
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { promisedOn: next, riskNotifiedAt: null },
    });

    await recordOrderActivity({
      orderId: order.id,
      actorId: actor.id,
      kind: "promised_date_changed",
      meta: { from: toDayKey(order.promisedOn), to: dayKey },
      comment: reason,
    });

    await recomputeOrder(order.id);

    await recordAudit({
      actorId: actor.id,
      action: "order.promise",
      entity: "order",
      entityId: order.id,
      meta: {
        orderNumber: order.orderNumber,
        from: toDayKey(order.promisedOn),
        to: dayKey,
        reason,
      },
    });

    revalidateOrders(order.id);
    return formSuccess(`${order.orderNumber} is now promised for ${dayKey}.`);
  } catch (error) {
    return formError(toUserMessage(error, { action: "movePromisedDate" }));
  }
}

// ---------------------------------------------------------------------------
//  Stages
// ---------------------------------------------------------------------------

/** Appends a stage to an existing order. */
export async function addOrderStageAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseFormData(orderStageSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  try {
    const actor = await requireUserAction();
    if (!can.manageOrders(actor)) throw errors.forbidden("Only admins can change an order.");

    const order = await prisma.order.findUnique({
      where: { id: parsed.data.orderId },
      select: {
        id: true,
        orderNumber: true,
        title: true,
        priority: true,
        _count: { select: { stages: true } },
      },
    });
    if (!order) throw errors.notFound("That order");

    if (order._count.stages >= MAX_STAGES) {
      return formError(`An order can have at most ${MAX_STAGES} stages.`);
    }

    const person = await prisma.user.findFirst({
      where: { id: parsed.data.assigneeId, status: "ACTIVE" },
      select: { id: true, name: true },
    });
    if (!person) return formError("That person is no longer active.");

    const position = order._count.stages + 1;

    await prisma.task.create({
      data: {
        taskNumber: await nextTaskNumber(),
        title: parsed.data.name,
        description: `Stage ${position} of ${order.orderNumber} — ${order.title}. ${
          parsed.data.allottedDays
        } working day${parsed.data.allottedDays === 1 ? "" : "s"} allotted.`,
        priority: order.priority,
        status: "TODO",
        orderId: order.id,
        orderPosition: position,
        allottedDays: parsed.data.allottedDays,
        createdById: actor.id,
        assignees: { create: { userId: person.id, assignedById: actor.id } },
      },
    });

    await recordOrderActivity({
      orderId: order.id,
      actorId: actor.id,
      kind: "stage_added",
      meta: { stage: parsed.data.name, days: parsed.data.allottedDays, owner: person.name },
    });

    await recomputeOrder(order.id);

    await notifyMany([
      {
        userId: person.id,
        actorId: actor.id,
        type: "TASK_ASSIGNED" as const,
        title: `${order.orderNumber} — new stage for you`,
        body: parsed.data.name,
        href: `/orders/${order.id}`,
      },
    ]);

    await recordAudit({
      actorId: actor.id,
      action: "order.stage",
      entity: "order",
      entityId: order.id,
      meta: { orderNumber: order.orderNumber, added: parsed.data.name },
    });

    revalidateOrders(order.id);
    revalidatePath("/tasks");
    return formSuccess(`Added “${parsed.data.name}” as stage ${position}.`);
  } catch (error) {
    return formError(toUserMessage(error, { action: "addOrderStage" }));
  }
}

// ---------------------------------------------------------------------------
//  Cancel
// ---------------------------------------------------------------------------

export async function cancelOrderAction(orderId: string, reason: string): Promise<FormState> {
  try {
    const actor = await requireUserAction();
    if (!can.manageOrders(actor)) throw errors.forbidden("Only admins can cancel an order.");

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, orderNumber: true, status: true },
    });
    if (!order) throw errors.notFound("That order");
    if (order.status === "COMPLETED") {
      return formError("A delivered order cannot be cancelled.");
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED" },
    });

    // Open stages are cancelled with it, rather than left on somebody's board forever.
    await prisma.task.updateMany({
      where: { orderId: order.id, status: { notIn: ["COMPLETED"] } },
      data: { status: "BLOCKED", blockedReason: `${order.orderNumber} was cancelled.` },
    });

    await recordOrderActivity({
      orderId: order.id,
      actorId: actor.id,
      kind: "cancelled",
      comment: reason.trim() || null,
    });

    await recordAudit({
      actorId: actor.id,
      action: "order.cancel",
      entity: "order",
      entityId: order.id,
      meta: { orderNumber: order.orderNumber, reason: reason.slice(0, 300) },
    });

    revalidateOrders(order.id);
    revalidatePath("/tasks");
    return formSuccess(`${order.orderNumber} cancelled.`);
  } catch (error) {
    return formError(toUserMessage(error, { action: "cancelOrder" }));
  }
}

/** Adds a note to the order's own feed, separate from any one stage. */
export async function addOrderNoteAction(orderId: string, note: string): Promise<FormState> {
  try {
    const actor = await requireUserAction();

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, stages: { select: { assignees: { select: { userId: true } } } } },
    });
    if (!order) throw errors.notFound("That order");

    const stageAssigneeIds = order.stages.flatMap((stage) =>
      stage.assignees.map((entry) => entry.userId),
    );
    if (!can.viewOrder(actor, { stageAssigneeIds })) {
      throw errors.forbidden("You cannot post on this order.");
    }

    const body = note.trim();
    if (body.length < 2) return formError("Write something before posting.");

    await recordOrderActivity({
      orderId: order.id,
      actorId: actor.id,
      kind: "note",
      comment: body.slice(0, 2000),
    });

    revalidateOrders(order.id);
    return formSuccess("Note added.");
  } catch (error) {
    return formError(toUserMessage(error, { action: "addOrderNote" }));
  }
}
