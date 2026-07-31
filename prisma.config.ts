import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

/**
 * Prisma CLI configuration.
 *
 * Prisma 7 moved connection strings out of `schema.prisma`, so this is where
 * `migrate`, `db push`, `db pull` and `studio` get their URL. The *runtime* client
 * does not read this file at all — it takes a driver adapter instead (see
 * `src/lib/db/prisma.ts`).
 *
 * `directUrl` is what the CLI uses, deliberately:
 *
 *   • DDL needs session mode (Supabase pooler port 5432). pgbouncer in transaction
 *     mode can't hold the session state a migration requires.
 *   • The app itself uses the transaction-mode pooler on 6543, because serverless
 *     opens a connection per invocation.
 *
 * `dotenv/config` is imported explicitly: the CLI no longer auto-loads `.env`
 * in v7, so without it every command would report a missing URL.
 */
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),

  migrations: {
    path: path.join("prisma", "migrations"),
    // `npx prisma db seed` runs this.
    seed: "tsx prisma/seed.ts",
  },

  datasource: {
    // Fall back to DATABASE_URL so a single-URL setup still works.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
