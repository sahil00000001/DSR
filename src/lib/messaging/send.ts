import "server-only";
import { prisma } from "@/lib/db/prisma";
import { env, isMessagingEnabled } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { MessageKind } from "@/lib/constants/enums";

/**
 * Outbound messaging — the WhatsApp order summary.
 *
 * ## Why there is an abstraction at all
 *
 * The chosen channel is a self-hosted, unofficial WhatsApp gateway. Its own
 * documentation says the engine it uses carries "higher account-restriction risk", and
 * it needs a scanned QR session held on an always-on host. That is a channel that will
 * break — and when it does, the fix should be an environment variable, not a rewrite.
 * So the app knows how to speak to four things and picks one at runtime:
 *
 *   openwa    → self-hosted gateway. Free, no Meta setup, but you run the box and the
 *               number carries a ban risk.
 *   cloud     → Meta's official WhatsApp Cloud API. Runs from Vercel with one fetch,
 *               free inside a service window, no ban risk.
 *   telegram  → Bot API. Free forever, no approval, five minutes to set up.
 *   none      → writes to the log only. The right default until a channel is chosen.
 *
 * ## Why OpenWA cannot live inside this app
 *
 * It drives a headless Chromium (300–500 MB per session) and keeps an authenticated
 * WhatsApp Web session on disk. Vercel functions are ephemeral, read-only outside
 * `/tmp`, and capped at minutes. There is no arrangement of this code that makes it
 * work — it runs on a separate host and we talk to it over HTTP. See docs/WHATSAPP.md.
 *
 * ## Every send is logged
 *
 * A row is written before the attempt and updated after. Without that, "the admin says
 * he never got the 6pm summary" is unanswerable; with it, it is a row with a status and
 * an error string. The log is also what makes the daily digest idempotent — the cron
 * checks whether today's summary already went out.
 */

export interface SendResult {
  ok: boolean;
  /** The provider's message id, where it returns one. */
  externalId?: string;
  error?: string;
  /** True when no channel is configured, so the caller can stay quiet about it. */
  skipped?: boolean;
}

/**
 * Normalises a phone number to digits.
 *
 * WhatsApp addresses a chat as `<countrycode><number>@c.us` with no plus, no spaces and
 * no dashes. People write numbers every other way, so this strips rather than validates
 * — a wrong number fails at the gateway with a clear error, which is more useful than
 * this function refusing a number that would have worked.
 */
export function toChatId(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return `${digits}@c.us`;
}

async function viaOpenWa(to: string, text: string): Promise<SendResult> {
  const base = env.OPENWA_BASE_URL!.replace(/\/$/, "");
  const url = `${base}/api/sessions/${env.OPENWA_SESSION_ID}/messages/send-text`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": env.OPENWA_API_KEY!,
      },
      body: JSON.stringify({ chatId: toChatId(to), text }),
      // The gateway drives a browser; a cold session can take a while to answer.
      signal: AbortSignal.timeout(30_000),
    });

    const body = await response.text();
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}: ${body.slice(0, 300)}` };
    }

    // The gateway's success shape is not documented, so read defensively rather than
    // assuming a field that may not be there.
    let externalId: string | undefined;
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      const candidate =
        parsed.id ??
        parsed.messageId ??
        (parsed.data as Record<string, unknown> | undefined)?.id ??
        (parsed.key as Record<string, unknown> | undefined)?.id;
      if (typeof candidate === "string") externalId = candidate;
    } catch {
      // A non-JSON 200 is still a send. Not having an id costs us nothing.
    }

    return { ok: true, externalId };
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
}

async function viaCloudApi(to: string, text: string): Promise<SendResult> {
  const url = `https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_ID}/messages`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        // Digits only, no `@c.us` — the Cloud API addresses numbers differently.
        to: to.replace(/\D/g, ""),
        type: "text",
        text: { preview_url: false, body: text },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    const body = (await response.json()) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      return {
        ok: false,
        error: body.error?.message ?? `HTTP ${response.status}`,
      };
    }

    return { ok: true, externalId: body.messages?.[0]?.id };
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
}

async function viaTelegram(to: string, text: string): Promise<SendResult> {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: to,
        text,
        // Telegram's Markdown differs from WhatsApp's; plain text renders identically
        // in both, so the digest is written once and reads correctly either way.
        disable_web_page_preview: true,
      }),
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
    return "The gateway did not respond in time.";
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Sends one message and logs it.
 *
 * `coversDay` is for the daily digest: paired with `kind`, it lets the caller ask
 * "has today's summary already gone out?" without a second table.
 *
 * Never throws. A messaging failure must not take down the cron run that produced it,
 * so the result is returned and the row records what happened.
 */
export async function sendMessage({
  kind,
  text,
  to,
  coversDay,
}: {
  kind: MessageKind;
  text: string;
  /** Defaults to the configured admin recipient. */
  to?: string;
  coversDay?: Date;
}): Promise<SendResult> {
  const provider = env.MESSAGING_PROVIDER;
  const recipient =
    to ??
    (provider === "telegram" ? env.TELEGRAM_CHAT_ID : env.MESSAGING_ADMIN_NUMBER) ??
    "";

  const log = await prisma.messageLog.create({
    data: {
      provider,
      kind,
      recipient,
      body: text.slice(0, 8000),
      status: "QUEUED",
      coversDay: coversDay ?? null,
    },
    select: { id: true },
  });

  if (!isMessagingEnabled || !recipient) {
    // Not an error: an unconfigured deployment should still run, and the log is the
    // record of what *would* have been sent.
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
    provider === "openwa"
      ? await viaOpenWa(recipient, text)
      : provider === "cloud"
        ? await viaCloudApi(recipient, text)
        : provider === "telegram"
          ? await viaTelegram(recipient, text)
          : { ok: false, error: "No provider selected." };

  await prisma.messageLog.update({
    where: { id: log.id },
    data: {
      status: result.ok ? "SENT" : "FAILED",
      error: result.error?.slice(0, 500) ?? null,
      externalId: result.externalId ?? null,
      sentAt: result.ok ? new Date() : null,
    },
  });

  if (result.ok) {
    logger.info("Outbound message sent", { kind, provider, id: result.externalId });
  } else {
    logger.warn("Outbound message failed", { kind, provider, error: result.error });
  }

  return result;
}

/** True when a message of this kind has already gone out for this day. */
export async function alreadySent(kind: MessageKind, coversDay: Date): Promise<boolean> {
  const existing = await prisma.messageLog.findFirst({
    where: { kind, coversDay, status: "SENT" },
    select: { id: true },
  });
  return existing !== null;
}

/** Recent sends, for the settings screen — so a broken channel is visible in the app. */
export async function recentMessages(limit = 10) {
  return prisma.messageLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      provider: true,
      kind: true,
      recipient: true,
      status: true,
      error: true,
      sentAt: true,
      createdAt: true,
    },
  });
}
