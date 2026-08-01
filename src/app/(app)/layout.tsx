import { cookies } from "next/headers";
import { Sidebar } from "@/components/layout/sidebar";
import { SIDEBAR_COOKIE } from "@/lib/constants/cookies";
import { MobileTabBar } from "@/components/layout/mobile-nav";
import { TopBar } from "@/components/layout/topbar";
import { requireUser } from "@/lib/auth/session";
import { getNavCounts } from "@/lib/services/shell";
import { getNotificationFeed } from "@/lib/services/notifications";

/**
 * Authenticated application shell.
 *
 * `requireUser()` here is the second authentication gate — middleware has already
 * verified the cookie signature at the edge, and this confirms the session row
 * and account status against the database. Every route under `(app)` therefore
 * inherits both checks without repeating them.
 *
 * Shell data (nav badge counts, the notification tray) is fetched once per
 * navigation and shared by the sidebar, top bar and mobile bar.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const [counts, feed, cookieStore] = await Promise.all([
    getNavCounts(user),
    getNotificationFeed(user.id),
    cookies(),
  ]);

  const collapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "collapsed";

  return (
    /**
     * `data-role` scopes the motion layer.
     *
     * The admin surfaces animate — a staggered reveal that makes worst-first ordering
     * legible, and a pulse on anything late. Employee surfaces deliberately do not: a
     * fitter opens this on a phone between jobs to mark a task done, and movement there is
     * friction dressed as polish. One attribute rather than a prop threaded through forty
     * components, so the two can never drift apart.
     */
    <div className="flex min-h-dvh" data-role={user.role}>
      <Sidebar role={user.role} counts={counts} initialCollapsed={collapsed} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar user={user} notifications={feed.items} unreadCount={feed.unread} />

        <main
          id="main-content"
          // Bottom padding clears the mobile tab bar; `max-w` keeps line lengths
          // readable on ultrawide displays instead of stretching tables edge to edge.
          className="mx-auto w-full max-w-[1560px] flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pb-12"
        >
          {children}
        </main>
      </div>

      <MobileTabBar role={user.role} counts={counts} />
    </div>
  );
}
