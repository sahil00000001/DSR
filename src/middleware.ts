import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/jwt";

/**
 * Edge middleware — the first authentication gate.
 *
 * Runs before any page renders and only verifies the session cookie's
 * *signature*. That's cheap and database-free, which is exactly what belongs at
 * the edge: it turns "anonymous user hits /dashboard" into a redirect instead of
 * a wasted render.
 *
 * It is NOT the authorisation boundary. Role checks and session revocation live
 * in `getCurrentUser()` on the Node runtime, because they need the database.
 * A valid signature here means "plausibly signed in", nothing more.
 */

/** Routes reachable without a session. */
const PUBLIC_PATHS = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/api/auth/google",
  "/api/health",
  "/api/cron",
];

/** Signed-in users are bounced away from these. */
const AUTH_PATHS = ["/login", "/forgot-password", "/reset-password"];

function isMatch(pathname: string, paths: string[]): boolean {
  return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const claims = token ? await verifySessionToken(token) : null;
  const isAuthenticated = Boolean(claims);

  // Expose the current path to Server Components so `requireUser()` can build an
  // accurate `?next=` when it needs to redirect.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  // Already signed in and heading for the sign-in screen → go to the app.
  if (isAuthenticated && isMatch(pathname, AUTH_PATHS)) {
    const next = request.nextUrl.searchParams.get("next");
    const destination = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    return NextResponse.redirect(new URL(destination, request.url));
  }

  if (!isAuthenticated && !isMatch(pathname, PUBLIC_PATHS)) {
    const loginUrl = new URL("/login", request.url);
    // Preserve the destination, but only ever a same-site path.
    if (pathname !== "/" && pathname !== "/dashboard") {
      loginUrl.searchParams.set("next", `${pathname}${search}`);
    }

    const response = NextResponse.redirect(loginUrl);
    // Clear a cookie that failed verification so the browser stops resending it.
    if (token) response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  /**
   * Skip static assets, the image optimiser and the PWA files.
   *
   * `offline.html` must be excluded specifically: the service worker precaches it
   * during install, and a 307 to /login would be cached in its place — so the
   * offline fallback would redirect instead of rendering, exactly when there's no
   * network to follow the redirect.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw\\.js|offline\\.html|icons/|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)",
  ],
};
