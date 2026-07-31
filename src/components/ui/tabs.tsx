"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { CountBadge } from "@/components/ui/badge";

/**
 * Underlined tab strip.
 *
 * Two flavours share one look:
 *   • `NavTabs`  — routes; each tab is a real link, so middle-click and
 *                  right-click work and the active tab is derived from the URL.
 *   • `Tabs`     — local state, with the full `role="tablist"` keyboard contract.
 */

const STRIP =
  "relative flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-border";

const TAB =
  "relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 pb-2.5 pt-1.5 text-[13px] " +
  "font-medium outline-none transition-colors duration-150 rounded-t-md " +
  "focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]";

const INDICATOR =
  "absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-accent";

export interface TabItem {
  href: string;
  label: string;
  count?: number;
  /** Also match nested routes (e.g. /employees/[id] highlights /employees). */
  exact?: boolean;
}

export function NavTabs({ items, className }: { items: TabItem[]; className?: string }) {
  const pathname = usePathname();

  return (
    <nav className={cn(STRIP, className)} aria-label="Section">
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(TAB, active ? "text-fg" : "text-fg-muted hover:text-fg")}
          >
            {item.label}
            {item.count !== undefined ? (
              <CountBadge count={item.count} tone={active ? "accent" : "neutral"} />
            ) : null}
            {active ? <span className={INDICATOR} aria-hidden="true" /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export interface TabsProps<T extends string> {
  tabs: Array<{ value: T; label: string; count?: number }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
  /** Accessible name for the tab list. */
  label: string;
}

export function Tabs<T extends string>({ tabs, value, onChange, className, label }: TabsProps<T>) {
  const onKeyDown = (event: React.KeyboardEvent) => {
    const index = tabs.findIndex((tab) => tab.value === value);
    if (index < 0) return;

    // Roving focus: arrows move between tabs, Home/End jump to the ends.
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : -1;

    if (next < 0) return;
    event.preventDefault();
    onChange(tabs[next]!.value);
  };

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className={cn(STRIP, className)}>
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            // Only the active tab is in the tab order; arrows move within.
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.value)}
            className={cn(TAB, active ? "text-fg" : "text-fg-muted hover:text-fg")}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <CountBadge count={tab.count} tone={active ? "accent" : "neutral"} />
            ) : null}
            {active ? <span className={INDICATOR} aria-hidden="true" /> : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Segmented control — a compact, enclosed switch for view modes
 * (list/board/calendar, week/month). Visually distinct from tabs on purpose:
 * tabs change *what* you're looking at, segments change *how*.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
  label,
}: {
  options: Array<{ value: T; label: React.ReactNode; icon?: React.ReactNode; title?: string }>;
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-muted p-0.5",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[6px] font-medium whitespace-nowrap transition-all duration-150",
              "outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]",
              size === "sm" ? "h-6 px-2 text-[12px]" : "h-7 px-2.5 text-[12.5px]",
              active
                ? "bg-surface text-fg shadow-xs"
                : "text-fg-muted hover:text-fg",
              "[&>svg]:size-3.5",
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
