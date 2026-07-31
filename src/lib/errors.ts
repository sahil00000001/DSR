/**
 * Application error taxonomy.
 *
 * Every error surfaced to a user passes through here, which is how we guarantee
 * the "never expose raw errors" requirement: `toUserMessage()` returns the safe
 * message for known errors and a generic one for anything unexpected, while the
 * original is handed to the logger.
 */

import { logger } from "@/lib/logger";

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL";

export class AppError extends Error {
  readonly code: ErrorCode;
  /** Field-level messages, keyed by form field name. */
  readonly fieldErrors?: Record<string, string>;
  /** Safe to render verbatim in the UI. */
  readonly expose = true;

  constructor(code: ErrorCode, message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export const errors = {
  unauthenticated: (message = "Please sign in to continue.") =>
    new AppError("UNAUTHENTICATED", message),

  forbidden: (message = "You don't have permission to do that.") =>
    new AppError("FORBIDDEN", message),

  notFound: (what = "That record") => new AppError("NOT_FOUND", `${what} could not be found.`),

  validation: (message = "Please check the highlighted fields.", fields?: Record<string, string>) =>
    new AppError("VALIDATION", message, fields),

  conflict: (message: string) => new AppError("CONFLICT", message),

  rateLimited: (message = "Too many attempts. Please try again in a minute.") =>
    new AppError("RATE_LIMITED", message),

  internal: (message = "Something went wrong on our end. Please try again.") =>
    new AppError("INTERNAL", message),
};

const GENERIC_MESSAGE = "Something went wrong. Please try again.";

/**
 * Converts any thrown value into a message that is safe to show a user,
 * logging the underlying cause when it is not an intentional AppError.
 */
export function toUserMessage(error: unknown, context?: Record<string, unknown>): string {
  if (error instanceof AppError) return error.message;

  // Prisma unique-constraint violations are common enough to translate.
  if (isPrismaKnownError(error)) {
    if (error.code === "P2002") return "That value is already taken.";
    if (error.code === "P2025") return "That record no longer exists.";
  }

  logger.error("Unhandled error surfaced to user", error, context);
  return GENERIC_MESSAGE;
}

export function fieldErrorsOf(error: unknown): Record<string, string> | undefined {
  return error instanceof AppError ? error.fieldErrors : undefined;
}

type PrismaKnownError = { code: string; meta?: unknown };

function isPrismaKnownError(error: unknown): error is PrismaKnownError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    (error as { code: string }).code.startsWith("P")
  );
}

/** Standard shape returned by every server action. */
export type ActionResult<T = void> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; code?: ErrorCode };

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(error: unknown, context?: Record<string, unknown>): ActionResult<never> {
  return {
    ok: false,
    error: toUserMessage(error, context),
    fieldErrors: fieldErrorsOf(error),
    code: error instanceof AppError ? error.code : "INTERNAL",
  };
}
