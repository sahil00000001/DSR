"use client";

import { useCallback, useEffect, useState } from "react";

export type Placement = "bottom" | "top" | "left" | "right";
export type Align = "start" | "center" | "end";

interface AnchorOptions {
  placement?: Placement;
  align?: Align;
  /** Gap between anchor and floating element, in px. */
  offset?: number;
  /** Match the floating element's width to the anchor (used by selects). */
  matchWidth?: boolean;
}

export interface AnchorStyle {
  position: "fixed";
  top: number;
  left: number;
  minWidth?: number;
  /** Available height below/above — lets the panel cap its own scroll area. */
  maxHeight?: number;
}

const VIEWPORT_PADDING = 8;

/**
 * Positions a floating element against an anchor using fixed coordinates.
 *
 * A deliberately small alternative to a full positioning engine: it handles the
 * two cases this product needs — flip when there isn't room on the preferred
 * side, and clamp so the panel never leaves the viewport. Recomputes on scroll
 * and resize while open.
 */
export function useAnchor(
  anchorRef: React.RefObject<HTMLElement | null>,
  floatingRef: React.RefObject<HTMLElement | null>,
  open: boolean,
  { placement = "bottom", align = "start", offset = 6, matchWidth = false }: AnchorOptions = {},
) {
  const [style, setStyle] = useState<AnchorStyle | null>(null);

  const compute = useCallback(() => {
    const anchor = anchorRef.current;
    const floating = floatingRef.current;
    if (!anchor || !floating) return;

    const a = anchor.getBoundingClientRect();
    const f = floating.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const spaceBelow = vh - a.bottom - offset - VIEWPORT_PADDING;
    const spaceAbove = a.top - offset - VIEWPORT_PADDING;

    let resolved: Placement = placement;
    if (placement === "bottom" && f.height > spaceBelow && spaceAbove > spaceBelow) {
      resolved = "top";
    } else if (placement === "top" && f.height > spaceAbove && spaceBelow > spaceAbove) {
      resolved = "bottom";
    }

    let top: number;
    let left: number;

    if (resolved === "top" || resolved === "bottom") {
      top = resolved === "bottom" ? a.bottom + offset : a.top - f.height - offset;
      left =
        align === "start"
          ? a.left
          : align === "end"
            ? a.right - f.width
            : a.left + a.width / 2 - f.width / 2;
    } else {
      left = resolved === "right" ? a.right + offset : a.left - f.width - offset;
      top =
        align === "start"
          ? a.top
          : align === "end"
            ? a.bottom - f.height
            : a.top + a.height / 2 - f.height / 2;
    }

    // Keep the panel fully on screen.
    left = Math.min(Math.max(VIEWPORT_PADDING, left), Math.max(VIEWPORT_PADDING, vw - f.width - VIEWPORT_PADDING));
    top = Math.min(Math.max(VIEWPORT_PADDING, top), Math.max(VIEWPORT_PADDING, vh - f.height - VIEWPORT_PADDING));

    setStyle({
      position: "fixed",
      top: Math.round(top),
      left: Math.round(left),
      minWidth: matchWidth ? Math.round(a.width) : undefined,
      maxHeight: Math.round(
        resolved === "top" ? Math.max(spaceAbove, 160) : Math.max(spaceBelow, 160),
      ),
    });
  }, [anchorRef, floatingRef, placement, align, offset, matchWidth]);

  useEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }

    // Two passes: the first gives the panel a size, the second positions it
    // now that its measured height is known.
    compute();
    const raf = requestAnimationFrame(compute);

    window.addEventListener("scroll", compute, true);
    window.addEventListener("resize", compute);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", compute, true);
      window.removeEventListener("resize", compute);
    };
  }, [open, compute]);

  return style;
}
