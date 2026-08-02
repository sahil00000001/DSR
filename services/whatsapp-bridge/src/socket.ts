import { createHmac } from "node:crypto";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";
import type { WASocket } from "@whiskeysockets/baileys";
import type { Boom } from "@hapi/boom";
import type { Pool } from "pg";
import pino from "pino";
import { config } from "./config.js";
import { usePostgresAuthState, type AuthStateStore } from "./auth-state.js";

/**
 * The WhatsApp connection.
 *
 * ## Why this process exists at all
 *
 * Baileys speaks WhatsApp's real multi-device protocol over a WebSocket it must hold open,
 * with a paired device session and a few hundred Signal keys it mutates as messages flow.
 * None of that survives a serverless function, which is frozen between requests and has no
 * durable disk — so this cannot live in the Next app on Vercel and runs beside it instead,
 * reachable over HTTP.
 *
 * ## Connection state is a fact about the world, not a boolean we set
 *
 * WhatsApp closes this socket routinely: a protocol upgrade, a conflict when the phone
 * relinks, an idle timeout, the daily server-side reshuffle. Almost all of those want an
 * immediate reconnect. Exactly one — `loggedOut` — must not retry, because the pairing is
 * gone and reconnecting in a loop against a revoked session is how a number gets flagged.
 * That distinction is the whole of `shouldReconnect` below and the reason it is commented
 * rather than terse.
 */

const logger = pino({ level: config.logLevel });

export type ConnectionState = "connecting" | "open" | "closed" | "logged-out";

interface Bridge {
  status: () => {
    connection: ConnectionState;
    pairedNumber: string | null;
    /** Present only while unpaired — the QR string to render. */
    qr: string | null;
    lastError: string | null;
    reconnects: number;
    since: string;
  };
  sendText: (toDigits: string, text: string) => Promise<{ id: string }>;
  requestPairingCode: (phoneDigits: string) => Promise<string>;
  logout: () => Promise<void>;
}

/** WhatsApp addresses an individual chat this way. `@c.us` is a different library's format. */
export function toJid(raw: string): string {
  return `${raw.replace(/\D/g, "")}@s.whatsapp.net`;
}

