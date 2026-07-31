"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { useEscapeKey, useFocusTrap, useLockBodyScroll, useMounted } from "@/hooks/use-dom";

const SIZES = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
  "2xl": "max-w-4xl",
  full: "max-w-[min(96rem,calc(100vw-2rem))]",
} as const;

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: keyof typeof SIZES;
  /** Hides the ✕ — for flows that must be completed or explicitly cancelled. */
  hideClose?: boolean;
  /** Blocks backdrop-click dismissal (used while a submission is in flight). */
  dismissible?: boolean;
  className?: string;
  /** Removes body padding for dialogs that render their own full-bleed content. */
  bare?: boolean;
}

/**
 * Modal dialog.
 *
 * Handles the full accessibility contract: `role="dialog"` + `aria-modal`,
 * labelled by its own title, focus moved in on open and restored on close, Tab
 * trapped inside, Escape to dismiss, and background scroll locked without the
 * page shifting. Exit is animated by keeping the node mounted for the duration
 * of the transition.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  hideClose = false,
  dismissible = true,
  className,
  bare = false,
}: DialogProps) {
  const mounted = useMounted();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useRef(`dialog-title-${Math.random().toString(36).slice(2, 9)}`).current;
  const descriptionId = `${titleId}-description`;

  // Keep rendering briefly after `open` flips to false so the exit animation
  // can play; `visible` drives the animation classes.
  const [present, setPresent] = useState(open);
  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    const timer = window.setTimeout(() => setPresent(false), 140);
    return () => window.clearTimeout(timer);
  }, [open]);

  useLockBodyScroll(present);
  useFocusTrap(panelRef, open);
  useEscapeKey(() => dismissible && onClose(), open);

  if (!mounted || !present) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="presentation">
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={() => dismissible && onClose()}
        className={cn(
          "absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-150",
          open ? "opacity-100" : "opacity-0",
        )}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden bg-surface shadow-pop",
          // Mobile: bottom sheet. Desktop: centred card.
          "rounded-t-2xl sm:max-h-[min(85dvh,52rem)] sm:rounded-2xl",
          "border border-border sm:mx-4",
          SIZES[size],
          open
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-3 scale-[0.98] opacity-0 sm:translate-y-0",
          "transition-[opacity,transform] duration-150 ease-[var(--ease-out-quart)]",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4 sm:px-6">
          <div className="min-w-0 space-y-1">
            <h2 id={titleId} className="text-base leading-6 font-semibold text-fg">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="text-[13px] leading-5 text-fg-muted">
                {description}
              </p>
            ) : null}
          </div>
          {!hideClose ? (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label="Close dialog"
              className="-mt-1 -mr-1.5 shrink-0"
            >
              <X className="size-4" />
            </Button>
          ) : null}
        </div>

        {children ? (
          <div className={cn("min-h-0 flex-1 overflow-y-auto", !bare && "px-5 pb-5 sm:px-6")}>
            {children}
          </div>
        ) : null}

        {footer ? (
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-surface-inset px-5 py-3.5 sm:flex-row sm:items-center sm:justify-end sm:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Slide-over panel. Same accessibility contract as Dialog but anchored to an
 * edge — used for mobile navigation and the DSR detail view on narrow screens.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  side = "right",
  className,
  hideHeader = false,
}: Omit<DialogProps, "size" | "bare"> & { side?: "left" | "right" | "bottom"; hideHeader?: boolean }) {
  const mounted = useMounted();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useRef(`sheet-title-${Math.random().toString(36).slice(2, 9)}`).current;

  const [present, setPresent] = useState(open);
  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    const timer = window.setTimeout(() => setPresent(false), 200);
    return () => window.clearTimeout(timer);
  }, [open]);

  useLockBodyScroll(present);
  useFocusTrap(panelRef, open);
  useEscapeKey(onClose, open);

  if (!mounted || !present) return null;

  const closedTransform =
    side === "left" ? "-translate-x-full" : side === "right" ? "translate-x-full" : "translate-y-full";

  return createPortal(
    <div className="fixed inset-0 z-50" role="presentation">
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "absolute flex flex-col border-border bg-surface shadow-pop",
          "transition-transform duration-200 ease-[var(--ease-out-quart)]",
          side === "left" && "inset-y-0 left-0 w-[min(20rem,86vw)] border-r",
          side === "right" && "inset-y-0 right-0 w-[min(30rem,92vw)] border-l",
          side === "bottom" && "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-2xl border-t",
          open ? "translate-x-0 translate-y-0" : closedTransform,
          className,
        )}
      >
        {!hideHeader ? (
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0 space-y-0.5">
              <h2 id={titleId} className="text-[15px] leading-6 font-semibold text-fg">
                {title}
              </h2>
              {description ? <p className="text-[13px] text-fg-muted">{description}</p> : null}
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label="Close panel"
              className="-mt-1 -mr-1.5 shrink-0"
            >
              <X className="size-4" />
            </Button>
          </div>
        ) : (
          <h2 id={titleId} className="sr-only">
            {title}
          </h2>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

        {footer ? (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-surface-inset px-5 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
