/**
 * Configuration, validated once at boot.
 *
 * Every miss is reported together rather than one per restart. A service that dies on the
 * first missing variable, gets one fixed, then dies on the next is a slow way to learn
 * what it needed.
 */

function required(name: string, errors: string[]): string {
  const value = process.env[name]?.trim();
  if (!value) {
    errors.push(`  • ${name} is required`);
    return "";
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

const errors: string[] = [];

export const config = {
  /** Where the pairing lives. The same Postgres the app uses; session mode, port 5432. */
  databaseUrl: required("DATABASE_URL", errors),

  /** Lets a second number be paired later without touching the schema. */
  sessionId: optional("SESSION_ID", "default"),

  /** Bearer token the app must present on /send. This is the only thing guarding it. */
  bridgeToken: required("BRIDGE_TOKEN", errors),

  /** Where inbound messages are forwarded — the app's existing WhatsApp webhook. */
  appWebhookUrl: optional("APP_WEBHOOK_URL"),

  /** Shared secret this bridge signs forwarded messages with. Must match the app's. */
  webhookSecret: optional("BRIDGE_WEBHOOK_SECRET"),

  port: Number(optional("PORT", "8080")),

  /**
   * Only this number is forwarded to the app.
   *
   * A WhatsApp number is public the moment it is in use, and the app answers `STATUS` with
   * the whole order book. Filtering at the bridge means a stranger's message never reaches
   * the app at all. The app filters again — two cheap checks for something this sensitive.
   */
  adminNumber: optional("ADMIN_NUMBER").replace(/\D/g, ""),

  logLevel: optional("LOG_LEVEL", "info"),
} as const;

if (errors.length > 0) {
  console.error(`\nThe WhatsApp bridge cannot start:\n${errors.join("\n")}\n`);
  process.exit(1);
}

if (!config.appWebhookUrl || !config.webhookSecret) {
  console.warn(
    "APP_WEBHOOK_URL or BRIDGE_WEBHOOK_SECRET is unset — outbound sending will work, but " +
      "replies to the admin's messages will not. Set both to enable the STATUS command.",
  );
}
