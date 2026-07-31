/**
 * Cookie names, in a runtime-neutral module.
 *
 * These are read by Server Components and written by Client Components, so they
 * cannot live in either. `SIDEBAR_COOKIE` was previously exported from
 * `components/layout/sidebar.tsx` — a `"use client"` module — and imported into the
 * `(app)` layout to decide the server-rendered width. Crossing that boundary the
 * wrong way meant the layout didn't reliably see the value, so the persisted
 * collapsed state was silently ignored on every navigation: collapse the sidebar,
 * click any link, and it was expanded again.
 *
 * Constants shared across the server/client boundary belong in a plain module with
 * no directive, for the same reason the DTOs live in `src/types`.
 */
import { brandCookie } from "@/lib/constants/brand";

/** Sidebar collapsed/expanded. Read by the app layout, written by the sidebar. */
export const SIDEBAR_COOKIE = brandCookie("sidebar");

/** Light/dark/system. Read by the root layout, written by the theme provider. */
export const THEME_COOKIE = brandCookie("theme");

/** A year — long enough that a display preference feels permanent. */
export const PREFERENCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
