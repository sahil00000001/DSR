import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  logInbound,
  sendMessage,
  verifyCloudSignature,
  verifyOpenWaSignature,
} from "@/lib/messaging/send";
import {
  buildHelpReply,
  buildLateDigest,
  buildOrderDigest,
} from "@/lib/orders/digest";

/**
 * Inbound WhatsApp webhook.
 *
 * ## Why this route earns its keep twice
 *
 * The obvious job is answering the admin: he texts `STATUS` and gets every open order
 * back. The less obvious one is that receiving a message **opens Meta's 24-hour customer
 * service window**, inside which our replies are free — so logging inbound traffic here
 * is what lets the 6pm summary go out at no cost. See the note in `lib/messaging/send.ts`.
 *
 * It also makes the feature useful at 11am, not only at 6pm, which is the version of
 * this the works manager actually wanted: ask where the orders are, whenever.
 *
 * ## Two verbs, both required by Meta
 *
 *   GET  — the subscription handshake. Meta sends `hub.challenge` and expects it echoed
 *          back as plain text, with the `hub.verify_token` matching ours.
 *   POST — the messages, signed with `X-Hub-Signature-256` over the **raw** body.
 *
 * ## Always 200 on POST
 *
 * Meta retries a non-2xx for days and eventually disables the subscription. So a
 * malformed payload, an unknown command or a thrown error is logged and acknowledged —
 * the one thing that must not happen is the webhook being switched off because our
 * summary builder had a bad afternoon. An *unverified* signature is the exception: that
 * gets a 401, because acknowledging unsigned traffic would invite it.
 */

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
//  GET — subscription handshake
// ---------------------------------------------------------------------------

export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (!env.WHATSAPP_VERIFY_TOKEN) {
    logger.warn("WhatsApp webhook verification attempted with no verify token configured");
    return new NextResponse("Not configured", { status: 503 });
  }

  if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN && challenge) {
    // Plain text, not JSON — Meta compares the body byte for byte.
    return new NextResponse(challenge, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }

  return new NextResponse("Verification failed", { status: 403 });
}

// ---------------------------------------------------------------------------
//  POST — inbound messages
// ---------------------------------------------------------------------------

interface Inbound {
  from: string;
  text: string;
  externalId?: string;
}

/**
 * Pulls the messages out of a Cloud API payload.
 *
 * Meta's shape is deeply nested and every level is optional — a status callback (sent,
 * delivered, read) arrives on the same webhook with no `messages` array at all, and
 * those are the majority of the traffic. Read defensively and return nothing rather than
 * throwing on a shape we did not expect.
 */
function parseCloudPayload(body: unknown): Inbound[] {
  const root = body as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: Array<{
            from?: string;
            id?: string;
            type?: string;
            text?: { body?: string };
            button?: { text?: string };
            interactive?: {
              button_reply?: { title?: string };
              list_reply?: { title?: string };
            };
          }>;
        };
      }>;
    }>;
  };

  const out: Inbound[] = [];

  for (const entry of root.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        if (!message.from) continue;

        // A reply can arrive as text, as a quick-reply button, or as a list selection.
        // All three mean the same thing to us.
        const text =
          message.text?.body ??
          message.button?.text ??
          message.interactive?.button_reply?.title ??
          message.interactive?.list_reply?.title ??
          "";

        out.push({ from: message.from, text, externalId: message.id });
      }
    }
  }

  return out;
}

/** OpenWA's inbound shape is undocumented, so try the plausible field paths. */
function parseOpenWaPayload(body: unknown): Inbound[] {
  const root = body as Record<string, unknown>;
  const candidates: unknown[] = [];

  if (Array.isArray(root.messages)) candidates.push(...root.messages);
  else if (root.message) candidates.push(root.message);
  else if (root.data) candidates.push(root.data);
  else candidates.push(root);

  const out: Inbound[] = [];

  for (const raw of candidates) {
    const message = raw as Record<string, unknown>;
    const from =
      (message.from as string | undefined) ??
      (message.chatId as string | undefined) ??
      (message.sender as string | undefined);
    const text =
      (message.body as string | undefined) ??
      (message.text as string | undefined) ??
      (message.content as string | undefined) ??
      "";

    // Ignore our own outgoing echoes, which some gateways also deliver.
    if (message.fromMe === true) continue;
    if (from) out.push({ from, text, externalId: message.id as string | undefined });
  }

  return out;
}

