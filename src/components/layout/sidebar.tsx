"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { CountBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { BrandLockup } from "@/components/layout/brand";
import {
  isNavItemActive,
  navFor,
  type BadgeKey,
  type NavItem,
} from "@/components/layout/nav-config";
import type { Role } from "@/lib/constants/enums";

export const SIDEBAR_COOKIE = "cadence_sidebar";

export type NavCounts = Partial<Record<BadgeKey, number>>;

interface SidebarProps {
  role: Role;
  counts: NavCounts;
  initialCollapsed?: boolean;
}

/**
 * Desktop sidebar.
 *
 * The collapsed state is persisted in a cookie rather than localStorage so the
 * server renders the correct width on the first paint — with localStorage the
 * sidebar would visibly snap from 250px to 68px after hydration on every load.
 */
export function Sidebar({ role, counts, initialCollapsed = false }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const pathname = usePathname();
  const sections = navFor(role);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"};path=/;max-age=${
      60 * 60 * 24 * 365
    };SameSite=Lax`;
  };

  return (
    <aside
      data-app-sidebar=""
      aria-label="Main navigation"
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface lg:flex",
        "transition-[width] duration-200 ease-[var(--ease-out-quart)]",
        collapsed ? "w-[68px]" : "w-[252px]",
      )}
    >
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-border",
          collapsed ? "justify-center px-2" : "justify-between px-4",
        )}
      >
        <BrandLockup collapsed={collapsed} />
        {!collapsed ? (
          <Tooltip content="Collapse sidebar" placement="right">
            <button
              type="button"
              onClick={toggle}
              aria-label="Collapse sidebar"
              className="grid size-7 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
            >
              <PanelLeftClose className="size-4" />
            </button>
          </Tooltip>
        ) : null}
      </div>

      <div className={cn("shrink-0 py-3", collapsed ? "px-2" : "px-3")}>
        {collapsed ? (
          <Tooltip content="Write today's report" placement="right">
            <ButtonLink variant="primary" size="icon" href="/dsr/new" aria-label="Write today's report">
              <Plus className="size-4" />
            </ButtonLink>
          </Tooltip>
        ) : (
          <ButtonLink variant="primary" href="/dsr/new" block size="sm" className="justify-center">
            <Plus className="size-4" />
            Write today&apos;s report
          </ButtonLink>
        )}
      </div>

      <nav
        className={cn("min-h-0 flex-1 overflow-y-auto pb-4", collapsed ? "px-2" : "px-3")}
        aria-label="Sections"
      >
        {sections.map((section, index) => (
          <div key={section.label ?? `section-${index}`} className={index > 0 ? "mt-5" : undefined}>
            {section.label && !collapsed ? (
              <h2 className="mb-1.5 px-2.5 text-[10.5px] font-semibold tracking-[0.08em] text-fg-subtle uppercase">
                {section.label}
              </h2>
            ) : null}
            {section.label && collapsed ? (
              <div className="mx-2 mb-2 h-px bg-border" role="presentation" />
            ) : null}

            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.href}>
                  <SidebarLink
                    item={item}
                    active={isNavItemActive(item, pathname)}
                    collapsed={collapsed}
                    count={item.badge ? counts[item.badge] : undefined}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {collapsed ? (
        <div className="shrink-0 border-t border-border p-2">
          <Tooltip content="Expand sidebar" placement="right">
            <button
              type="button"
              onClick={toggle}
              aria-label="Expand sidebar"
              className="grid size-9 w-full place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
            >
              <PanelLeftOpen className="size-4" />
            </button>
          </Tooltip>
        </div>
      ) : null}
    </aside>
  );
}

function SidebarLink({
  item,
  active,
  collapsed,
  count,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  count?: number;
}) {
  const Icon = item.icon;

  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center rounded-lg text-[13px] font-medium outline-none transition-colors duration-150",
        "focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]",
        collapsed ? "h-9 justify-center" : "h-9 gap-2.5 px-2.5",
        active
          ? "bg-accent-soft text-accent"
          : "text-fg-muted hover:bg-surface-hover hover:text-fg",
      )}
    >
      {/* Left rail marker: reinforces the active item beyond colour alone. */}
      {active ? (
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-1/2 h-4 w-[2.5px] -translate-y-1/2 rounded-r-full bg-accent",
            collapsed ? "-left-2" : "-left-3",
          )}
        />
      ) : null}

      <Icon className={cn("size-[17px] shrink-0", active ? "text-accent" : "text-fg-subtle group-hover:text-fg-muted")} />

      {!collapsed ? (
        <>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {count ? <CountBadge count={count} tone={active ? "accent" : "neutral"} /> : null}
        </>
      ) : count ? (
        // Collapsed: a dot is all there's room for, so the tooltip carries the number.
        <span
          aria-hidden="true"
          className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-accent ring-2 ring-surface"
        />
      ) : null}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip content={count ? `${item.label} · ${count}` : item.label} placement="right" delay={200}>
      {link}
    </Tooltip>
  );
}
