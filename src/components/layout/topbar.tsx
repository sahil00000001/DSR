import { Plus } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { BrandLockup } from "@/components/layout/brand";
import { CommandPalette } from "@/components/layout/command-palette";
import { NotificationMenu, type NotificationItem } from "@/components/layout/notification-menu";
import { UserMenu } from "@/components/layout/user-menu";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Top bar.
 *
 * A server component that composes the interactive islands, so the shell's
 * markup is streamed with the page and only the palette, tray and menus ship
 * JavaScript. Frosted (`glass`) and sticky, which keeps search and notifications
 * reachable while long report lists scroll underneath.
 */
export function TopBar({
  user,
  notifications,
  unreadCount,
}: {
  user: SessionUser;
  notifications: NotificationItem[];
  unreadCount: number;
}) {
  return (
    <header
      data-app-topbar=""
      className="glass sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:gap-3 sm:px-5"
    >
      {/* The sidebar carries the brand on desktop; on mobile it lives here. */}
      <div className="lg:hidden">
        <BrandLockup collapsed />
      </div>

      <div className="flex min-w-0 flex-1 items-center">
        <CommandPalette role={user.role} />
      </div>

      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        <ButtonLink
          href="/dsr/new"
          variant="primary"
          size="sm"
          className="hidden md:inline-flex lg:hidden xl:hidden"
        >
          <Plus className="size-4" />
          New report
        </ButtonLink>

        <ThemeToggle />
        <NotificationMenu initialItems={notifications} initialUnread={unreadCount} />

        <div className="mx-1 hidden h-6 w-px bg-border sm:block" role="presentation" />

        <UserMenu
          user={{
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            avatarUrl: user.avatarUrl,
            employeeCode: user.employeeCode,
            departmentName: user.departmentName,
          }}
        />
      </div>
    </header>
  );
}
