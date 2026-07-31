import { NextResponse, type NextRequest } from "next/server";
import { isGoogleAuthEnabled, isProduction } from "@/lib/env";
import {
  buildGoogleAuthUrl,
  createOAuthSecrets,
  OAUTH_NONCE_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_TTL_SECONDS,
} from "@/lib/auth/google";
import { logger } from "@/lib/logger";

/**
 * Step 1 of the OAuth flow: mint the CSRF `state` + `nonce`, store them in
 * short-lived httpOnly cookies, and redirect to Google.
 *
 * Those cookies are what make the callback verifiable — without them anyone could
 * replay a callback URL. `sameSite: "lax"` is required rather than `strict`: the
 * browser arrives back at our callback from Google's domain, and a strict cookie
 * would not be sent on that navigation.
 */
export async function GET(request: NextRequest) {
  if (!isGoogleAuthEnabled) {
    return NextResponse.redirect(new URL("/login?error=oauth_failed", request.url));
  }

  const next = request.nextUrl.searchParams.get("next");
  // Never round-trip an absolute URL through the OAuth state.
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;

  const { state, nonce } = createOAuthSecrets();

  try {
    const response = NextResponse.redirect(buildGoogleAuthUrl({ state, nonce, next: safeNext }));

    const cookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: isProduction,
      path: "/",
      maxAge: OAUTH_TTL_SECONDS,
    };

    response.cookies.set(OAUTH_STATE_COOKIE, state, cookieOptions);
    response.cookies.set(OAUTH_NONCE_COOKIE, nonce, cookieOptions);

    return response;
  } catch (error) {
    logger.error("Failed to start Google OAuth", error);
    return NextResponse.redirect(new URL("/login?error=oauth_failed", request.url));
  }
}
