import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { env, isProduction } from "@/lib/env";
import { errors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { asRole, asUserStatus, type Role, type UserStatus } from "@/lib/constants/enums";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  sessionCookieOptions,
  signSessionToken,
  verifySessionToken,
} from "@/lib/auth/jwt";

/**
 * Session lifecycle and the canonical "who is asking" lookup.
 *
 * Two-layer design:
 *   1. Edge middleware verifies the cookie's *signature* — cheap, no database,
 *      good enough to bounce anonymous traffic away from app routes.
 *   2. `getCurrentUser()` (Node runtime) additionally checks the Session row and
 *      the user's current status. That's the layer authorisation depends on, and
 *      it's why revoking a session or disabling an employee takes effect on the
 *      next request rather than at token expiry.
 *
 * Never authorise from the JWT claims alone.
 */

export interface SessionUser {
  id: string;
  employeeCode: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  avatarUrl: string | null;
  designation: string | null;
  theme: string;
  emailVerified: boolean;
  hasPassword: boolean;
  departmentId: string | null;
  departmentName: string | null;
  departmentColor: string | null;
  teamId: string | null;
  teamName: string | null;
  locationId: string | null;
  locationName: string | null;
  managerId: string | null;
  /** Session id, so "this device" can be highlighted in security settings. */
  sessionId: string;
}

/** Only refresh `lastSeenAt` this often — avoids a write on every request. */
const LAST_SEEN_THROTTLE_MS = 15 * 60 * 1000;

/**
 * Resolves the signed-in user, or null.
 *
 * Wrapped in React's `cache()` so a page that calls it from the layout, the page
 * and three components performs exactly one database round-trip per request.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifySessionToken(token);
  if (!claims) return null;

  const session = await prisma.session.findUnique({
    where: { tokenId: claims.jti },
    select: {
      id: true,
      tokenId: true,
      expiresAt: true,
      revokedAt: true,
      lastSeenAt: true,
      user: {
        select: {
          id: true,
          employeeCode: true,
          name: true,
          email: true,
          role: true,
          status: true,
          avatarUrl: true,
          designation: true,
          theme: true,
          emailVerifiedAt: true,
          passwordHash: true,
          departmentId: true,
          teamId: true,
          locationId: true,
          managerId: true,
          department: { select: { name: true, color: true } },
          team: { select: { name: true } },
          location: { select: { name: true } },
        },
      },
    },
  });

  // Unknown, revoked or expired session → treat as anonymous.
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;

  // A disabled employee is signed out immediately, even mid-session.
  if (asUserStatus(session.user.status) === "DISABLED") return null;

  // Fire-and-forget presence update; a failure here must not break the request.
  if (Date.now() - session.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    prisma.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch((error) => logger.warn("Failed to refresh session lastSeenAt", { error: String(error) }));
  }

  const { user } = session;

  return {
    id: user.id,
    employeeCode: user.employeeCode,
    name: user.name,
    email: user.email,
    role: asRole(user.role),
    status: asUserStatus(user.status),
    avatarUrl: user.avatarUrl,
    designation: user.designation,
    theme: user.theme,
    emailVerified: Boolean(user.emailVerifiedAt),
    hasPassword: Boolean(user.passwordHash),
    departmentId: user.departmentId,
    departmentName: user.department?.name ?? null,
    departmentColor: user.department?.color ?? null,
    teamId: user.teamId,
    teamName: user.team?.name ?? null,
    locationId: user.locationId,
    locationName: user.location?.name ?? null,
    managerId: user.managerId,
    sessionId: session.tokenId,
  };
});

/**
 * For pages: redirects to sign-in, preserving the intended destination.
 * Must only be called from a Server Component or route handler.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    const headerList = await headers();
    // `x-pathname` is set by middleware so we can bounce the user back after login.
    const path = headerList.get("x-pathname") ?? "/dashboard";
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }
  return user;
}

/** For server actions: throws a typed error instead of redirecting. */
export async function requireUserAction(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw errors.unauthenticated("Your session has expired. Please sign in again.");
  return user;
}

