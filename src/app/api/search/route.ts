import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { globalSearch } from "@/lib/services/search";
import { hit, limitKey } from "@/lib/auth/rate-limit";
import { logger } from "@/lib/logger";

/**
 * Search endpoint for the command palette.
 *
 * A route handler rather than a server action because the client needs to *cancel*
 * superseded requests as the user keeps typing — `AbortController` works against
 * fetch, not against an action call.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  // Keystroke-rate endpoint: bound it so a stuck client can't spin the database.
  const limit = hit(limitKey("search", user.id), 120, 60);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Slow down a little." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const query = request.nextUrl.searchParams.get("q") ?? "";

  try {
    const results = await globalSearch(query.slice(0, 120), user);
    return NextResponse.json(results, {
      // Private: results are scoped to the caller and must never be shared cache.
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    logger.error("Global search failed", error, { userId: user.id });
    return NextResponse.json({ error: "Search is unavailable right now." }, { status: 500 });
  }
}
