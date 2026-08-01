import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordSystemAudit } from "@/lib/services/audit";
import { alreadySent, sendSummary } from "@/lib/messaging/send";
import { buildMorningBrief } from "@/lib/orders/digest";
import { recomputeOrder } from "@/server/actions/orders";
import { isWeekend, toDayKey, today } from "@/lib/utils/date";

/**
 * The morning order brief.
 *
 * **Schedule: `30 3 * * 1-5` — 09:00 IST, Monday to Friday.** Declared in `vercel.json`,
 * repeated here because that file is JSON and cannot hold a comment: Vercel validates it
 * against a strict schema and rejects any property it does not recognise, including one
 * called `_comment`.
 *
 * ## Why a second cron rather than one at 6pm
 *
 * The evening digest is a review — by the time it arrives the day is spent. The point of
 * forecasting a breach is doing something about it, and the only moment you can act on a
 * day is the start of it. So this one is deliberately narrower: what is due today, what is
 * already late, and what will slip unless somebody moves. Orders that are fine collapse
 * into a single count.
 *
 * ## Two crons is the Hobby-plan limit
 *
 * Vercel's Hobby plan allows two cron jobs, each invoked once a day. This and
 * `/api/cron/reminders` are exactly those two, which is why the morning brief is its own
 * route rather than a second schedule on the existing one.
 *
 * ## Authenticated and idempotent, like the other one
 *
 *   • Vercel sends `Authorization: Bearer $CRON_SECRET`. With no secret configured the
 *     endpoint stays shut rather than open — anyone who guessed the path could otherwise
 *     spend the admin's message allowance.
 *   • `alreadySent` makes a retry a no-op, so a partial failure does not produce two
 *     briefs.
 *   • Weekends and company holidays are skipped. Nobody wants a Sunday brief.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

function isAuthorised(request: NextRequest): boolean {
  if (!env.CRON_SECRET) return false;
  return request.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const now = today();

  if (isWeekend(now)) {
    return NextResponse.json({ skipped: "weekend", date: toDayKey(now) });
  }

  const holiday = await prisma.holiday.findFirst({
    where: { date: now, type: { in: ["PUBLIC", "COMPANY"] } },
    select: { name: true },
  });
  if (holiday) {
    return NextResponse.json({ skipped: "holiday", holiday: holiday.name });
  }

  try {
    if (await alreadySent("morning_brief", now)) {
      return NextResponse.json({ skipped: "already sent", date: toDayKey(now) });
    }

    /**
     * Re-forecast before reading.
     *
     * Overnight is exactly when a forecast moves without anybody touching anything: a
     * stage that was inside its allowance at 6pm is a day further in by 9am. Sending the
     * brief off yesterday's cached numbers would report the problem a day late, which is
     * the failure this whole feature exists to prevent.
     */
    const open = await prisma.order.findMany({
      where: { status: { in: ["PENDING", "IN_PROGRESS", "AT_RISK", "DELAYED"] } },
      select: { id: true },
    });

    for (const order of open) await recomputeOrder(order.id);

    const brief = await buildMorningBrief();

    if (!brief.worthSending) {
      logger.info("No open orders — skipping the morning brief");
      return NextResponse.json({ ok: true, skipped: "no open orders" });
    }

    const result = await sendSummary({
      kind: "morning_brief",
      fullText: brief.text,
      templateName: env.WHATSAPP_SUMMARY_TEMPLATE,
      templateParams: brief.templateParams,
      coversDay: now,
    });

    const summary = {
      date: toDayKey(now),
      recomputed: open.length,
      openOrders: brief.counts.open,
      needingAttention: brief.counts.delayed + brief.counts.atRisk,
      sent: result.ok,
      via: result.via,
      billable: result.via === "template",
    };

    await recordSystemAudit({
      action: "cron.morning_brief",
      entity: "order",
      meta: summary,
    });
    logger.info("Morning brief complete", summary);

    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    logger.error("Morning brief failed", error);
    return NextResponse.json({ error: "Morning brief failed" }, { status: 500 });
  }
}
