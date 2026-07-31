"use client";

import { useCallback, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils/cn";
import { useAnchor, type Align, type Placement } from "@/hooks/use-anchor";
import { useEscapeKey, useMounted, useOnClickOutside } from "@/hooks/use-dom";

/**
 * Anchored floating panel — the base for menus, filter pickers, the
 * notification tray and the profile menu.
 *
 * Split into a `usePopover()` hook (owns state + the props to spread onto the
 * trigger) and a `<PopoverPanel>` (owns the portal, positioning and dismissal).
 * Keeping them separate avoids `cloneElement` guesswork and means the trigger
 * always carries its own `aria-expanded`/`aria-controls`.
 */

export function usePopover({
  role = "dialog",
  defaultOpen = false,
}: { role?: "dialog" | "menu" | "listbox"; defaultOpen?: boolean } = {}) {
  const [open, setOpen] = useState(defaultOpen);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const id = useId();

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((value) => !value), []);

  return {
    open,
    setOpen,
    close,
    toggle,
    anchorRef,
    /** Spread onto the trigger button. */
    triggerProps: {
      ref: anchorRef,
      onClick: toggle,
      "aria-expanded": open,
      "aria-haspopup": role,
      "aria-controls": open ? id : undefined,
    } as const,
    /** Spread onto <PopoverPanel>. */
    panelProps: { id, anchorRef, open, onClose: close } as const,
  };
}

export interface PopoverPanelProps {
  id?: string;
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  placement?: Placement;
  align?: Align;
  offset?: number;
  matchWidth?: boolean;
  role?: "dialog" | "menu" | "listbox";
  "aria-label"?: string;
  className?: string;
  children: React.ReactNode;
  /** Disables the built-in padding for panels that manage their own layout. */
  bare?: boolean;
}

export function PopoverPanel({
  id,
  anchorRef,
  open,
  onClose,
  placement = "bottom",
  align = "start",
  offset = 6,
  matchWidth = false,
  role = "dialog",
  className,
  children,
  bare = false,
  ...aria
}: PopoverPanelProps) {
  const mounted = useMounted();
  const panelRef = useRef<HTMLDivElement | null>(null);

  const style = useAnchor(anchorRef, panelRef, open, { placement, align, offset, matchWidth });

  // The anchor is included so clicking the trigger doesn't close-then-reopen.
  useOnClickOutside([panelRef, anchorRef], onClose, open);
  useEscapeKey(onClose, open);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      ref={panelRef}
      id={id}
      role={role}
      aria-label={aria["aria-label"]}
      style={{
        ...(style ?? { position: "fixed", top: -9999, left: -9999 }),
        // Let the panel scroll internally rather than overflow the viewport.
        maxHeight: style?.maxHeight,
      }}
      className={cn(
        "z-50 overflow-y-auto overscroll-contain rounded-xl border border-border bg-surface shadow-pop",
        "animate-slide-down origin-top",
        !bare && "p-1.5",
        // Hide until positioned to avoid a one-frame flash in the corner.
        !style && "invisible",
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}
