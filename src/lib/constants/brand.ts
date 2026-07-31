/**
 * Who this portal belongs to.
 *
 * One module, no directives, importable from Server Components, Client Components,
 * the seed script and the email templates alike. The name previously appeared as a
 * literal in thirty-odd files, which is why renaming the company was a find-and-
 * replace rather than an edit.
 *
 * `COOKIE_PREFIX` is included deliberately: cookie and JWT names carry the brand,
 * and changing it signs everyone out. That is correct — a rename is a good moment
 * to invalidate old sessions — but it should be a visible consequence of editing
 * one constant, not a surprise.
 */

export const BRAND = {
  /** Legal name, for footers, emails and exports. */
  legalName: "Pooja Machines Private Limited",

  /** What the product is called in the interface. Short enough for a sidebar. */
  name: "Pooja Machines",

  /** Used where even that is too long — the browser tab, the PWA short name. */
  shortName: "Pooja",

  /** Sits under the mark in the sidebar. */
  lockupSubtitle: "TEAM OPERATIONS",

  /** One line, used on the login page and in metadata. */
  tagline: "Sewing machines and fans, made in India since 1998.",

  description:
    "The team operations portal for Pooja Machines Private Limited: daily status reports, attendance, leave, expense claims and analytics in one place.",

  /** Email domain for demo accounts and the default From address. */
  emailDomain: "poojamachines.co.in",

  /** Prefix for cookies and the JWT issuer. Changing it invalidates all sessions. */
  cookiePrefix: "pmpl",

  /** Prefix for exported filenames, e.g. `pooja-machines-expenses-2026-07-31.xlsx`. */
  filePrefix: "pooja-machines",
} as const;

/** `pmpl_session`, `pmpl_theme`, … — kept in one place so they can't drift apart. */
export function brandCookie(name: string): string {
  return `${BRAND.cookiePrefix}_${name}`;
}
