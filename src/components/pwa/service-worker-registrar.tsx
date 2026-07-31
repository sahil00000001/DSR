"use client";

import { useEffect } from "react";

/**
 * Registers the service worker that makes the portal installable and gives it an
 * offline shell.
 *
 * Registration is deliberately deferred until after `load`: a service worker
 * install competing with the first paint measurably hurts LCP, and nothing on the
 * first visit depends on it.
 *
 * Development is skipped entirely — a cached shell plus hot reload is a reliable
 * way to spend an afternoon debugging stale assets.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Registration failures are non-fatal: the app works without it.
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