export async function requireRole(...allowed: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!allowed.includes(user.role)) {
    // A 403 page rather than a redirect loop — the user *is* signed in.
        redirect("/forbidden");
  }
  return user;
}

export async function requireRoleAction(...allowed: Role[]): Promise<SessionUser> {
  const user = await requireUserAction();
  if (!allowed.includes(user.role)) throw errors.forbidden();
  return user;
}

// ---------------------------------------------------------------------------
//  Mutations
// ---------------------------------------------------------------------------

interface CreateSessionOptions {
  userId: string;
  role: string;
  name: string;
  email: string;
}

/**
 * Issues a session: creates the Session row, signs a token pointing at it, and
 * sets the cookie. Also prunes this user's expired rows so the table doesn't
 * accumulate dead sessions.
 */
export async function createSession({ userId, role, name, email }: CreateSessionOptions) {
  const headerList = await headers();
  const tokenId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await prisma.session.create({
    data: {
      tokenId,
      userId,
      expiresAt,
      userAgent: headerList.get("user-agent")?.slice(0, 400) ?? null,
      ip: clientIp(headerList),
    },
  });

  const token = await signSessionToken({ sub: userId, jti: tokenId, role, name, email });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions(isProduction));

  await prisma.$transaction([
    prisma.session.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } }),
    prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } }),
  ]);

  return { tokenId, expiresAt };
}

/** Signs out the current device. */
export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) {
    const claims = await verifySessionToken(token);
    if (claims) {
      await prisma.session
        .updateMany({ where: { tokenId: claims.jti }, data: { revokedAt: new Date() } })
        .catch((error) => logger.warn("Failed to revoke session row", { error: String(error) }));
    }
  }

  store.delete(SESSION_COOKIE);
}

/**
 * Revokes every session for a user — used by "sign out everywhere", by password
 * changes, and when an admin disables an account.
 */
export async function revokeAllSessions(userId: string, exceptTokenId?: string) {
  await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptTokenId ? { tokenId: { not: exceptTokenId } } : {}),
    },
    data: { revokedAt: new Date() },
  });
}

export async function revokeSession(userId: string, tokenId: string) {
  await prisma.session.updateMany({
    where: { userId, tokenId },
    data: { revokedAt: new Date() },
  });
}

/** Active devices for the security settings screen. */
export async function listSessions(userId: string) {
  return prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      tokenId: true,
      userAgent: true,
      ip: true,
      createdAt: true,
      lastSeenAt: true,
    },
  });
}

// ---------------------------------------------------------------------------
//  Request context helpers
// ---------------------------------------------------------------------------

/** Best-effort client IP. Vercel sets `x-forwarded-for`; trust the first hop. */
export function clientIp(headerList: Headers): string | null {
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim().slice(0, 64);
  return headerList.get("x-real-ip")?.slice(0, 64) ?? null;
}

export async function requestContext() {
  const headerList = await headers();
  return {
    ip: clientIp(headerList),
    userAgent: headerList.get("user-agent")?.slice(0, 400) ?? null,
  };
}

/**
 * Origin check for route handlers that mutate state.
 *
 * Server Actions already get this from Next itself; this covers the hand-written
 * POST endpoints (e.g. notification mark-as-read) where the same guarantee has
 * to be asserted explicitly.
 */
export async function assertSameOrigin() {
  const headerList = await headers();
  const origin = headerList.get("origin");
  if (!origin) return; // Same-origin fetches may omit it; SameSite=Lax still applies.

  const expected = new URL(env.NEXT_PUBLIC_APP_URL).origin;
  const host = headerList.get("host");

  if (origin !== expected && origin !== `https://${host}` && origin !== `http://${host}`) {
    logger.warn("Rejected cross-origin mutation", { origin, host });
    throw errors.forbidden("Cross-origin request blocked.");
  }
}
