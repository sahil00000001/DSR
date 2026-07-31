"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { toUserMessage } from "@/lib/errors";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  parseFormData,
  resetPasswordSchema,
} from "@/lib/validation/schemas";
import {
  hashPassword,
  isPasswordAcceptable,
  needsRehash,
  verifyPassword,
  fakeVerify,
} from "@/lib/auth/password";
import {
  createSession,
  destroySession,
  clientIp,
  getCurrentUser,
  requireUserAction,
  revokeAllSessions,
  revokeSession,
} from "@/lib/auth/session";
import { hit, limitKey, LIMITS, reset as resetLimit } from "@/lib/auth/rate-limit";
import { consumeToken, issueToken } from "@/lib/auth/tokens";
import { sendEmail } from "@/lib/email/mailer";
import { passwordResetEmail } from "@/lib/email/templates";
import { recordAudit } from "@/lib/services/audit";
import { formError, formSuccess, type FormState } from "@/server/actions/form-state";

/**
 * Authentication actions.
 *
 * Two principles run through this file:
 *
 *  1. **No account enumeration.** Wrong-password, unknown-email and disabled
 *     accounts all return the same message, and the unknown-email path still
 *     burns a scrypt-equivalent amount of CPU (`fakeVerify`) so response timing
 *     doesn't give the answer away either.
 *  2. **`redirect()` is called outside try/catch.** Next implements it by
 *     throwing a control-flow signal; catching it would turn a successful
 *     sign-in into a generic error. Every action here computes its outcome
 *     first, then redirects.
 */

/** One message for every credential failure. */
const CREDENTIALS_ERROR = "That email and password don't match an account.";

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseFormData(loginSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  const { email, password, next } = parsed.data;
  let destination: string | null = null;

  try {
    const headerList = await headers();
    const ip = clientIp(headerList);

    // Keyed on both, so one attacker can't lock out a real user by guessing at
    // their address from elsewhere.
    const limit = hit(limitKey("login", email, ip), LIMITS.login.limit, LIMITS.login.window);
    if (!limit.ok) {
      await recordAudit({
        action: "auth.login_failed",
        entity: "user",
        meta: { email, reason: "rate_limited" },
      });
      return formError(
        `Too many attempts. Try again in ${Math.ceil(limit.retryAfter / 60)} minute(s), or reset your password.`,
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        passwordHash: true,
      },
    });

    if (!user || !user.passwordHash) {
      // Equalise timing against the real verification path.
      await fakeVerify();
      return formError(CREDENTIALS_ERROR);
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      await recordAudit({
        actorId: user.id,
        action: "auth.login_failed",
        entity: "user",
        entityId: user.id,
        meta: { email, reason: "bad_password" },
      });
      return formError(CREDENTIALS_ERROR);
    }

    if (user.status === "DISABLED") {
      return formError("This account has been disabled. Please contact your administrator.");
    }

    // Transparent upgrade if the stored parameters are below current policy.
    if (needsRehash(user.passwordHash)) {
      const upgraded = await hashPassword(password);
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: upgraded } });
      logger.info("Upgraded password hash parameters", { userId: user.id });
    }

    await createSession({
      userId: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
    });

    resetLimit(limitKey("login", email, ip));
    await recordAudit({ actorId: user.id, action: "auth.login", entity: "user", entityId: user.id });

    // Only ever an internal path — never an attacker-supplied absolute URL.
    destination = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  } catch (error) {
    return formError(toUserMessage(error, { action: "signIn" }));
  }

  redirect(destination);
}

export async function signOutAction(): Promise<void> {
  const user = await getCurrentUser();

  try {
    if (user) {
      await recordAudit({ actorId: user.id, action: "auth.logout", entity: "user", entityId: user.id });
    }
    await destroySession();
  } catch (error) {
    logger.error("Sign out failed", error);
  }

  redirect("/login");
}