/**
 * Decides what an inbound message is asking for.
 *
 * Deliberately forgiving: this is typed on a phone by somebody who is not thinking about
 * a command syntax. Anything containing "late" or "behind" gets the late list; anything
 * that looks like a status enquiry gets the full one; everything else gets the short help
 * text, because silence reads as broken.
 */
function interpret(raw: string): "status" | "late" | "help" {
  const text = raw.trim().toLowerCase();
  if (!text) return "help";

  if (/\b(late|behind|delay|risk|slip)\b/.test(text)) return "late";
  if (/\b(status|orders?|update|where|report|summary|progress)\b/.test(text)) return "status";
  return "help";
}

export async function POST(request: NextRequest) {
  // The raw body, because the signature is over these exact bytes — re-serialising a
  // parsed object does not reproduce them, so any check built on the parsed body fails.
  const raw = await request.text();
  const provider = env.MESSAGING_PROVIDER;

  if (provider === "cloud") {
    const signature = request.headers.get("x-hub-signature-256");
    if (!verifyCloudSignature(raw, signature)) {
      logger.warn("Rejected an unsigned WhatsApp webhook");
      return NextResponse.json({ error: "Bad signature" }, { status: 401 });
    }
  } else if (provider === "openwa") {
    const signature =
      request.headers.get("x-openwa-signature") ?? request.headers.get("x-hub-signature-256");
    if (!verifyOpenWaSignature(raw, signature)) {
      logger.warn("Rejected an unsigned OpenWA webhook");
      return NextResponse.json({ error: "Bad signature" }, { status: 401 });
    }
  } else {
    // No channel configured: acknowledge and ignore rather than 500 on stray traffic.
    return NextResponse.json({ ok: true, ignored: "messaging is not configured" });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Acknowledged on purpose — see the note above about Meta disabling subscriptions.
    return NextResponse.json({ ok: true, ignored: "unparseable body" });
  }

  const messages =
    provider === "cloud" ? parseCloudPayload(parsed) : parseOpenWaPayload(parsed);

  // Status callbacks and read receipts land here constantly and carry no messages.
  if (messages.length === 0) return NextResponse.json({ ok: true, messages: 0 });

  const allowed = (env.MESSAGING_ADMIN_NUMBER ?? "").replace(/\D/g, "");
  let replied = 0;

  for (const message of messages) {
    const from = message.from.replace(/\D/g, "");

    try {
      // Logged before anything else: this is what opens the free reply window, and it
      // should be recorded even if we choose not to answer.
      await logInbound({ from, body: message.text, externalId: message.externalId });

      /**
       * Only the configured admin gets answered.
       *
       * The number is public once it is on WhatsApp, and replying to strangers would
       * hand the company's order book to anyone who texts it. Their message is still
       * logged, so a genuine enquiry is not lost.
       */
      if (allowed && from !== allowed) {
        logger.info("Ignored an inbound message from an unknown number", {
          from: `${from.slice(0, 4)}…`,
        });
        continue;
      }

      const intent = interpret(message.text);

      const reply =
        intent === "status"
          ? (await buildOrderDigest()).text
          : intent === "late"
            ? (await buildLateDigest()).text
            : buildHelpReply();

      // Free-form: the message we just received opened the window.
      await sendMessage({ kind: "inbound_reply", text: reply, to: from });
      replied += 1;
    } catch (error) {
      // One bad message must not stop the others, and must not fail the webhook.
      logger.error("Failed to answer an inbound message", error, {
        from: `${from.slice(0, 4)}…`,
      });
    }
  }

  return NextResponse.json({ ok: true, messages: messages.length, replied });
}
