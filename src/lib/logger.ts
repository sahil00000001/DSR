/**
 * Minimal structured logger.
 *
 * Emits single-line JSON in production (so Vercel's log drain can index it) and
 * readable, colourised text in development. Deliberately dependency-free.
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const isProd = process.env.NODE_ENV === "production";
const minLevel: Level = isProd ? "info" : "debug";

const COLOR: Record<Level, string> = {
  debug: "\x1b[90m",
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};
const RESET = "\x1b[0m";

export type LogContext = Record<string, unknown>;

/** Never let a logging failure take down a request. */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '"[unserialisable]"';
  }
}

function emit(level: Level, message: string, context?: LogContext) {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[minLevel]) return;

  const timestamp = new Date().toISOString();

  if (isProd) {
    console[level === "debug" ? "log" : level](
      safeStringify({ level, timestamp, message, ...context }),
    );
    return;
  }

  const suffix = context && Object.keys(context).length ? ` ${safeStringify(context)}` : "";
  console[level === "debug" ? "log" : level](
    `${COLOR[level]}${level.toUpperCase().padEnd(5)}${RESET} ${message}${suffix}`,
  );
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit("debug", message, context),
  info: (message: string, context?: LogContext) => emit("info", message, context),
  warn: (message: string, context?: LogContext) => emit("warn", message, context),
  error: (message: string, error?: unknown, context?: LogContext) =>
    emit("error", message, {
      ...context,
      ...(error instanceof Error
        ? { error: error.message, stack: isProd ? undefined : error.stack }
        : error !== undefined
          ? { error: String(error) }
          : {}),
    }),
};
