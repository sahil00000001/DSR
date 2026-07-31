"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** `useLayoutEffect` that doesn't warn during server rendering. */
export const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** True only after hydration — guards portals and `window` access. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/** Stable event listener that always sees the latest handler. */
export function useEventListener<K extends keyof WindowEventMap>(
  type: K,
  handler: (event: WindowEventMap[K]) => void,
  options?: { enabled?: boolean; target?: Window | Document | HTMLElement | null } & AddEventListenerOptions,
) {
  const handlerRef = useRef(handler);
  useIsomorphicLayoutEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  const { enabled = true, target, ...listenerOptions } = options ?? {};

  useEffect(() => {
    if (!enabled) return;
    const node = target ?? (typeof window !== "undefined" ? window : null);
    if (!node) return;

    const listener = (event: Event) => handlerRef.current(event as WindowEventMap[K]);
    node.addEventListener(type, listener, listenerOptions);
    return () => node.removeEventListener(type, listener, listenerOptions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, enabled, target, listenerOptions.capture, listenerOptions.passive]);
}

/**
 * Calls `handler` on pointer-down outside every referenced element.
 * Uses `pointerdown` rather than `click` so a menu closes before the click
 * lands on whatever is underneath it.
 */
export function useOnClickOutside(
  refs: Array<React.RefObject<HTMLElement | null>>,
  handler: (event: PointerEvent) => void,
  enabled = true,
) {
  const handlerRef = useRef(handler);
  useIsomorphicLayoutEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  // Ref identity is stable across renders; the array wrapper is not, so we key
  // the effect on `enabled` only and read refs at event time.
  const refsRef = useRef(refs);
  refsRef.current = refs;

  useEffect(() => {
    if (!enabled) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      // Ignore clicks that land inside any of the tracked elements.
      const inside = refsRef.current.some((ref) => ref.current?.contains(target));
      if (inside) return;
      handlerRef.current(event);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [enabled]);
}

/** Escape-to-dismiss, scoped to the topmost overlay via the capture phase. */
export function useEscapeKey(handler: () => void, enabled = true) {
  const handlerRef = useRef(handler);
  useIsomorphicLayoutEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        handlerRef.current();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}

/**
 * Prevents background scroll while an overlay is open, compensating for the
 * scrollbar width so the page doesn't shift.
 */
export function useLockBodyScroll(locked: boolean) {
  useEffect(() => {
    if (!locked) return;

    const { body, documentElement } = document;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth;

    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
    };
  }, [locked]);
}

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Traps Tab focus inside `containerRef` while active, moves focus in on open and
 * restores it to the previously focused element on close — the behaviour screen
 * reader and keyboard users expect from a modal.
 */
export function useFocusTrap(containerRef: React.RefObject<HTMLElement | null>, active: boolean) {
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    restoreRef.current = document.activeElement as HTMLElement | null;

    // Prefer an explicitly marked element, then the first natural target.
    const autoFocus = container.querySelector<HTMLElement>("[data-autofocus]");
    const first = container.querySelectorAll<HTMLElement>(FOCUSABLE)[0];
    (autoFocus ?? first ?? container).focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const firstEl = focusable[0]!;
      const lastEl = focusable[focusable.length - 1]!;

      if (event.shiftKey && document.activeElement === firstEl) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && document.activeElement === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    };

    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("keydown", onKeyDown);
      restoreRef.current?.focus({ preventScroll: true });
    };
  }, [active, containerRef]);
}

/** Reactive CSS media query. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const list = window.matchMedia(query);
    setMatches(list.matches);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Tailwind's `lg` breakpoint — the point where the sidebar becomes permanent. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}

/** Copy-to-clipboard with a transient "copied" flag for button feedback. */
export function useCopyToClipboard(resetAfter = 1600) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(
    async (value: string) => {
      try {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), resetAfter);
        return true;
      } catch {
        return false;
      }
    },
    [resetAfter],
  );

  return { copied, copy };
}