export async function startBridge(pool: Pool): Promise<Bridge> {
  let auth: AuthStateStore = await usePostgresAuthState(pool, config.sessionId);
  let sock: WASocket | null = null;

  let connection: ConnectionState = "connecting";
  let qr: string | null = null;
  let lastError: string | null = null;
  let reconnects = 0;
  let backoffMs = 1_000;
  const since = new Date().toISOString();

  async function connect(): Promise<void> {
    /*
     * The protocol version is fetched rather than pinned. WhatsApp rejects clients that
     * fall too far behind, and a hard-coded version turns that into an outage on a date
     * nobody chose. On a network failure the library's bundled version is used instead.
     */
    const { version, isLatest } = await fetchLatestBaileysVersion();
    logger.info({ version, isLatest }, "Using WhatsApp protocol version");

    sock = makeWASocket({
      version,
      auth: {
        creds: auth.state.creds,
        /*
         * The signal key store is read many times per message. Caching it in memory keeps
         * decryption off the database for the common case while still writing through.
         */
        keys: makeCacheableSignalKeyStore(auth.state.keys, logger),
      },
      logger,
      browser: Browsers.ubuntu("Chrome"),

      /**
       * Do not take the account "online".
       *
       * A linked device that reports itself online tells WhatsApp the user is at a
       * keyboard, and the phone then stops raising push notifications. The admin would
       * quietly stop being notified of his own messages — a bizarre symptom to debug, and
       * caused entirely by a default.
       */
      markOnlineOnConnect: false,

      // This is a notifier, not a client. Pulling years of history on pair would cost
      // minutes of sync and a great deal of memory for data nothing here reads.
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
    });

    sock.ev.on("creds.update", () => {
      void auth.saveCreds().catch((error: unknown) => {
        // Losing a creds write means re-pairing after the next restart, so it is loud.
        logger.error({ error }, "Failed to persist WhatsApp credentials");
      });
    });

    sock.ev.on("connection.update", (update) => {
      if (update.qr) {
        qr = update.qr;
        connection = "connecting";
        logger.info("A QR code is waiting to be scanned — see GET /qr");
      }

      if (update.connection === "open") {
        qr = null;
        lastError = null;
        backoffMs = 1_000;
        connection = "open";
        logger.info({ number: sock?.user?.id }, "WhatsApp connected");
      }

      if (update.connection === "close") {
        const boom = update.lastDisconnect?.error as Boom | undefined;
        const code = boom?.output?.statusCode;
        lastError = boom?.message ?? "connection closed";

        /*
         * `loggedOut` (401) is the one code that must not be retried: the pairing has been
         * revoked — from the phone's linked-devices screen, or by WhatsApp — and every
         * reconnect is an authentication failure against a dead session. Retrying that in
         * a loop is exactly the behaviour that gets a number restricted, so the stored
         * session is cleared and the bridge waits, unpaired, for somebody to scan again.
         *
         * `restartRequired` (515) is the opposite and is *expected*: WhatsApp sends it
         * immediately after a successful pairing and the socket must be rebuilt at once.
         * Treating it as an error would leave a freshly paired bridge permanently down.
         */
        if (code === DisconnectReason.loggedOut) {
          connection = "logged-out";
          logger.error("WhatsApp reports this device is logged out — clearing the session");
          void auth
            .clear()
            .then(async () => {
              auth = await usePostgresAuthState(pool, config.sessionId);
              void connect();
            })
            .catch((error: unknown) => logger.error({ error }, "Failed to clear the session"));
          return;
        }

        connection = "closed";
        reconnects += 1;

        /**
         * An expired batch of QR codes is not a failure, so it does not get the backoff.
         *
         * WhatsApp issues a handful of codes and then closes the socket if none is
         * scanned. While nobody has paired yet that is the *expected* end of every
         * connection, not a fault — but the exponential backoff could not tell the
         * difference and grew to a minute. Somebody watching the pairing page then spends
         * that minute looking at no code at all and reasonably concludes it is broken.
         *
         * So: short, fixed delay while unpaired and waiting to be scanned. The backoff is
         * kept for everything else, where it is doing real work — a WhatsApp-side outage
         * must not become a reconnect storm from our side, which is its own way of
         * attracting attention to a number.
         */
        /*
         * `creds.me`, not `creds.registered`.
         *
         * Baileys only sets `registered` on the pairing-*code* path; a device paired by
         * QR leaves it false forever. Reading it here meant a genuinely paired bridge
         * still looked like it was waiting to be scanned, so a real `timedOut` — a
         * network drop — would take the 2s fast path and skip the backoff entirely,
         * turning an outage into a reconnect storm. `me` is set by both pairing routes
         * and is the honest answer to "is a device linked".
         */
        const awaitingScan = !sock?.authState.creds.me;
        const qrExpired = awaitingScan && code === DisconnectReason.timedOut;

        const delay =
          code === DisconnectReason.restartRequired ? 0 : qrExpired ? 2_000 : backoffMs;

        if (qrExpired) {
          backoffMs = 1_000;
        } else {
          backoffMs = Math.min(backoffMs * 2, 60_000);
        }

        logger.warn(
          { code, delay, lastError, awaitingScan },
          qrExpired
            ? "QR codes expired unscanned — issuing a fresh batch"
            : "WhatsApp disconnected — reconnecting",
        );
        setTimeout(() => void connect(), delay);
      }
    });

    sock.ev.on("messages.upsert", (event) => {
      // `notify` is a genuinely new message. `append` is history being backfilled, and
      // answering those would have the bridge replying to weeks of old messages on pair.
      if (event.type !== "notify") return;

      for (const message of event.messages) {
        if (message.key.fromMe) continue;

        const from = (message.key.remoteJid ?? "").replace(/\D/g, "");
        if (!from) continue;

        // Groups, broadcasts and status updates are not the admin talking to us.
        if (!message.key.remoteJid?.endsWith("@s.whatsapp.net")) continue;

        const text =
          message.message?.conversation ??
          message.message?.extendedTextMessage?.text ??
          message.message?.imageMessage?.caption ??
          message.message?.videoMessage?.caption ??
          message.message?.buttonsResponseMessage?.selectedDisplayText ??
          message.message?.listResponseMessage?.title ??
          "";

        if (!text.trim()) continue;

        void forwardInbound({ from, text, externalId: message.key.id ?? undefined });
      }
    });
  }

  /**
   * Hands an inbound message to the app.
   *
   * Signed with an HMAC over the exact bytes sent, because this endpoint is public and
   * the app acts on what arrives — an unsigned forwarder would let anybody who found the
   * URL make the bridge appear to say anything.
   */
  async function forwardInbound(payload: {
    from: string;
    text: string;
    externalId?: string;
  }): Promise<void> {
    if (config.adminNumber && payload.from !== config.adminNumber) {
      logger.info({ from: `${payload.from.slice(0, 4)}…` }, "Ignored a message from an unknown number");
      return;
    }

    if (!config.appWebhookUrl || !config.webhookSecret) return;

    const body = JSON.stringify({ messages: [payload] });
    const signature = createHmac("sha256", config.webhookSecret).update(body).digest("hex");

    try {
      const response = await fetch(config.appWebhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bridge-signature": `sha256=${signature}`,
        },
        body,
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        logger.warn({ status: response.status }, "The app rejected a forwarded message");
      }
    } catch (error) {
      // A failed forward loses one reply. It must never kill the socket.
      logger.error({ error }, "Failed to forward an inbound message");
    }
  }

  await connect();

  return {
    status: () => ({
      connection,
      pairedNumber: sock?.user?.id?.split(":")[0]?.split("@")[0] ?? null,
      qr,
      lastError,
      reconnects,
      since,
    }),

    async sendText(number, text) {
      if (!sock || connection !== "open") {
        throw new Error(`WhatsApp is not connected (state: ${connection}).`);
      }

      const jid = toJid(number);

      /*
       * Check the number is on WhatsApp before sending.
       *
       * Sending to one that is not fails as a generic timeout much later, which reads like
       * the bridge being broken rather than a typo in a config value. `onWhatsApp` returns
       * undefined — not an empty array — when the lookup itself fails, and that is a
       * different thing again: reporting a network blip as "wrong number" sends somebody
       * hunting for a mistake that was never there.
       */
      const lookup = await sock.onWhatsApp(jid);
      if (!lookup) {
        throw new Error("Could not check the number with WhatsApp — the lookup failed.");
      }

      const known = lookup[0];
      if (!known?.exists) {
        throw new Error(`${number.replace(/\D/g, "")} is not on WhatsApp.`);
      }

      const sent = await sock.sendMessage(known.jid, { text });
      if (!sent?.key.id) throw new Error("WhatsApp accepted the message but returned no id.");

      return { id: sent.key.id };
    },

    /**
     * Pairs by code instead of QR.
     *
     * Far better on a server: the admin types an eight-character code into his phone
     * rather than somebody screenshotting a QR out of a container log and sending the
     * keys to a working WhatsApp account through a chat app.
     */
    async requestPairingCode(phoneDigits) {
      if (!sock) throw new Error("The socket is not up yet — try again in a moment.");
      // Same reason as above: `me` is the reliable "already linked" signal. Guarding on
      // `registered` let a second /pair disrupt a working QR-paired session.
      if (sock.authState.creds.me) {
        throw new Error("This bridge is already paired. Call /logout first to re-pair.");
      }

      const code = await sock.requestPairingCode(phoneDigits.replace(/\D/g, ""));
      logger.info("Issued a pairing code");
      return code;
    },

    async logout() {
      try {
        await sock?.logout();
      } finally {
        await auth.clear();
        auth = await usePostgresAuthState(pool, config.sessionId);
        connection = "logged-out";
      }
    },
  };
}
