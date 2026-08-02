import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { env, isMessagingEnabled } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { MessageKind } from "@/lib/constants/enums";

/**
 * Outbound and inbound messaging — the WhatsApp order summary.
 *
 * ## The cost model, which shapes everything here
 *
 * Meta charges per *template* message. Two rules make this feature effectively free:
 *
 *   • "All non-template messages are free" — plain text, images, and so on.
 *   • Those may only be sent inside an open **24-hour customer service window**, which
 *     opens the moment the admin messages the business number.
 *
 * So the sender checks whether a window is open and picks accordingly:
 *
 *   window open   → free-form text, the **full multi-line digest**, ₹0
 *   window closed → a short template with counts and "reply STATUS", ₹0.115 + GST
 *
 * The admin's reply then opens a window, so everything after it is free. That is why
 * the closed-window message deliberately asks for a reply rather than trying to cram
 * the whole report into a paid template.
 *
 * It also sidesteps Meta's formatting rules for template parameters entirely: every
 * parameter here is a short single-line string, never a block of text with newlines.
 *
 * ## Why there is still an abstraction
 *
 * `MESSAGING_PROVIDER` picks between Meta's Cloud API (`cloud` — runs from Vercel with
 * one fetch, no server, no ban risk), a self-hosted Baileys bridge (`baileys` — free,
 * unofficial, needs a box), a self-hosted OpenWA gateway (`openwa`), Telegram
 * (`telegram`, free forever), and `none` (log only).
 *
 * `baileys` and `openwa` both pair as a linked device, so there is no service window and
 * no template: the full digest simply goes out, every time, at no cost. `sendSummary`
 * below special-cases only `cloud` for that reason.
 *
 * OpenWA is kept working but is not the recommended path: it drives a headless Chromium
 * with a scanned QR session, so it **cannot run on Vercel** — it needs a separate
 * always-on host — and its own documentation admits the engine carries "higher
 * account-restriction risk", which means the company's number. See docs/WHATSAPP.md.
 *
 * ## Every message is logged, in both directions
 *
 * A row is written before each attempt and updated after. Without it, "the admin says
 * he never got the 6pm summary" is unanswerable; with it, it is a row with a status and
 * an error string. Inbound messages are logged too — that log *is* how the 24-hour
 * window is detected, so it earns its keep twice.
 */

export interface SendResult {
  ok: boolean;
  /** The provider's message id, where it returns one. */
  externalId?: string;
  error?: string;
  /** True when no channel is configured, so the caller can stay quiet about it. */
  skipped?: boolean;
  /** Whether this went out as free-form (free) or as a template (billable). */
  billable?: boolean;
}

/**
 * Normalises a phone number to digits.
 *
 * Strips rather than validates: a wrong number fails at the gateway with a clear error,
 * which is more useful than this function refusing a number that would have worked.
 */
export function toDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** WhatsApp addresses a chat as `<countrycode><number>@c.us`. OpenWA wants this form. */
export function toChatId(raw: string): string {
  return `${toDigits(raw)}@c.us`;
}

/**
 * The multi-device protocol's own address form, which Baileys uses.
 *
 * Not interchangeable with `@c.us` above, despite how similar they look: `@c.us` is the
 * legacy web-client form that browser-driving libraries kept. Sending a `@c.us` jid
 * through Baileys fails in a way that reports as a timeout, which reads like the bridge
 * being down. The bridge builds the jid itself; this exists so nothing here is tempted to
 * reuse the wrong one.
 */
export function toJid(raw: string): string {
  return `${toDigits(raw)}@s.whatsapp.net`;
}

// ---------------------------------------------------------------------------
//  The 24-hour service window
// ---------------------------------------------------------------------------

/** Meta's customer service window, in milliseconds. */
const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * True when the admin has messaged us recently enough that free-form replies are free.
 *
 * Read from the inbound message log rather than tracked in its own column, because the
 * log has to exist anyway and a second source of truth for the same fact is a bug
 * waiting to happen.
 *
 * A five-minute safety margin is subtracted from the window: a message that lands at
 * 23 hours 59 minutes would be billed as out-of-window by the time Meta processes it,
 * and being charged ₹0.14 is better than the send failing outright.
 */
export async function isServiceWindowOpen(counterparty?: string): Promise<boolean> {
  const number = toDigits(counterparty ?? env.MESSAGING_ADMIN_NUMBER ?? "");
  if (!number) return false;

  const since = new Date(Date.now() - (SERVICE_WINDOW_MS - 5 * 60 * 1000));

  const recent = await prisma.messageLog.findFirst({
    where: { kind: "inbound", recipient: number, createdAt: { gte: since } },
    select: { id: true },
  });

  return recent !== null;
}

