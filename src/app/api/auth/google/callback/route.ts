import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import {
  exchangeCodeForProfile,
  isDomainAllowed,
  OAUTH_NONCE_COOKIE,
  OAUTH_STATE_COOKIE,
  parseState,
} from "@/lib/auth/google";
import { safeEqual } from "@/lib/auth/tokens";
import { createSession } from "@/lib/auth/session";
import { recordAudit } from "@/lib/services/audit";

/**
 * Step 2 of the OAuth flow.
 *
 * Order matters here — every cheap rejection happens before we spend a network
 * round-trip on Google's token endpoint:
 *
 *   1. user denied consent            → bounce
 *   2. `state` missing or mismatched  → bounce (this is the CSRF check)
 *   3. exchange the code for a profile
 *   4. email must be verified by Google
 *   5. domain allow-list, if configured
 *   6. the address must already belong to an active employee
 *
 * Step 6 is the important one: OAuth sign-in never *creates* an account, so it
 * can't be used to self-provision access to the workspace.
 */
function bounce(request: NextRequest, error: string) {
  const response = NextResponse.redirect(new URL(`/login?error=${error}`, request.url));
  // The single-use secrets are spent either way.
  response.cookies.delete(OAUTH_STATE_COOKIE);
  response.cookies.delete(OAUTH_NONCE_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  if (params.get("error")) return bounce(request, "oauth_denied");

  const code = params.get("code");
  const rawState = params.get("state");
  const storedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;

  if (!code || !rawState || !storedState) return bounce(request, "oauth_state");

  const { state, next } = parseState(rawState);
  if (!safeEqual(state, storedState)) {
    logger.warn("OAuth state mismatch — possible CSRF attempt");
    return bounce(request, "oauth_state");
  }

  try {
    const profile = await exchangeCodeForProfile(code);

    if (!profile.emailVerified) return bounce(request, "oauth_unverified");
    if (!isDomainAllowed(profile.email)) return bounce(request, "oauth_domain");

    const user = await prisma.user.findUnique({
      where: { email: profile.email },
      select: { id: true, name: true, email: true, role: true, status: true, avatarUrl: true },
    });

    if (!user) return bounce(request, "oauth_no_account");
    if (user.status === "DISABLED") return bounce(request, "oauth_disabled");

    // Google is an authoritative source for both facts, so adopt them.
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
        avatarUrl: user.avatarUrl ?? profile.picture,
      },
    });

    await createSession({
      userId: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
    });

    await recordAudit({
      actorId: user.id,
      action: "auth.google_login",
      entity: "user",
      entityId: user.id,
    });

    const destination = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    const response = NextResponse.redirect(new URL(destination, request.url));
    response.cookies.delete(OAUTH_STATE_COOKIE);
    response.cookies.delete(OAUTH_NONCE_COOKIE);
    return response;
  } catch (error) {
    logger.error("Google OAuth callback failed", error);
    return bounce(request, "oauth_failed");
  }
}
