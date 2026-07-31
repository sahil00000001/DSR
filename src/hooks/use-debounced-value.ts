"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Delays propagating a value until it has settled for `delay` ms. */
export function useDebouncedValue<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/**
 * Debounced callback with a stable identity.
 * Cancels the pending call on unmount so a debounced request can never fire
 * against an unmounted component.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delay = 300,
) {
  const callbackRef = useRef(callback);
  const timerRef = useRef<number | undefined>(undefined);

  // Assigned in an effect, not during render: mutating a ref while rendering is
  // a side effect, and React may render without committing.
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  // useCallback rather than useRef().current — the previous version froze the
  // first `delay` it ever saw, so changing it silently did nothing.
  return useCallback(
    (...args: Args) => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => callbackRef.current(...args), delay);
    },
    [delay],
  );
}
