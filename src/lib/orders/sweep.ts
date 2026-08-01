import "server-only";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { notifyMany } from "@/lib/services/notifications";
import { alreadySent, sendMessage, sendSummary } from "@/lib/messaging/send";
import { buildOrderDigest, buildRiskAlert } from "@/lib/orders/digest";
import { listOpenOrdersProjected, type OrderDto } from "@/lib/services/orders";
import { recomputeOrder } from "@/server/actions/orders";
import { today, toDayKey } from "@/lib/utils/date";

/**
 * The nightly order sweep.
 *
 * ## Why a sweep is necessary at all
 *
 * Every write that could move a forecast already recomputes it. But **time passing moves
 * a forecast too**: an order nobody touched today is one day closer to its promise, and a
 * stage that was comfortably inside its allowance yesterday may be over it now. Without a
 * scheduled pass, an order silently rots into "at risk" and nobody is told until somebody
 * happens to open the page.
 *
 * ## What it does, in order
 *
 *   1. Recompute every open order.
 *   2. Alert on each one that *newly* crossed into at-risk or late — once, not nightly.
 *   3. Send the admin one summary of everything.
 *
 * Step 2 before step 3 on purpose: an order that went at risk this afternoon appears in
 * both, and the alert explains *why* while the summary only says *that*.
 */

export interface SweepResult {
  recomputed: number;
  newlyAtRisk: number;
  delivered: number;
  alertsSent: number;
  digestSent: boolean;
  digestVia: "text" | "template" | "skipped";
}

export async function sweepOrders(): Promise<SweepResult> {
  const now = today();

  const open = await prisma.order.findMany({
    where: { status: { in: ["PENDING", "IN_PROGRESS", "AT_RISK", "DELAYED"] } },
    select: { id: true, riskNotifiedAt: true },
  });

  const crossed: string[] = [];
  let delivered = 0;

  for (const order of open) {
    const result = await recomputeOrder(order.id);
    if (!result) continue;

    if (result.delivered) delivered += 1;

    // `riskNotifiedAt` is the guard: an order that is late stays late, and telling
    // somebody nightly that yesterday's problem is still a problem is how alerts get
    // muted. The nightly digest is where the standing state belongs.
    if (result.becameAtRisk && order.riskNotifiedAt === null) crossed.push(order.id);
  }

  let alertsSent = 0;

  if (crossed.length > 0) {
    const projected = await listOpenOrdersProjected();
    const byId = new Map(projected.map((order) => [order.id, order]));

    for (const id of crossed) {
      const order = byId.get(id);
      if (!order) continue;

      await alertNewRisk(order);
      alertsSent += 1;
    }

    await prisma.order.updateMany({
      where: { id: { in: crossed } },
      data: { riskNotifiedAt: new Date() },
    });
  }

  // --- The daily summary --------------------------------------------------

  let digestSent = false;
  let digestVia: SweepResult["digestVia"] = "skipped";

  // Idempotent: a retried cron run must not send a second summary.
  if (await alreadySent("digest", now)) {
    logger.info("Order digest already sent for today", { date: toDayKey(now) });
  } else {
    const digest = await buildOrderDigest();

    if (!digest.worthSending) {
      logger.info("No open orders — skipping the digest");
    } else {
      const result = await sendSummary({
        kind: "digest",
        fullText: digest.text,
        templateName: env.WHATSAPP_SUMMARY_TEMPLATE,
        templateParams: digest.templateParams,
        coversDay: now,
      });

      digestSent = result.ok;
      digestVia = result.ok ? result.via : "skipped";

      if (!result.ok && !result.skipped) {
        logger.warn("Order digest failed to send", { error: result.error, via: result.via });
      }
    }
  }

  return {
    recomputed: open.length,
    newlyAtRisk: crossed.length,
    delivered,
    alertsSent,
    digestSent,
    digestVia,
  };
}

/**
 * Warns about one order that has just started forecasting late.
 *
 * Goes to the admin over WhatsApp *and* to everyone with a stage on it in the app. The
 * admin needs to know so they can act; the people doing the work need to know because
 * one of them is the reason, and finding out at the end of the week is too late to
 * recover.
 */
async function alertNewRisk(order: OrderDto): Promise<void> {
  await sendMessage({
    kind: order.projection.derivedStatus === "DELAYED" ? "order_delayed" : "order_risk",
    text: buildRiskAlert(order),
  });

  const stageOwners = [
    ...new Set(order.stages.flatMap((stage) => stage.assignees.map((person) => person.id))),
  ];

  if (stageOwners.length > 0) {
    await notifyMany(
      stageOwners.map((userId) => ({
        userId,
        actorId: null,
        type: "TASK_OVERDUE" as const,
        /* A block is why an order goes at-risk with no arithmetic slip, and this then
           read "forecast 0 days late" — which is both wrong and easy to ignore. */
        title: order.projection.isStopped
          ? `${order.orderNumber} is stopped — no finish date`
          : `${order.orderNumber} is forecast ${order.projection.slipDays} day${
              order.projection.slipDays === 1 ? "" : "s"
            } late`,
        body: order.projection.summary,
        href: `/orders/${order.id}`,
      })),
    );
  }
}

/**
 * Sends the summary on demand, for the "send it to me now" button in settings.
 *
 * Shares `sendSummary`, so a manual send obeys the same free-versus-billable rule as the
 * scheduled one — a test message should not quietly cost differently from the real thing.
 */
export async function sendOrderSummaryNow(): Promise<{
  ok: boolean;
  via: "text" | "template";
  error?: string;
  counts: { open: number; delayed: number; atRisk: number; onTrack: number };
}> {
  const digest = await buildOrderDigest();

  const result = await sendSummary({
    kind: "digest",
    fullText: digest.text,
    templateName: env.WHATSAPP_SUMMARY_TEMPLATE,
    templateParams: digest.templateParams,
    // Deliberately no `coversDay`: a manual send must not make the evening's scheduled
    // digest think it has already gone out.
  });

  return { ok: result.ok, via: result.via, error: result.error, counts: digest.counts };
}
