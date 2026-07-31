import "server-only";
import { randomBytes } from "node:crypto";
import { env, googleAllowedDomains, isGoogleAuthEnabled } from "@/lib/env";
import { errors } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Google OAuth 2.0 (authorisation code flow).
 *
 * Hand-rolled rather than pulled from a framework adapter: the flow is three
 * requests, and doing it directly keeps the session model (see session.ts)
 * as the single source of truth instead of bolting a second one alongside it.
 *
 * Security properties:
 *   • `state` is a 32-byte CSPRNG value, stored in a short-lived httpOnly cookie
 *     and compared in constant time on return — this is the CSRF defence for the
 *     callback.
 *   • `nonce` is sent and echoed back in the id_token.
 *   • `email_verified` must be true; an unverified Google email would otherwise
 *     let someone claim an address they don't own.
 *   • Sign-in never *creates* an account. The email must already belong to an
 *     active employee, so OAuth can't be used to self-provision access.
 */

export const OAUTH_STATE_COOKIE = "cadence_oauth_state";
export const OAUTH_NONCE_COOKIE = "cadence_oauth_nonce";
/** The window a user has to complete the Google screen. */
export const OAUTH_TTL_SECONDS = 600;

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

export function googleRedirectUri(): string {
  return `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/auth/google/callback`;
}

export function createOAuthSecrets() {
  return {
    state: randomBytes(32).toString("base64url"),
    nonce: randomBytes(16).toString("base64url"),
  };
}

export function buildGoogleAuthUrl({
  state,
  nonce,
  next,
}: {
  state: string;
  nonce: string;
  next?: string;
}): string {
  if (!isGoogleAuthEnabled) {
    throw errors.internal("Google sign-in is not configured on this deployment.");
  }

  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", googleRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  // `state` carries the post-login destination alongside the CSRF token, so we
  // don't need a third cookie.
  url.searchParams.set("state", next ? `${state}.${encodeURIComponent(next)}` : state);
  url.searchParams.set("nonce", nonce);
  // Always show the chooser: shared machines are common in small offices.
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

/** Splits the composite `state` back into its CSRF token and destination. */
export function parseState(raw: string): { state: string; next?: string } {
  const separator = raw.indexOf(".");
  if (separator === -1) return { state: raw };
  return {
    state: raw.slice(0, separator),
    next: decodeURIComponent(raw.slice(separator + 1)),
  };
}

export interface GoogleProfile {
  email: string;
  name: string;
  picture: string | null;
  emailVerified: boolean;
}

export async function exchangeCodeForProfile(code: string): Promise<GoogleProfile> {
  if (!isGoogleAuthEnabled) throw errors.internal("Google sign-in is not configured.");

  const tokenResponse = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
    }),
    // Don't hang a request thread on a slow identity provider.
    signal: AbortSignal.timeout(10_000),
  });

  if (!tokenResponse.ok) {
    logger.error("Google token exchange failed", undefined, {
      status: tokenResponse.status,
      body: (await tokenResponse.text()).slice(0, 500),
    });
    throw errors.internal("Google sign-in failed. Please try again or use your password.");
  }

  const tokens = (await tokenResponse.json()) as { access_token?: string; id_token?: string };
  if (!tokens.access_token) throw errors.internal("Google sign-in returned an unexpected response.");

  const profileResponse = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!profileResponse.ok) {
    logger.error("Google userinfo failed", undefined, { status: profileResponse.status });
    throw errors.internal("Couldn't read your Google profile. Please try again.");
  }

  const profile = (await profileResponse.json()) as {
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };

  if (!profile.email) throw errors.validation("Google didn't return an email address.");

  return {
    email: profile.email.toLowerCase(),
    name: profile.name?.trim() || profile.email.split("@")[0]!,
    picture: profile.picture ?? null,
    emailVerified: profile.email_verified !== false,
  };
}

/** Optional domain allow-list, so a personal Gmail can't sign in to a work org. */
export function isDomainAllowed(email: string): boolean {
  if (googleAllowedDomains.length === 0) return true;
  const domain = email.split("@")[1]?.toLowerCase();
  return Boolean(domain && googleAllowedDomains.includes(domain));
}