/**
 * Records a message *from* the admin.
 *
 * `recipient` holds the counterparty in both directions — it is the other end of the
 * conversation, whichever way the message travelled. Naming it `recipient` for an
 * inbound message is a small lie, but a second column that is null half the time is a
 * bigger one.
 */
export async function logInbound({
  from,
  body,
  externalId,
}: {
  from: string;
  body: string;
  externalId?: string;
}): Promise<void> {
  await prisma.messageLog.create({
    data: {
      provider: env.MESSAGING_PROVIDER,
      kind: "inbound",
      recipient: toDigits(from),
      body: body.slice(0, 8000),
      status: "SENT",
      externalId: externalId ?? null,
      sentAt: new Date(),
    },
  });
}

// ---------------------------------------------------------------------------
//  Providers
// ---------------------------------------------------------------------------

const GRAPH_VERSION = "v21.0";

/** Free-form text. Free, but only delivers inside an open service window. */
async function cloudText(to: string, text: string): Promise<SendResult> {
  return cloudPost(
    {
      messaging_product: "whatsapp",
      to: toDigits(to),
      type: "text",
      text: { preview_url: false, body: text },
    },
    false,
  );
}

/**
 * A template. Delivers any time; billable outside a window.
 *
 * Parameters are single-line by contract — see the note at the top of the file. The
 * caller passes short strings like "4" or "ORD-0007 (3 days)".
 */
async function cloudTemplate(
  to: string,
  name: string,
  language: string,
  params: string[],
): Promise<SendResult> {
  return cloudPost(
    {
      messaging_product: "whatsapp",
      to: toDigits(to),
      type: "template",
      template: {
        name,
        language: { code: language },
        components: params.length
          ? [
              {
                type: "body",
                parameters: params.map((value) => ({ type: "text", text: value })),
              },
            ]
          : [],
      },
    },
    true,
  );
}

async function cloudPost(payload: unknown, billable: boolean): Promise<SendResult> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${env.WHATSAPP_PHONE_ID}/messages`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });

    const body = (await response.json()) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string; code?: number };
    };

    if (!response.ok) {
      return {
        ok: false,
        billable,
        // Meta's codes matter when debugging: 131047 is "outside the window",
        // 132000 is a parameter-count mismatch. Keeping the code makes the log useful.
        error: `${body.error?.code ?? response.status}: ${body.error?.message ?? "send failed"}`,
      };
    }

    return { ok: true, billable, externalId: body.messages?.[0]?.id };
  } catch (error) {
    return { ok: false, billable, error: describe(error) };
  }
}

/**
 * Sends through the self-hosted Baileys bridge.
 *
 * The bridge holds the WhatsApp socket; this is one authenticated POST to it. Nothing
 * about the protocol lives in the app, which is the point — the piece that cannot run on
 * Vercel is the only piece that runs elsewhere.
 *
 * The bridge distinguishes its own failures from WhatsApp's: 502 means it is up but the
 * message would not go, 401 means the token is wrong, and a timeout means the box is
 * gone. All three read very differently at 6pm, so the error keeps the status code.
 */
async function baileysText(to: string, text: string): Promise<SendResult> {
  const base = env.BAILEYS_BRIDGE_URL!.replace(/\/$/, "");

  try {
    const response = await fetch(`${base}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.BAILEYS_BRIDGE_TOKEN}`,
      },
      body: JSON.stringify({ to: toDigits(to), text }),
      /*
       * Generous, because the bridge may be reconnecting when this lands — WhatsApp drops
       * the socket routinely and a reconnect takes a few seconds. Failing at 10s would
       * turn an ordinary reconnect into a missed summary.
       */
      signal: AbortSignal.timeout(30_000),
    });

    const raw = await response.text();

    if (!response.ok) {
      let detail = raw.slice(0, 300);
      try {
        const parsed = JSON.parse(raw) as { error?: string };
        if (parsed.error) detail = parsed.error;
      } catch {
        // Not JSON — a proxy or the platform answered, so the raw body is the better clue.
      }
      return { ok: false, error: `HTTP ${response.status}: ${detail}` };
    }

    const body = JSON.parse(raw) as { id?: string };
    return { ok: true, externalId: body.id };
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
}

async function openWaText(to: string, text: string): Promise<SendResult> {
  const base = env.OPENWA_BASE_URL!.replace(/\/$/, "");
  const url = `${base}/api/sessions/${env.OPENWA_SESSION_ID}/messages/send-text`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": env.OPENWA_API_KEY! },
      body: JSON.stringify({ chatId: toChatId(to), text }),
      // The gateway drives a browser; a cold session takes a while to answer.
      signal: AbortSignal.timeout(30_000),
    });

    const raw = await response.text();
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}: ${raw.slice(0, 300)}` };
    }

    // The gateway's success shape is undocumented, so read defensively.
    let externalId: string | undefined;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const candidate =
        parsed.id ??
        parsed.messageId ??
        (parsed.data as Record<string, unknown> | undefined)?.id ??
        (parsed.key as Record<string, unknown> | undefined)?.id;
      if (typeof candidate === "string") externalId = candidate;
    } catch {
      // A non-JSON 200 is still a send.
    }

    return { ok: true, externalId };
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
}

