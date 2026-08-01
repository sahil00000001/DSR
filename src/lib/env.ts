import "server-only";
import { z } from "zod";

/**
 * Validated server environment.
 *
 * Parsed once at module load so a misconfigured deployment fails loudly at
 * boot rather than with a confusing runtime error three screens deep. Optional
 * integrations (Google OAuth, SMTP) degrade gracefully instead of throwing —
 * the corresponding feature simply reports itself as unconfigured.
 */
/**
 * A URL that may legitimately be absent — and treats `""` as absent.
 *
 * `z.string().url().optional()` admits `undefined` but *rejects* the empty string,
 * so a `.env` carrying `SUPABASE_URL=""` (the natural way to write "not set yet")
 * would fail validation and stop the app booting. Env files habitually hold blank
 * placeholders, so blank has to mean unset.
 */
const optionalUrl = z
  .string()
  .url()
  .optional()
  .or(z.literal("").transform(() => undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  /**
   * Non-pooled connection, used by `prisma migrate` / `db push` for DDL.
   *
   * Optional here because the *application* never reads it — but
   * `prisma/schema.prisma` references it as `directUrl`, and Prisma errors when a
   * referenced datasource variable is missing. In practice it must be set
   * wherever `prisma generate` runs, including the Vercel build.
   *
   * With Supabase, this is the pooler host on port 5432 (session mode) rather
   * than `db.<ref>.supabase.co`, which newer projects no longer publish.
   */
  DIRECT_URL: z.string().optional(),

  /**
   * Supabase project credentials.
   *
   * This app talks to Postgres directly through Prisma and owns its own sessions,
   * so none of these are required to run. They're validated here (rather than read
   * ad hoc) so adopting Supabase Storage for DSR attachments later is a
   * configuration change, not a refactor. `SUPABASE_SECRET_KEY` bypasses
   * row-level security — it must stay server-side, which is why no key here
   * carries a `NEXT_PUBLIC_` prefix.
   */
  SUPABASE_URL: optionalUrl,
  SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
  SUPABASE_JWKS_URL: optionalUrl,

  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET must be at least 32 characters — generate one with `openssl rand -hex 32`"),

  /**
   * Canonical origin. Optional on Vercel — see `resolveAppUrl()` below, which
   * derives it from the platform's own variables so a first deploy doesn't need
   * you to know the URL in advance.
   */
  NEXT_PUBLIC_APP_URL: optionalUrl,

  /**
   * Injected by Vercel, not by us.
   *
   * `VERCEL_PROJECT_PRODUCTION_URL` is the *stable* production domain, which is
   * what email links need. `VERCEL_URL` is deployment-specific (it changes every
   * push) so it's only a fallback, useful for preview deployments.
   *
   * Both arrive without a protocol.
   */
  VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
  VERCEL_URL: z.string().optional(),

  /**
   * Shows the seeded sign-in credentials on the login screen. Intended for
   * demos and review deployments — set to "false" for any real installation.
   */
  NEXT_PUBLIC_DEMO_MODE: z
    .string()
    .optional()
    .transform((value) => value !== "false"),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_ALLOWED_DOMAINS: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((v) => v !== "false"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().default("Pooja Machines <no-reply@poojamachines.co.in>"),

  CRON_SECRET: z.string().optional(),

  /**
   * Outbound messaging — the end-of-day order summary.
   *
   * `openwa` posts to a self-hosted OpenWA gateway; `cloud` posts to Meta's official
   * WhatsApp Cloud API; `telegram` posts to the Bot API; `none` writes to the send log
   * only, which is the right default for development and for any deployment that has
   * not set a channel up yet.
   *
   * OpenWA **cannot run on Vercel**: it holds a headless Chromium and a scanned QR
   * session, and Vercel functions are ephemeral with a read-only filesystem. It runs on
   * a separate always-on host and this app talks to it over HTTP. See docs/WHATSAPP.md.
   */
  MESSAGING_PROVIDER: z.enum(["none", "openwa", "cloud", "telegram"]).default("none"),

  /** Where the summary goes. Digits with country code, no plus: 919876543210. */
  MESSAGING_ADMIN_NUMBER: z.string().optional(),

  // OpenWA — self-hosted gateway
  OPENWA_BASE_URL: optionalUrl,
  OPENWA_API_KEY: z.string().optional(),
  OPENWA_SESSION_ID: z.string().optional(),
  /** Shared secret OpenWA signs its inbound webhooks with. */
  OPENWA_WEBHOOK_SECRET: z.string().optional(),

  /**
   * Meta WhatsApp Cloud API — the recommended channel.
   *
   * Runs from Vercel with a single fetch: no server, no QR session, no ban risk. Free
   * inside a 24-hour customer service window, ~₹0.115 + GST per template outside one,
   * which is roughly ₹4/month for one daily summary. See docs/WHATSAPP.md.
   */
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_ID: z.string().optional(),
  /** App secret, for verifying the X-Hub-Signature-256 on inbound webhooks. */
  WHATSAPP_APP_SECRET: z.string().optional(),
  /** Echoed back during Meta's webhook handshake. Any string you choose. */
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  /** Approved utility template, used when no service window is open. */
  WHATSAPP_SUMMARY_TEMPLATE: z.string().default("order_daily_summary"),

  // Telegram — free forever, no approval
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
});

function parseEnv() {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  • ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill in the required values.`,
    );
  }

  return parsed.data;
}

/**
 * Resolves the canonical origin.
 *
 * An explicit `NEXT_PUBLIC_APP_URL` always wins — set it once you have a custom
 * domain, because that's what should appear in emails. Otherwise Vercel's own
 * variables are used, so a first deploy works with no configuration and preview
 * deployments generate links that point at themselves rather than at production.
 *
 * Safe because every consumer is server-side (email templates, the OAuth redirect,
 * the same-origin check) — nothing here is inlined into the client bundle, so
 * resolving at runtime rather than at build time costs nothing.
 */
function resolveAppUrl(parsed: z.infer<typeof schema>): string {
  if (parsed.NEXT_PUBLIC_APP_URL) return parsed.NEXT_PUBLIC_APP_URL;
  if (parsed.VERCEL_PROJECT_PRODUCTION_URL) return `https://${parsed.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (parsed.VERCEL_URL) return `https://${parsed.VERCEL_URL}`;
  return "http://localhost:3000";
}

const parsedEnv = parseEnv();

export const env = {
  ...parsedEnv,
  // Overwritten with the resolved value so all 13 call sites stay unchanged.
  NEXT_PUBLIC_APP_URL: resolveAppUrl(parsedEnv),
};

/** Google OAuth is only offered when both halves of the credential are present. */
export const isGoogleAuthEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

/** When SMTP is unset, the mailer writes rendered messages to the console instead. */
export const isSmtpEnabled = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD);

