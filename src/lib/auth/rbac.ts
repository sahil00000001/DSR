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

  // --- Expense claims ------------------------------------------------------

  submitExpense: (_actor: Actor) => true,

  /**
   * Read a claim: your own, one from your reporting line, or any as an admin.
   * Managers get read access for context even though they don't decide — "has my
   * fitter already claimed this?" is a fair question.
   */
  viewExpense: (actor: Actor, subject: Subject) =>
    isSelf(actor, subject) || isAdmin(actor) || (isManager(actor) && reportsTo(actor, subject)),

  /**
   * Approve, decline or mark reimbursed — admins only, and never your own claim.
   * Money leaving the company is a finance decision, and self-approval is not one.
   */
  decideExpense: (actor: Actor, subject: Subject) => isAdmin(actor) && !isSelf(actor, subject),

  /** Edit is only ever possible while a claim is still a private draft. */
  editExpense: (actor: Actor, subject: Subject, status: string) =>
    isSelf(actor, subject) && status === "DRAFT",

  /** Withdraw your own claim while it is still open. */
  cancelExpense: (actor: Actor, subject: Subject, status: string) =>
    (isSelf(actor, subject) && (status === "DRAFT" || status === "SUBMITTED")) || isAdmin(actor),

  /** The admin review queue. */
  viewExpenseQueue: (actor: Actor) => isAdmin(actor),

  // --- Tasks ---------------------------------------------------------------

  /**
   * Create and assign work. Admins only, per section 12 of the brief.
   *
   * Managers deliberately cannot: on a shop floor where the works manager owns the
   * schedule, two people assigning the same fitter is worse than one bottleneck.
   */
  createTask: (actor: Actor) => isAdmin(actor),

  /** Edit the details — title, description, priority, dates, category. */
  editTask: (actor: Actor) => isAdmin(actor),

  deleteTask: (actor: Actor) => isAdmin(actor),
  reassignTask: (actor: Actor) => isAdmin(actor),

  /**
   * Read a task: an assignee, its creator, an admin, or a manager whose reporting
   * line is on it. `assigneeIds` is passed rather than looked up here so the policy
   * stays a pure function.
   */
  viewTask: (
    actor: Actor,
    task: { createdById: string; assigneeIds: readonly string[]; assigneeManagerIds: readonly (string | null)[] },
  ) =>
    isAdmin(actor) ||
    task.createdById === actor.id ||
    task.assigneeIds.includes(actor.id) ||
    (isManager(actor) && task.assigneeManagerIds.includes(actor.id)),

  /**
   * Post an update, upload a file, record a voice note, tick a checklist item.
   *
   * Assignees and admins. A manager who can *see* a task cannot post on it — their
   * access is for context, and an update from someone not doing the work muddies
   * the thread the assignee is expected to keep.
   */
  updateTask: (actor: Actor, task: { assigneeIds: readonly string[] }) =>
    isAdmin(actor) || task.assigneeIds.includes(actor.id),

  /** Move it between statuses, including marking it complete. */
  changeTaskStatus: (actor: Actor, task: { assigneeIds: readonly string[] }) =>
    isAdmin(actor) || task.assigneeIds.includes(actor.id),

  /** The org-wide board, calendar and timeline across everyone's tasks. */
  viewAllTasks: (actor: Actor) => isManagerOrAdmin(actor),

  /** Task categories and the shared tag vocabulary. */
  manageTaskCategories: (actor: Actor) => isAdmin(actor),

  // --- Attendance ----------------------------------------------------------

  markOwnAttendance: (_actor: Actor) => true,

  /** Overriding a record is an admin action — it's an auditable correction. */
  overrideAttendance: (actor: Actor) => isAdmin(actor),

  viewAttendanceBoard: (actor: Actor) => isManagerOrAdmin(actor),

  // --- People & org --------------------------------------------------------

  viewDirectory: (_actor: Actor) => true,

  /**
   * Open a colleague's profile page at all.
   *
   * Everyone, deliberately — this is a company directory, and its whole purpose is
   * putting a name to a face and finding who someone reports to. Restricting this
   * to managers made every directory card a dead link for employees: the listing
   * showed all twenty people, and nineteen of them 404'd.
   *
   * What's *on* that page is a separate question — see `viewEmployeePrivateDetail`.
   */
  viewEmployeeProfile: (_actor: Actor, _subject: Subject) => true,

  /**
   * The private half of a profile: phone, date of birth, last sign-in, leave
   * balances, attendance statistics and report history.
   *
   * Field-level enforcement already lives in `getEmployeeProfile()`, which simply
   * doesn't select those columns when this returns false — so a component cannot
   * leak what it was never handed.
   */
  viewEmployeePrivateDetail: (actor: Actor, subject: Subject) =>
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