async function telegramText(to: string, text: string): Promise<SendResult> {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: to, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(20_000),
    });

    const body = (await response.json()) as {
      ok?: boolean;
      description?: string;
      result?: { message_id?: number };
    };

    if (!response.ok || body.ok !== true) {
      return { ok: false, error: body.description ?? `HTTP ${response.status}` };
    }

    return { ok: true, externalId: body.result?.message_id?.toString() };
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
}

function describe(error: unknown): string {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "The messaging gateway did not respond in time.";
  }
  return error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------

function recipientFor(to?: string): string {
  if (to) return to;
  return (
    (env.MESSAGING_PROVIDER === "telegram" ? env.TELEGRAM_CHAT_ID : env.MESSAGING_ADMIN_NUMBER) ?? ""
  );
}

/**
 * Sends a plain-text message.
 *
 * On the Cloud API this only delivers inside an open service window — the caller should
 * have checked, or should use `sendSummary` below, which decides for you.
 *
 * Never throws. A messaging failure must not take down the cron run that produced it.
 */
export async function sendMessage({
  kind,
  text,
  to,
  coversDay,
}: {
  kind: MessageKind;
  text: string;
  to?: string;
  coversDay?: Date;
}): Promise<SendResult> {
  const provider = env.MESSAGING_PROVIDER;
  const recipient = recipientFor(to);

  const log = await prisma.messageLog.create({
    data: {
      provider,
      kind,
      recipient: provider === "telegram" ? recipient : toDigits(recipient),
      body: text.slice(0, 8000),
      status: "QUEUED",
      coversDay: coversDay ?? null,
    },
    select: { id: true },
  });

  if (!isMessagingEnabled || !recipient) {
    // Not an error: an unconfigured deployment should still run, and the row is the
    // record of what would have been sent.
    const reason = !recipient
      ? "No recipient configured."
      : `Provider "${provider}" is not fully configured.`;

    await prisma.messageLog.update({
      where: { id: log.id },
      data: { status: "FAILED", error: reason },
    });
    logger.info("Outbound message skipped", { kind, provider, reason });
    return { ok: false, skipped: true, error: reason };
  }

  const result =
    provider === "cloud"
      ? await cloudText(recipient, text)
      : provider === "baileys"
        ? await baileysText(recipient, text)
        : provider === "openwa"
          ? await openWaText(recipient, text)
          : provider === "telegram"
            ? await telegramText(recipient, text)
            : { ok: false, error: "No provider selected." };

  await finish(log.id, result, kind, provider);
  return result;
}

/**
 * Sends a template. Only the Cloud API has the concept; the others fall back to text.
 *
 * `fallbackText` is what the other providers send instead, so a channel switch does not
 * silently stop delivering.
 */
export async function sendTemplateMessage({
  kind,
  name,
  language = "en",
  params,
  fallbackText,
  to,
  coversDay,
}: {
  kind: MessageKind;
  name: string;
  language?: string;
  params: string[];
  fallbackText: string;
  to?: string;
  coversDay?: Date;
}): Promise<SendResult> {
  const provider = env.MESSAGING_PROVIDER;
  if (provider !== "cloud") {
    return sendMessage({ kind, text: fallbackText, to, coversDay });
  }

  const recipient = recipientFor(to);

  const log = await prisma.messageLog.create({
    data: {
      provider,
      kind,
      recipient: toDigits(recipient),
      // Log what a person would read, not the JSON — the log is for humans.
      body: `[template ${name}] ${params.join(" | ")}`.slice(0, 8000),
      status: "QUEUED",
      coversDay: coversDay ?? null,
    },
    select: { id: true },
  });

  if (!isMessagingEnabled || !recipient) {
    const reason = !recipient ? "No recipient configured." : "Cloud API is not fully configured.";
    await prisma.messageLog.update({
      where: { id: log.id },
      data: { status: "FAILED", error: reason },
    });
    return { ok: false, skipped: true, error: reason };
  }

  const result = await cloudTemplate(recipient, name, language, params);
  await finish(log.id, result, kind, provider);
  return result;
}

async function finish(logId: string, result: SendResult, kind: string, provider: string) {
  await prisma.messageLog.update({
    where: { id: logId },
    data: {
      status: result.ok ? "SENT" : "FAILED",
      error: result.error?.slice(0, 500) ?? null,
      externalId: result.externalId ?? null,
      sentAt: result.ok ? new Date() : null,
    },
  });

  if (result.ok) {
    logger.info("Outbound message sent", { kind, provider, billable: result.billable ?? false });
  } else {
    logger.warn("Outbound message failed", { kind, provider, error: result.error });
  }
}