export async function requestPasswordResetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseFormData(forgotPasswordSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  const { email } = parsed.data;

  // Identical response whether or not the address exists.
  const genericSuccess = formSuccess(
    "If that address belongs to an account, a reset link is on its way. Check your inbox — and your spam folder.",
  );

  try {
    const headerList = await headers();
    const limit = hit(
      limitKey("reset", email, clientIp(headerList)),
      LIMITS.passwordReset.limit,
      LIMITS.passwordReset.window,
    );
    if (!limit.ok) return genericSuccess;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, status: true },
    });

    if (!user || user.status === "DISABLED") return genericSuccess;

    const { token, expiresAt } = await issueToken(user.email, "PASSWORD_RESET");
    const resetUrl = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/reset-password?token=${token}`;

    await sendEmail({
      to: user.email,
      content: passwordResetEmail({
        name: user.name,
        resetUrl,
        expiresInMinutes: Math.round((expiresAt.getTime() - Date.now()) / 60_000),
      }),
    });

    await recordAudit({
      actorId: user.id,
      action: "auth.password_reset_requested",
      entity: "user",
      entityId: user.id,
    });
  } catch (error) {
    logger.error("Password reset request failed", error, { email });
    // Still generic — an internal failure must not reveal whether the user exists.
  }

  return genericSuccess;
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseFormData(resetPasswordSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  const { token, password } = parsed.data;

  try {
    const headerList = await headers();
    const limit = hit(
      limitKey("reset-submit", clientIp(headerList)),
      LIMITS.passwordResetSubmit.limit,
      LIMITS.passwordResetSubmit.window,
    );
    if (!limit.ok) return formError("Too many attempts. Please request a fresh reset link.");

    if (!isPasswordAcceptable(password)) {
      return formError("Choose a stronger password.", {
        password: "Use a longer passphrase, or mix in numbers and symbols.",
      });
    }

    const result = await consumeToken(token, "PASSWORD_RESET");
    if (!result.ok) {
      const messages: Record<typeof result.reason, string> = {
        invalid: "This reset link isn't valid. Request a new one to continue.",
        expired: "This reset link has expired. Request a new one to continue.",
        used: "This reset link has already been used. Request a new one if you still need it.",
      };
      return formError(messages[result.reason]);
    }

    const user = await prisma.user.findUnique({
      where: { email: result.identifier },
      select: { id: true, email: true },
    });
    if (!user) return formError("This reset link isn't valid. Request a new one to continue.");

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(password),
        // Completing a reset proves control of the mailbox.
        emailVerifiedAt: new Date(),
      },
    });

    // A password change invalidates every existing session — that's the whole
    // point if the reset was triggered by a suspected compromise.
    await revokeAllSessions(user.id);

    await recordAudit({
      actorId: user.id,
      action: "auth.password_reset",
      entity: "user",
      entityId: user.id,
    });

    return formSuccess("Your password has been updated. You can sign in now.");
  } catch (error) {
    return formError(toUserMessage(error, { action: "resetPassword" }));
  }
}

export async function changePasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseFormData(changePasswordSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  try {
    const actor = await requireUserAction();
    const { currentPassword, password } = parsed.data;

    const record = await prisma.user.findUnique({
      where: { id: actor.id },
      select: { passwordHash: true },
    });

    if (!record?.passwordHash) {
      return formError(
        "Your account signs in with Google. Use “Forgot password” to set a password first.",
      );
    }

    if (!(await verifyPassword(currentPassword, record.passwordHash))) {
      return formError("That's not your current password.", {
        currentPassword: "Incorrect password.",
      });
    }

    if (!isPasswordAcceptable(password)) {
      return formError("Choose a stronger password.", {
        password: "Use a longer passphrase, or mix in numbers and symbols.",
      });
    }

    await prisma.user.update({
      where: { id: actor.id },
      data: { passwordHash: await hashPassword(password) },
    });

    // Keep the current device signed in; drop every other one.
    await revokeAllSessions(actor.id, actor.sessionId);

    await recordAudit({
      actorId: actor.id,
      action: "auth.password_changed",
      entity: "user",
      entityId: actor.id,
    });

    return formSuccess("Password updated. Other devices have been signed out.");
  } catch (error) {
    return formError(toUserMessage(error, { action: "changePassword" }));
  }
}

export async function revokeOtherSessionsAction(): Promise<FormState> {
  try {
    const actor = await requireUserAction();
    await revokeAllSessions(actor.id, actor.sessionId);
    await recordAudit({
      actorId: actor.id,
      action: "auth.sessions_revoked",
      entity: "session",
      entityId: actor.id,
    });
    return formSuccess("Signed out everywhere else.");
  } catch (error) {
    return formError(toUserMessage(error, { action: "revokeOtherSessions" }));
  }
}

export async function revokeSessionAction(tokenId: string): Promise<FormState> {
  try {
    const actor = await requireUserAction();

    if (tokenId === actor.sessionId) {
      return formError("That's this device. Use “Sign out” instead.");
    }

    await revokeSession(actor.id, tokenId);
    await recordAudit({
      actorId: actor.id,
      action: "auth.sessions_revoked",
      entity: "session",
      entityId: tokenId,
    });
    return formSuccess("That device has been signed out.");
  } catch (error) {
    return formError(toUserMessage(error, { action: "revokeSession" }));
  }
}
