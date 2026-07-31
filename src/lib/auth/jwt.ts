import { jwtVerify, SignJWT } from "jose";
import { BRAND, brandCookie } from "@/lib/constants/brand";

/**
 * Session token signing and verification.
 *
 * Kept free of any Node-only or app-level imports (no `env.ts`, no Prisma) so it
 * can run unchanged in Edge middleware, where the signature check happens on
 * every request without touching the database.
 *
 * The token is intentionally thin: identity plus the session id (`jti`). It is a
 * *pointer* to the Session row, not a cache of the user record — so disabling an
 * employee or revoking a device takes effect on the very next request instead of
 * whenever the token happens to expire.
 */

export const SESSION_COOKIE = brandCookie("session");
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

const ISSUER = BRAND.cookiePrefix;
const AUDIENCE = `${BRAND.cookiePrefix}:web`;
const ALGORITHM = "HS256";

export interface SessionClaims {
  /** User id. */
  sub: string;
  /** Session id — matches Session.tokenId. */
  jti: string;
  role: string;
  name: string;
  email: string;
}

let cachedKey: Uint8Array | null = null;

function secretKey(): Uint8Array {
  if (cachedKey) return cachedKey;

  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET is missing or too short (needs ≥ 32 characters). Sessions cannot be signed.",
    );
  }
  cachedKey = new TextEncoder().encode(secret);
  return cachedKey;
}

export async function signSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ role: claims.role, name: claims.name, email: claims.email })
    .setProtectedHeader({ alg: ALGORITHM, typ: "JWT" })
    .setSubject(claims.sub)
    .setJti(claims.jti)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

/**
 * Verifies signature, expiry, issuer and audience.
 * Returns null on any failure — callers treat that as "not signed in" and never
 * surface the underlying reason, which would leak token internals.
 */
export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: [ALGORITHM],
      // Reject tokens whose clock is meaningfully ahead of ours.
      clockTolerance: "5s",
    });

    if (
      typeof payload.sub !== "string" ||
      typeof payload.jti !== "string" ||
      typeof payload.role !== "string" ||
      typeof payload.name !== "string" ||
      typeof payload.email !== "string"
    ) {
      return null;
    }

    return {
      sub: payload.sub,
      jti: payload.jti,
      role: payload.role,
      name: payload.name,
      email: payload.email,
    };
  } catch {
    return null;
  }
}

/** Cookie attributes shared by every place that writes the session cookie. */
export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    // `lax` lets the cookie ride the OAuth redirect back from Google while still
    // blocking it on cross-site POSTs.
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