/**
 * Sends the order summary the cheapest way that will actually arrive.
 *
 * This is the function the cron and the webhook both call, and it is where the whole
 * cost model lives:
 *
 *   window open   → the full report as free-form text. Free.
 *   window closed → a short template with the headline counts, asking for a reply.
 *                   ₹0.115 + GST, and the reply opens a window so tomorrow is free.
 *
 * On any provider other than the Cloud API there is no window and no template, so the
 * full text simply goes out.
 */
export async function sendSummary({
  kind,
  fullText,
  templateName,
  templateParams,
  to,
  coversDay,
}: {
  kind: MessageKind;
  /** The whole multi-line report. */
  fullText: string;
  /** Approved utility template, used when no window is open. */
  templateName: string;
  /** Single-line values only. */
  templateParams: string[];
  to?: string;
  coversDay?: Date;
}): Promise<SendResult & { via: "text" | "template" }> {
  if (env.MESSAGING_PROVIDER !== "cloud") {
    return { ...(await sendMessage({ kind, text: fullText, to, coversDay })), via: "text" };
  }

  const open = await isServiceWindowOpen(to);

  if (open) {
    const result = await sendMessage({ kind, text: fullText, to, coversDay });
    // If Meta says the window is shut after all (131047), fall back rather than lose
    // the message — our 24-hour arithmetic and Meta's can disagree at the boundary.
    if (result.ok || result.skipped) return { ...result, via: "text" };
    logger.warn("Free-form send failed inside an assumed window; falling back to template", {
      error: result.error,
    });
  }

  const result = await sendTemplateMessage({
    kind,
    name: templateName,
    params: templateParams,
    fallbackText: fullText,
    to,
    coversDay,
  });

  return { ...result, via: "template" };
}

// ---------------------------------------------------------------------------
//  Webhook verification
// ---------------------------------------------------------------------------

/**
 * Verifies Meta's `X-Hub-Signature-256` over the raw body.
 *
 * Compared with `timingSafeEqual`, and the raw body is used rather than a re-serialised
 * object — `JSON.parse` then `JSON.stringify` does not reproduce the bytes Meta signed,
 * so any signature check built on the parsed body always fails.
 */
export function verifyCloudSignature(rawBody: string, header: string | null): boolean {
  if (!env.WHATSAPP_APP_SECRET || !header) return false;

  const expected = createHmac("sha256", env.WHATSAPP_APP_SECRET).update(rawBody).digest("hex");
  const received = header.replace(/^sha256=/, "");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(received, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Verifies a forwarded message from the Baileys bridge.
 *
 * The bridge signs the exact bytes it posts. Without this the webhook would act on
 * anything that reached the URL — and what it acts on is a request to read out the
 * company's whole order book.
 */
export function verifyBridgeSignature(rawBody: string, header: string | null): boolean {
  if (!env.BAILEYS_WEBHOOK_SECRET || !header) return false;

  const expected = createHmac("sha256", env.BAILEYS_WEBHOOK_SECRET).update(rawBody).digest("hex");
  const received = header.replace(/^sha256=/, "");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(received, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Verifies an OpenWA webhook, which signs with its own shared secret. */
export function verifyOpenWaSignature(rawBody: string, header: string | null): boolean {
  if (!env.OPENWA_WEBHOOK_SECRET || !header) return false;

  const expected = createHmac("sha256", env.OPENWA_WEBHOOK_SECRET).update(rawBody).digest("hex");
  const received = header.replace(/^sha256=/, "");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(received, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
//  Log queries
// ---------------------------------------------------------------------------

/** True when a message of this kind has already gone out for this day. */
export async function alreadySent(kind: MessageKind, coversDay: Date): Promise<boolean> {
  const existing = await prisma.messageLog.findFirst({
    where: { kind, coversDay, status: "SENT" },
    select: { id: true },
  });
  return existing !== null;
}

/** Recent traffic, for the settings screen — so a broken channel is visible in the app. */
export async function recentMessages(limit = 12) {
  return prisma.messageLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      provider: true,
      kind: true,
      recipient: true,
      body: true,
      status: true,
      error: true,
      sentAt: true,
      createdAt: true,
    },
  });
}

/** Billable sends this month, so the cost is visible rather than a surprise. */
export async function billableThisMonth(): Promise<number> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);

  return prisma.messageLog.count({
    where: {
      status: "SENT",
      createdAt: { gte: start },
      // Templates are the billable ones; the log records them with this prefix.
      body: { startsWith: "[template " },
    },
  });
}
