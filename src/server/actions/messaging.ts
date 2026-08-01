"use server";

import { errors, toUserMessage } from "@/lib/errors";
import { can } from "@/lib/auth/rbac";
import { requireUserAction } from "@/lib/auth/session";
import { recordAudit } from "@/lib/services/audit";
import { sendOrderSummaryNow } from "@/lib/orders/sweep";

/**
 * Messaging actions.
 *
 * Just the manual send for now. Kept in its own file rather than folded into the order
 * actions because sending a message to the outside world is a different kind of side
 * effect from editing a row, and the audit entry it writes should be findable by anyone
 * asking "who sent that WhatsApp?".
 */

export interface SendSummaryResult {
  ok: boolean;
  message?: string;
  via: "text" | "template";
  counts: { open: number; delayed: number; atRisk: number; onTrack: number };
}

export async function sendSummaryNowAction(): Promise<SendSummaryResult> {
  const empty = { open: 0, delayed: 0, atRisk: 0, onTrack: 0 };

  try {
    const actor = await requireUserAction();
    // Same gate as moving a promised date: this leaves the building.
    if (!can.manageOrders(actor)) {
      throw errors.forbidden("Only admins can send the order summary.");
    }

    const result = await sendOrderSummaryNow();

    await recordAudit({
      actorId: actor.id,
      action: "message.send",
      entity: "order",
      entityId: null,
      meta: {
        kind: "digest",
        manual: true,
        via: result.via,
        billable: result.via === "template",
        ok: result.ok,
        openOrders: result.counts.open,
      },
    });

    return {
      ok: result.ok,
      message: result.error,
      via: result.via,
      counts: result.counts,
    };
  } catch (error) {
    return {
      ok: false,
      message: toUserMessage(error, { action: "sendOrderSummary" }),
      via: "text",
      counts: empty,
    };
  }
}
