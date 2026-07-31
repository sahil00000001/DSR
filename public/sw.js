/* eslint-disable no-undef */
/**
 * Cadence service worker.
 *
 * ## What this deliberately does NOT do
 *
 * It does not cache HTML pages or API responses. Every screen in this product is
 * authenticated and personalised — caching a rendered page risks serving one
 * person's dashboard to the next user of a shared machine, and a stale cached
 * approval queue is worse than no queue at all. That is not a theoretical concern
 * on an office laptop.
 *
 * ## What it does
 *
 *  • Precaches the offline fallback page and the app icons.
 *  • Serves *static build assets* (`/_next/static/*`, fonts, images) cache-first —
 *    they're content-hashed, so a cache hit is always correct.
 *  • Serves the offline page when a navigation fails, so a dropped connection
 *    shows something intentional rather than the browser's error page. Report
 *    drafts are kept in localStorage by the composer, so nothing in progress is
 *    lost while offline.
 *
 * Bump CACHE_VERSION to invalidate everything on the next deploy.
 */

const CACHE_VERSION = "cadence-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const OFFLINE_URL = "/offline.html";

const PRECACHE = [
  OFFLINE_URL,
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // `reload` bypasses the HTTP cache so a deploy always precaches fresh files.
      await cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" })));
      // Take over immediately rather than waiting for every tab to close.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => !key.startsWith(CACHE_VERSION)).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Content-hashed build output and static media — safe to cache indefinitely. */
function isImmutableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:woff2?|ttf|otf|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GET is ever cacheable; mutations must always reach the server.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never touch cross-origin requests or our own API.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (isImmutableAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;

        try {
          const response = await fetch(request);
          // Only cache complete, successful, same-origin responses.
          if (response.ok && response.type === "basic") {
            cache.put(request, response.clone());
          }
          return response;
        } catch (error) {
          // A missing asset offline is not fatal — let the browser handle it.
          throw error;
        }
      })(),
    );
    return;
  }

  // Navigations: always network-first, with the offline page as the fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(STATIC_CACHE);
          const offline = await cache.match(OFFLINE_URL);
          return (
            offline ??
            new Response("You are offline.", {
              status: 503,
              headers: { "Content-Type": "text/plain" },
            })
          );
        }
      })(),
    );
  }
});

/** Lets the page trigger an immediate update after a deploy. */
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
