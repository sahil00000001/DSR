import "server-only";
import { PrismaClient } from "@prisma/client";

/**
 * Prisma singleton.
 *
 * Next's dev server hot-reloads modules on every edit; without caching the
 * client on `globalThis` each reload would open a fresh connection pool and
 * eventually exhaust the database's connection limit.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? [{ emit: "stdout", level: "warn" }, { emit: "stdout", level: "error" }]
        : [{ emit: "stdout", level: "error" }],
  });

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
  return isPostgres
    ? { contains: value, mode: "insensitive" as const }
    : { contains: value };
}
