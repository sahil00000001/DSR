import type { Role } from "@/lib/constants/enums";

/**
 * Authorisation policy.
 *
 * All permission decisions live here as pure functions so they can be reasoned
 * about in one place and reused by both the server (enforcement) and the client
 * (hiding controls the user can't use). Server-side checks are the real gate —
 * hiding a button is presentation, never security.
 *
 * The model is deliberately small:
 *   • ADMIN    — everything.
 *   • MANAGER  — everything about their own reporting line, read-only org-wide.
 *   • EMPLOYEE — their own records.
 */

export interface Actor {
  id: string;
  role: Role;
}

/** Minimal shape needed to decide ownership/reporting-line questions. */
export interface Subject {
  id: string;
  managerId?: string | null;
}

export const isAdmin = (actor: Actor) => actor.role === "ADMIN";
export const isManager = (actor: Actor) => actor.role === "MANAGER";
export const isManagerOrAdmin = (actor: Actor) => actor.role === "ADMIN" || actor.role === "MANAGER";

const isSelf = (actor: Actor, subject: Subject) => actor.id === subject.id;
const reportsTo = (actor: Actor, subject: Subject) => subject.managerId === actor.id;

export const can = {
  // --- Daily status reports -------------------------------------------------

  /** Read someone's DSR: yourself, your reports, or any if manager/admin. */
  viewDsr: (actor: Actor, subject: Subject) =>
    isSelf(actor, subject) || isManagerOrAdmin(actor),

  /** Only the author edits a report, and only admins can amend after review. */
  editDsr: (actor: Actor, subject: Subject, status: string) =>
    (isSelf(actor, subject) && status !== "REVIEWED") || isAdmin(actor),

  /** Review someone else's report — never your own. */
  reviewDsr: (actor: Actor, subject: Subject) =>
    !isSelf(actor, subject) && (isAdmin(actor) || (isManager(actor) && reportsTo(actor, subject))),

  /** The org-wide bulk review board. */
  viewDsrBoard: (actor: Actor) => isManagerOrAdmin(actor),

  // --- Leave ---------------------------------------------------------------

  requestLeave: (_actor: Actor) => true,

  viewLeave: (actor: Actor, subject: Subject) => isSelf(actor, subject) || isManagerOrAdmin(actor),

  /**
   * Approving your own leave is not allowed at any role — the separation matters
   * more than the convenience for a 20-person org where the admin is also staff.
   */
  decideLeave: (actor: Actor, subject: Subject) =>
    !isSelf(actor, subject) && (isAdmin(actor) || (isManager(actor) && reportsTo(actor, subject))),

  /** Withdraw a request you own, while it's still pending. */
  cancelLeave: (actor: Actor, subject: Subject, status: string) =>
    (isSelf(actor, subject) && status === "PENDING") || isAdmin(actor),

  // --- Attendance ----------------------------------------------------------

  markOwnAttendance: (_actor: Actor) => true,

  /** Overriding a record is an admin action — it's an auditable correction. */
  overrideAttendance: (actor: Actor) => isAdmin(actor),

  viewAttendanceBoard: (actor: Actor) => isManagerOrAdmin(actor),

  // --- People & org --------------------------------------------------------

  viewDirectory: (_actor: Actor) => true,

  /** Full profile including phone, salary-adjacent fields and audit history. */
  viewEmployeeDetail: (actor: Actor, subject: Subject) =>
    isSelf(actor, subject) || isManagerOrAdmin(actor),

  manageEmployees: (actor: Actor) => isAdmin(actor),
  manageDepartments: (actor: Actor) => isAdmin(actor),

  editProfile: (actor: Actor, subject: Subject) => isSelf(actor, subject) || isAdmin(actor),

  // --- Org-wide surfaces ---------------------------------------------------

  viewAnalytics: (actor: Actor) => isManagerOrAdmin(actor),
  viewReports: (actor: Actor) => isManagerOrAdmin(actor),
  exportData: (actor: Actor) => isManagerOrAdmin(actor),

  postAnnouncement: (actor: Actor) => isManagerOrAdmin(actor),
  manageHolidays: (actor: Actor) => isAdmin(actor),
  viewAuditLog: (actor: Actor) => isAdmin(actor),
  manageSettings: (actor: Actor) => isAdmin(actor),
} as const;

/**
 * Prisma `where` fragment scoping a query to what the actor may see.
 *
 * Centralising this prevents the classic leak where a new list view forgets its
 * scoping clause: every people-scoped query composes this instead of writing
 * its own filter.
 */
export function visibleUserScope(actor: Actor): { id?: string } | Record<string, never> {
  if (isManagerOrAdmin(actor)) return {};
  return { id: actor.id };
}

/** Human-readable reason, used in 403 messages and tooltips on disabled controls. */
export function denialReason(actor: Actor): string {
  switch (actor.role) {
    case "EMPLOYEE":
      return "This area is available to managers and admins.";
    case "MANAGER":
      return "This action is restricted to admins.";
    default:
      return "You don't have permission to do that.";
  }
}
