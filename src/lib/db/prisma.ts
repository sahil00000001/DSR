import "server-only";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma singleton, on a `pg` driver adapter.
 *
 * ## Why an adapter (Prisma 7)
 *
 * Prisma 7 removed `url` from the schema and connects through a driver adapter
 * instead. That turns out to be an improvement rather than a chore:
 *
 *   • The Rust query engine binary is gone from the deployment bundle — a large
 *     saving on a serverless function's size budget.
 *   • Pooling is `pg`'s, so it's configurable here rather than through query-string
 *     flags we can only hope are honoured.
 *
 * ## Pool sizing — learned the hard way
 *
 * `max: 1` is the advice you'll find for Prisma on serverless, and it is **wrong
 * for this app**. It holds only when a request issues its queries sequentially.
 * Several pages here — the dashboard above all — deliberately fan out with
 * `Promise.all` for latency, so a single connection means every query after the
 * first queues behind it and anything still waiting at `pool_timeout` dies with
 * `P2024: Timed out fetching a new connection from the connection pool`.
 *
 * That produced an intermittent 500 on `/dashboard` in production while every
 * lighter page stayed fine — the classic signature of pool starvation.
 *
 * `max: 5` lets a fanned-out request proceed in a couple of waves. It does not
 * risk the database: these are *pooler* connections (Supabase pgbouncer in
 * transaction mode), which are cheap and multiplexed onto a much smaller number of
 * real Postgres backends. Raise it on a long-lived server; keep it modest here
 * because each serverless instance carries its own pool.
 */

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  adapter?: PrismaPg;
};

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — the database adapter cannot be created.");
  }

  const adapter =
    globalForPrisma.adapter ??
    new PrismaPg({
      connectionString,
      // See the note above: must exceed 1 because requests fan out.
      max: 5,
      // Close idle connections promptly; a warm serverless instance that holds one
      // open for minutes is a connection nobody else can use.
      idleTimeoutMillis: 10_000,
      // Generous enough to survive a cold pooler handshake under load.
      connectionTimeoutMillis: 20_000,
    });

  if (process.env.NODE_ENV !== "production") globalForPrisma.adapter = adapter;

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? [{ emit: "stdout", level: "warn" }, { emit: "stdout", level: "error" }]
        : [{ emit: "stdout", level: "error" }],
  });
}

/**
 * Cached on `globalThis` because Next's dev server hot-reloads modules on every
 * edit; without this each reload would open a fresh pool and eventually exhaust
 * the database's connection limit.
 */
export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Case-insensitive `contains` filter that works on both providers.
 *
 * SQLite's `LIKE` is already case-insensitive for ASCII, and Prisma rejects
 * `mode: "insensitive"` against it. PostgreSQL is the opposite: `LIKE` is
 * case-sensitive and needs the explicit mode. This resolves the difference once
 * so search code doesn't have to care which database it's talking to.
 */
const isPostgres = /^postgres(ql)?:/.test(process.env.DATABASE_URL ?? "");

export function containsInsensitive(value: string) {
  return isPostgres ? { contains: value, mode: "insensitive" as const } : { contains: value };
}
