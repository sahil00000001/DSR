"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { PopoverPanel, type PopoverPanelProps } from "@/components/ui/popover";

/**
 * Menu surface with full keyboard support: ↑/↓ to move, Home/End to jump,
 * type-ahead to filter, Enter/Space to activate, Escape to dismiss.
 *
 * Items are discovered from the DOM (`[data-menu-item]`) rather than from a
 * children registry, so composition with separators, labels and conditionally
 * rendered items works without any bookkeeping.
 */
export function DropdownMenu({
  className,
  children,
  ...props
}: Omit<PopoverPanelProps, "role">) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const typeaheadRef = useRef({ query: "", timer: 0 });

  const items = useCallback(
    () =>
      Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>("[data-menu-item]:not([data-disabled])") ??
          [],
      ),
    [],
  );

  // Focus the first item when the menu opens so ↓ isn't required to start.
  useEffect(() => {
    if (!props.open) return;
    const timer = window.setTimeout(() => {
      const [first] = items();
      first?.focus({ preventScroll: true });
    }, 10);
    return () => window.clearTimeout(timer);
  }, [props.open, items]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const list = items();
    if (list.length === 0) return;

    const index = list.indexOf(document.activeElement as HTMLElement);

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        list[(index + 1) % list.length]?.focus();
        return;
      case "ArrowUp":
        event.preventDefault();
        list[index <= 0 ? list.length - 1 : index - 1]?.focus();
        return;
      case "Home":
        event.preventDefault();
        list[0]?.focus();
        return;
      case "End":
        event.preventDefault();
        list[list.length - 1]?.focus();
        return;
      case "Tab":
        // Tab commits and dismisses, matching platform menu behaviour.
        props.onClose();
        return;
      default:
        break;
    }

    // Type-ahead: accumulate printable characters for 600ms.
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const state = typeaheadRef.current;
      window.clearTimeout(state.timer);
      state.query += event.key.toLowerCase();
      state.timer = window.setTimeout(() => {
        state.query = "";
      }, 600);

      const match = list.find((item) =>
        (item.textContent ?? "").trim().toLowerCase().startsWith(state.query),
      );
      match?.focus();
    }
  };

  return (
    <PopoverPanel role="menu" className={cn("min-w-[196px]", className)} {...props}>
      <div ref={menuRef} onKeyDown={onKeyDown} className="flex flex-col">
        {children}
      </div>
    </PopoverPanel>
  );
}

const ITEM_BASE =
  "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13px] " +
  "text-fg outline-none transition-colors duration-100 " +
  "hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:text-fg " +
  "data-disabled:pointer-events-none data-disabled:opacity-45 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-fg-subtle";

interface MenuItemProps extends Omit<React.ComponentPropsWithRef<"button">, "type"> {
  tone?: "default" | "danger";
  /** Right-aligned hint — shortcut key or secondary value. */
  hint?: React.ReactNode;
  /** Renders a leading tick; use for single-select menus. */
  selected?: boolean;
}

export function MenuItem({
  tone = "default",
  hint,
  selected,
  className,
  children,
  disabled,
  ...props
}: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      data-menu-item=""
      data-disabled={disabled ? "" : undefined}
      disabled={disabled}
      tabIndex={-1}
      className={cn(
        ITEM_BASE,
        tone === "danger" && "text-danger-text hover:bg-danger-soft focus-visible:bg-danger-soft [&>svg]:text-danger",
        className,
      )}
      {...props}
    >
      {selected !== undefined ? (
        <Check className={cn("size-3.5", !selected && "invisible")} aria-hidden="true" />
      ) : null}
      <span className="flex min-w-0 flex-1 items-center gap-2.5 truncate">{children}</span>
      {hint ? <span className="ml-auto shrink-0 text-[11px] text-fg-subtle">{hint}</span> : null}
    </button>
  );
}

export function MenuLink({
  className,
  children,
  ...props
}: React.ComponentPropsWithRef<typeof Link>) {
  return (
    <Link role="menuitem" data-menu-item="" tabIndex={-1} className={cn(ITEM_BASE, className)} {...props}>
      {children}
    </Link>
  );
}

export function MenuLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "px-2.5 pt-2 pb-1 text-[10.5px] font-semibold tracking-wider text-fg-subtle uppercase",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function MenuSeparator({ className }: { className?: string }) {
  return <div role="separator" className={cn("-mx-1.5 my-1.5 h-px bg-border", className)} />;
}

/** Non-interactive header block, e.g. the signed-in identity in the user menu. */
export function MenuHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("-mx-1.5 -mt-1.5 mb-1.5 border-b border-border px-3.5 py-3", className)}>
      {children}
    </div>
  );
}