export const isProduction = env.NODE_ENV === "production";

/** Supabase-backed storage/realtime features can be enabled. */
export const isSupabaseConfigured = Boolean(env.SUPABASE_URL && env.SUPABASE_SECRET_KEY);

/**
 * True when a real messaging channel is wired up.
 *
 * Checks the credentials the *chosen* provider actually needs rather than any one
 * variable: a deployment with `MESSAGING_PROVIDER=openwa` and no base URL is
 * misconfigured, and reporting that as enabled would hide it until 6pm.
 */
export const isMessagingEnabled = (() => {
  switch (env.MESSAGING_PROVIDER) {
    case "openwa":
      return Boolean(env.OPENWA_BASE_URL && env.OPENWA_API_KEY && env.OPENWA_SESSION_ID);
    case "cloud":
      return Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_ID);
    case "telegram":
      return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
    default:
      return false;
  }
})();

/**
 * Warns when the runtime URL is a direct Postgres connection in production.
 * On serverless that exhausts the connection limit under very modest load, and
 * the failure looks like random 500s rather than a configuration problem.
 */
if (isProduction && !/pooler|pgbouncer/.test(env.DATABASE_URL)) {
  console.warn(
    "[pmpl] DATABASE_URL is not a pooled connection. On serverless hosting, use the " +
      "Supabase connection-pooler endpoint (port 6543) with ?pgbouncer=true&connection_limit=1.",
  );
}

export const googleAllowedDomains = (env.GOOGLE_ALLOWED_DOMAINS ?? "")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);
