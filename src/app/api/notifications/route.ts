import { NextResponse, type NextRequest } from "next/server";
import { assertSameOrigin, getCurrentUser } from "@/lib/auth/session";
import { getNotificationFeed, markNotificationsRead } from "@/lib/services/notifications";
import { logger } from "@/lib/logger";

/** Tray polling: the current feed plus the unread count. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  try {
    const feed = await getNotificationFeed(user.id);
    return NextResponse.json(feed, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    logger.error("Failed to load notification feed", error, { userId: user.id });
    return NextResponse.json({ items: [], unread: 0 });
  }
}

/**
 * Marks notifications read. Body: `{ ids: string[] }` or `{ all: true }`.
 *
 * Server Actions get Next's built-in origin check; a hand-written mutating
 * endpoint has to assert it explicitly, which `assertSameOrigin` does.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  try {
    await assertSameOrigin();

    const body = (await request.json().catch(() => ({}))) as {
      ids?: unknown;
      all?: unknown;
    };

    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id): id is string => typeof id === "string")
      : undefined;

    // `markNotificationsRead` scopes by userId, so foreign ids simply don't match.
    const count = await markNotificationsRead(user.id, {
      ids,
      all: body.all === true,
    });

    return NextResponse.json({ ok: true, count });
  } catch (error) {
    logger.error("Failed to mark notifications read", error, { userId: user.id });
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
