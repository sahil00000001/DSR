"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils/cn";
import { useAnchor, type Align, type Placement } from "@/hooks/use-anchor";
import { useMounted } from "@/hooks/use-dom";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement<{
    ref?: React.Ref<HTMLElement>;
    "aria-describedby"?: string;
  }>;
  placement?: Placement;
  align?: Align;
  /** Delay before showing, in ms. Keyboard focus shows immediately. */
  delay?: number;
  className?: string;
  /** Skip rendering entirely — handy for conditionally-labelled buttons. */
  disabled?: boolean;
}

/**
 * Tooltip.
 *
 * Shows on hover (after a short delay so sweeping the cursor across a toolbar
 * doesn't flash a trail of tips) and immediately on keyboard focus. The trigger
 * is wrapped in an inline-flex span that owns the listeners, so `children` is
 * never cloned and any element can be a trigger.
 *
 * Note: a tooltip is supplementary. Icon-only buttons must still carry their own
 * `aria-label` — this only adds `aria-describedby`.
 */
export function Tooltip({
  content,
  children,
  placement = "top",
  align = "center",
  delay = 350,
  className,
  disabled = false,
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const mounted = useMounted();
  const id = useId();

  const style = useAnchor(anchorRef, tipRef, open, { placement, align, offset: 8 });

  const openWithDelay = (immediate = false) => {
    window.clearTimeout(timerRef.current);
    if (immediate || delay <= 0) {
      setOpen(true);
      return;
    }
    timerRef.current = window.setTimeout(() => setOpen(true), delay);
  };

  const close = () => {
    window.clearTimeout(timerRef.current);
    setOpen(false);
  };

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  // Escape should dismiss a tooltip without dismissing its surrounding dialog.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (disabled || !content) return children;

  return (
    <>
      <span
        ref={anchorRef}
        className="inline-flex"
        onMouseEnter={() => openWithDelay()}
        onMouseLeave={close}
        onFocusCapture={() => openWithDelay(true)}
        onBlurCapture={close}
        aria-describedby={open ? id : undefined}
      >
        {children}
      </span>

      {mounted && open
        ? createPortal(
            <div
              ref={tipRef}
              id={id}
              role="tooltip"
              style={style ?? { position: "fixed", top: -9999, left: -9999 }}
              className={cn(
                "pointer-events-none z-[70] max-w-[16rem] rounded-lg bg-fg px-2.5 py-1.5",
                "text-[12px] leading-4 font-medium text-fg-inverted shadow-lg",
                "animate-fade-in",
                !style && "invisible",
                className,
              )}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
