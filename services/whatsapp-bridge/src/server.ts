import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import pino from "pino";
import { config } from "./config.js";

/**
 * The bridge's HTTP surface. Four routes, no framework.
 *
 * `node:http` rather than Express: this is four endpoints on a box whose entire job is
 * staying up, and every dependency here is one more thing that can fail to install during
 * a redeploy at six in the evening.
 *
 * ## Everything except /health requires the token
 *
 * `/send` can message anybody as the company's number, `/qr` and `/pair` can hand the
 * account to whoever holds the result, and `/logout` can take the channel down. There is
 * no read-only route among them, so the token is checked in one place, before dispatch,
 * and compared in constant time — a token verified with `===` leaks its prefix to anyone
 * patient enough to measure.
 *
 * `/health` is deliberately outside that: platforms probe it unauthenticated, and it
 * reports only whether the socket is up. It does not include the paired number, which
 * would otherwise publish the company's WhatsApp number to anyone who found the URL.
 */

const logger = pino({ level: config.logLevel });

export interface Handlers {
  status: () => {
    connection: string;
    pairedNumber: string | null;
    qr: string | null;
    lastError: string | null;
    reconnects: number;
    since: string;
  };
  sendText: (to: string, text: string) => Promise<{ id: string }>;
  requestPairingCode: (phone: string) => Promise<string>;
  logout: () => Promise<void>;
}

function json(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
    // Nothing here is cacheable and some of it is credentials.
    "cache-control": "no-store",
  });
  response.end(payload);
}

function authorised(request: IncomingMessage): boolean {
  const header = request.headers.authorization ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";

  const a = Buffer.from(presented);
  const b = Buffer.from(config.bridgeToken);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readBody(request: IncomingMessage, limitBytes = 64 * 1024): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    // An unbounded read is a way to run the container out of memory from outside it.
    if (size > limitBytes) throw new Error("Request body too large.");
    chunks.push(chunk as Buffer);
  }

  return Buffer.concat(chunks).toString("utf8");
}

export function createBridgeServer(handlers: Handlers) {
  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      logger.error({ error }, "Unhandled error in the bridge server");
      if (!response.headersSent) json(response, 500, { error: "Internal error" });
    });
  });

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const route = `${request.method} ${url.pathname}`;

    // Unauthenticated: platform health probes need it, so it says as little as possible.
    if (route === "GET /health") {
      const { connection, reconnects, since } = handlers.status();
      const healthy = connection === "open";
      return json(response, healthy ? 200 : 503, { status: connection, reconnects, since });
    }

    if (!authorised(request)) {
      logger.warn({ route }, "Rejected an unauthenticated bridge request");
      return json(response, 401, { error: "Unauthorised" });
    }

    switch (route) {
      /** Full state, including the paired number — hence behind the token. */
      case "GET /status":
        return json(response, 200, handlers.status());

      /**
       * The QR string, for pairing by scan.
       *
       * Returned as the raw string rather than an image so the caller can render it
       * however suits — a terminal, a page, a phone. Whoever sees this can link a device
       * to the account, which is why it is behind the token like everything else.
       */
      case "GET /qr": {
        const { qr, connection } = handlers.status();
        if (!qr) {
          return json(response, 409, {
            error:
              connection === "open"
                ? "Already paired. Call POST /logout first to re-pair."
                : "No QR is pending yet — try again in a few seconds.",
            connection,
          });
        }
        return json(response, 200, { qr, connection });
      }

      /** Pair by code instead: safer than moving a QR image around. */
      case "POST /pair": {
        const body = JSON.parse(await readBody(request)) as { phone?: string };
        if (!body.phone) return json(response, 400, { error: "phone is required" });

        try {
          const code = await handlers.requestPairingCode(body.phone);
          return json(response, 200, { code });
        } catch (error) {
          return json(response, 409, { error: (error as Error).message });
        }
      }

      case "POST /send": {
        const body = JSON.parse(await readBody(request)) as { to?: string; text?: string };
        if (!body.to || !body.text) {
          return json(response, 400, { error: "to and text are required" });
        }

        try {
          const { id } = await handlers.sendText(body.to, body.text);
          return json(response, 200, { ok: true, id });
        } catch (error) {
          // 502, not 500: the bridge is fine, WhatsApp would not take the message. The
          // app distinguishes these when deciding whether a retry is worth anything.
          return json(response, 502, { ok: false, error: (error as Error).message });
        }
      }

      case "POST /logout":
        await handlers.logout();
        return json(response, 200, { ok: true });

      default:
        return json(response, 404, { error: "Not found" });
    }
  }

  return server;
}
