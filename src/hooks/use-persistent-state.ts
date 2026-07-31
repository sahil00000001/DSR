"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * State mirrored into localStorage.
 *
 * Reads lazily after mount (never during render) so server and client markup
 * always agree on the first paint — the usual source of hydration mismatches
 * in persisted-preference hooks. Storage failures (Safari private mode, quota)
 * degrade to in-memory state instead of throwing.
 */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      // Ignore — fall back to the initial value.
    } finally {
      setHydrated(true);
    }
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore quota / disabled-storage errors.
    }
  }, [key, value, hydrated]);

  const reset = useCallback(() => {
    setValue(initial);
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { value, setValue, reset, hydrated } as const;
}
