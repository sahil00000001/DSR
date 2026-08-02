import { Pool } from "pg";
import pino from "pino";
import { config } from "./config.js";
import { assertSessionTable } from "./auth-state.js";
import { startBridge } from "./socket.js";
import { createBridgeServer } from "./server.js";

/**
 * Entry point.
 *
 * Boot order matters: the database is checked before the socket is opened, so a missing
 * table or a bad connection string is a clear error at second one rather than a WhatsApp
 * session that pairs successfully and then cannot persist a thing.
 */

const logger = pino({ level: config.logLevel });

const pool = new Pool({
  connectionString: config.databaseUrl,
  /*
   * Small but not one. Baileys reads keys in batches while decrypting, and a single
   * connection serialises those behind each other; five lets a burst of messages clear.
   * This is a long-lived process, so unlike the serverless app it keeps its pool warm.
   */
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (error) => {
  // A pooled connection dropped while idle — Supabase does this. `pg` replaces it; the
  // default behaviour for an unhandled 'error' event would be to crash the process.
  logger.warn({ error: error.message }, "Idle database connection dropped");
});

async function main(): Promise<void> {
  await assertSessionTable(pool);
  logger.info({ sessionId: config.sessionId }, "Session store ready");

  const bridge = await startBridge(pool);
  const server = createBridgeServer(bridge);

  server.listen(config.port, () => {
    logger.info({ port: config.port }, "WhatsApp bridge listening");

    const { connection } = bridge.status();
    if (connection !== "open") {
      logger.info(
        "Not paired yet. Pair with:  curl -H 'Authorization: Bearer <BRIDGE_TOKEN>' " +
          `-H 'content-type: application/json' -d '{"phone":"91XXXXXXXXXX"}' ` +
          `http://localhost:${config.port}/pair`,
      );
    }
  });

  /*
   * Close the socket deliberately on shutdown.
   *
   * Every container platform sends SIGTERM before a redeploy. Letting the process be
   * killed mid-connection leaves WhatsApp holding a session it thinks is live, and the
   * reconnect that follows looks like a conflicting device rather than a restart —
   * repeated often enough, that is the sort of pattern that gets a number flagged.
   */
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      logger.info({ signal }, "Shutting down");
      server.close();
      void pool.end().finally(() => process.exit(0));
    });
  }
}

main().catch((error: unknown) => {
  logger.error({ error }, "The bridge failed to start");
  process.exit(1);
});
