import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { TokenType } from "@/lib/constants/enums";

/**
 * Single-use tokens for password reset, email verification and invitations.
 *
 * Only a SHA-256 hash is persisted. A leaked database therefore yields no usable
 * reset links — the same reasoning as password hashing, applied to bearer tokens.
 * (Plain SHA-256 is correct here and not a shortcut: the token is 256 bits of
 * CSPRNG output, so there is no low-entropy guess space for a slow KDF to defend.)
 */

const DEFAULT_TTL_MINUTES: Record<TokenType, number> = {
  PASSWORD_RESET: 60,
  EMAIL_VERIFY: 60 * 24 * 3,
  INVITE: 60 * 24 * 7,
};

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export interface IssuedToken {
  /** The value that goes in the emailed link. Never stored. */
  token: string;
  expiresAt: Date;
}

/**
 * Issues a token, invalidating any outstanding token of the same type for the
 * same identifier so a second "forgot password" click can't leave two live links.
 */
export async function issueToken(
  identifier: string,
  type: TokenType,
  ttlMinutes = DEFAULT_TTL_MINUTES[type],
): Promise<IssuedToken> {
  const normalised = identifier.trim().toLowerCase();

  await prisma.verificationToken.updateMany({
    where: { identifier: normalised, type, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

  await prisma.verificationToken.create({
    data: { identifier: normalised, tokenHash: hashToken(token), type, expiresAt },
  });

  return { token, expiresAt };
}

export type TokenFailure = "invalid" | "expired" | "used";

export type TokenResult =
  | { ok: true; identifier: string }
  | { ok: false; reason: TokenFailure };

/**
 * Validates and burns a token in one step.
 *
 * The consume is a conditional `updateMany` on `consumedAt: null`, which makes it
 * atomic: two concurrent submissions of the same reset link produce exactly one
 * winner, with no read-then-write race.
 */
export async function consumeToken(raw: string, type: TokenType): Promise<TokenResult> {
  if (!raw || raw.length < 16) return { ok: false, reason: "invalid" };

  const record = await prisma.verificationToken.findUnique({
    where: { tokenHash: hashToken(raw) },
  });

  if (!record || record.type !== type) return { ok: false, reason: "invalid" };
  if (record.consumedAt) return { ok: false, reason: "used" };
  if (record.expiresAt < new Date()) return { ok: false, reason: "expired" };

  const claimed = await prisma.verificationToken.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  // Lost the race — another request already consumed it.
  if (claimed.count === 0) return { ok: false, reason: "used" };

  return { ok: true, identifier: record.identifier };
}

/** Checks a token without consuming it — used to render a reset form. */
export async function peekToken(raw: string, type: TokenType): Promise<TokenResult> {
  if (!raw || raw.length < 16) return { ok: false, reason: "invalid" };

  const record = await prisma.verificationToken.findUnique({
    where: { tokenHash: hashToken(raw) },
  });

  if (!record || record.type !== type) return { ok: false, reason: "invalid" };
  if (record.consumedAt) return { ok: false, reason: "used" };
  if (record.expiresAt < new Date()) return { ok: false, reason: "expired" };

  return { ok: true, identifier: record.identifier };
}

/** Housekeeping for the nightly cron. */
export async function pruneExpiredTokens(): Promise<number> {
  const { count } = await prisma.verificationToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { consumedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      ],
    },
  });
  return count;
}

/** Constant-time string compare for OAuth `state`. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
