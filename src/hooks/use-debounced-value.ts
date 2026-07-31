"use client";

import { useEffect, useRef, useState } from "react";

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
  callbackRef.current = callback;

  const timerRef = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const run = useRef((...args: Args) => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => callbackRef.current(...args), delay);
  }).current;

  return run;
}
