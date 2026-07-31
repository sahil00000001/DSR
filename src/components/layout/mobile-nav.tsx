"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal, Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Sheet } from "@/components/ui/dialog";
import { CountBadge } from "@/components/ui/badge";
import { BrandLockup } from "@/components/layout/brand";
import {
  isNavItemActive,
  mobileTabsFor,
  navFor,
  type NavItem,
} from "@/components/layout/nav-config";
import type { NavCounts } from "@/components/layout/sidebar";
import type { Role } from "@/lib/constants/enums";

/**
 * Mobile navigation.
 *
 * Two complementary pieces:
 *   • a bottom tab bar with the four things people do daily, thumb-reachable;
 *   • a "More" drawer holding the full menu.
 *
 * The bar sits above the iOS home indicator via `env(safe-area-inset-bottom)`,
 * and the app shell reserves matching padding so content is never hidden behind it.
 */
export function MobileTabBar({ role, counts }: { role: Role; counts: NavCounts }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const tabs = mobileTabsFor(role);

  // Any navigation closes the drawer — otherwise it lingers over the new page.
  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <>
      <nav
        data-app-nav=""
        aria-label="Main navigation"
        className="glass fixed inset-x-0 bottom-0 z-30 border-t lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="flex items-stretch">
          {tabs.map((item) => (
            <li key={item.href} className="flex-1">
              <TabLink
                item={item}
                active={isNavItemActive(item, pathname)}
                count={item.badge ? counts[item.badge] : undefined}
              />
            </li>
          ))}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-expanded={menuOpen}
              className={cn(
                "flex h-full w-full flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                menuOpen ? "text-accent" : "text-fg-subtle",
              )}
            >
              <MoreHorizontal className="size-[19px]" />
              More
            </button>
          </li>
        </ul>
      </nav>

      <Sheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        side="left"
        title="Menu"
        hideHeader
      >
        <div className="flex h-14 items-center border-b border-border px-4">
          <BrandLockup />
        </div>

        <div className="p-3">
          <Link
            href="/dsr/new"
            className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-accent text-[13px] font-medium text-accent-fg shadow-xs"
          >
            <Plus className="size-4" />
            Write today&apos;s report
          </Link>
        </div>

        <nav className="px-3 pb-8" aria-label="All sections">
          {navFor(role).map((section, index) => (
            <div key={section.label ?? `section-${index}`} className={index > 0 ? "mt-5" : undefined}>
              {section.label ? (
                <h2 className="mb-1.5 px-2.5 text-[10.5px] font-semibold tracking-[0.08em] text-fg-subtle uppercase">
                  {section.label}
                </h2>
              ) : null}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isNavItemActive(item, pathname);
                  const Icon = item.icon;
                  const count = item.badge ? counts[item.badge] : undefined;

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex h-10 items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition-colors",
                          active
                            ? "bg-accent-soft text-accent"
                            : "text-fg-muted active:bg-surface-hover",
                        )}
                      >
                        <Icon
                          className={cn("size-[18px] shrink-0", active ? "text-accent" : "text-fg-subtle")}
                        />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {count ? (
                          <CountBadge count={count} tone={active ? "accent" : "neutral"} />
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </Sheet>
    </>
  );
}

function TabLink({
  item,
  active,
  count,
}: {
  item: NavItem;
  active: boolean;
  count?: number;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-full w-full flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
        active ? "text-accent" : "text-fg-subtle",
      )}
    >
      <span className="relative">
        <Icon className="size-[19px]" />
        {count ? (
          <span className="absolute -top-1 -right-1.5">
            <CountBadge count={count} tone="accent" className="h-[15px] min-w-[15px] text-[9px]" />
          </span>
        ) : null}
      </span>
      {item.label}
      {active ? (
        <span
          aria-hidden="true"
          className="absolute top-0 h-[2px] w-7 rounded-b-full bg-accent"
        />
      ) : null}
    </Link>
  );
}
