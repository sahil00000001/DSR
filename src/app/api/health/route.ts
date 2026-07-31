import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { isSmtpEnabled, isGoogleAuthEnabled } from "@/lib/env";

/**
 * Health probe for uptime monitoring and post-deploy verification.
 *
 * Public by design (it's in middleware's `PUBLIC_PATHS`) and therefore reports
 * *liveness*, not internals: whether the database answers and which optional
 * integrations are configured. No versions, hostnames, connection strings or row
 * counts — an unauthenticated endpoint should never help someone fingerprint the
 * deployment.
 *
 * Returns 503 when the database is unreachable so a load balancer can act on it.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();

  try {
    // The cheapest possible round trip that proves the connection works.
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        status: "ok",
        database: "connected",
        latencyMs: Date.now() - startedAt,
        integrations: { email: isSmtpEnabled, googleOAuth: isGoogleAuthEnabled },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    // Deliberately no error detail — see the note above.
    return NextResponse.json(
      { status: "degraded", database: "unreachable", latencyMs: Date.now() - startedAt },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
