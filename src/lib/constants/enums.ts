/**
 * Single source of truth for every string-union column in the database.
 *
 * The Prisma schema stores these as `String` for provider portability, so this
 * file is what gives them type safety, human labels and presentation tokens.
 * Zod schemas in `src/lib/validation` are derived from these arrays, which means
 * adding a new variant is a one-line change that propagates everywhere.
 */

// ---------------------------------------------------------------------------
//  Roles & account status
// ---------------------------------------------------------------------------

export const ROLES = ["ADMIN", "MANAGER", "EMPLOYEE"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  EMPLOYEE: "Employee",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  ADMIN: "Full access to every module, settings and the audit trail.",
  MANAGER: "Reviews and approves for their own reporting line.",
  EMPLOYEE: "Submits reports, attendance and leave requests.",
};

export const USER_STATUSES = ["ACTIVE", "DISABLED", "INVITED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const USER_STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: "Active",
  DISABLED: "Disabled",
  INVITED: "Invited",
};

// ---------------------------------------------------------------------------
//  Daily Status Reports
// ---------------------------------------------------------------------------

export const DSR_STATUSES = ["DRAFT", "SUBMITTED", "REVIEWED", "FLAGGED"] as const;
export type DsrStatus = (typeof DSR_STATUSES)[number];

export const DSR_STATUS_LABEL: Record<DsrStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  REVIEWED: "Reviewed",
  FLAGGED: "Needs attention",
};

/** Maps to the `<Badge tone>` scale — see components/ui/badge.tsx. */
export const DSR_STATUS_TONE = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  REVIEWED: "success",
  FLAGGED: "warning",
} as const;

// ---------------------------------------------------------------------------
//  Attendance
// ---------------------------------------------------------------------------

export const ATTENDANCE_STATUSES = [
  "PRESENT",
  "WFH",
  "HALF_DAY",
  "LEAVE",
  "ABSENT",
  "HOLIDAY",
  "WEEKEND",
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  WFH: "Work from home",
  HALF_DAY: "Half day",
  LEAVE: "On leave",
  ABSENT: "Absent",
  HOLIDAY: "Holiday",
  WEEKEND: "Weekend",
};

export const ATTENDANCE_STATUS_SHORT: Record<AttendanceStatus, string> = {
  PRESENT: "P",
  WFH: "W",
  HALF_DAY: "½",
  LEAVE: "L",
  ABSENT: "A",
  HOLIDAY: "H",
  WEEKEND: "—",
};

export const ATTENDANCE_STATUS_TONE = {
  PRESENT: "success",
  WFH: "info",
  HALF_DAY: "warning",
  LEAVE: "accent",
  ABSENT: "danger",
  HOLIDAY: "neutral",
  WEEKEND: "neutral",
} as const;

/** Statuses an employee may self-report; the rest are system or admin driven. */
export const SELF_REPORTABLE_ATTENDANCE = ["PRESENT", "WFH", "HALF_DAY"] as const satisfies readonly AttendanceStatus[];

/** Counts toward "worked" in analytics. */
export const WORKING_ATTENDANCE = ["PRESENT", "WFH", "HALF_DAY"] as const satisfies readonly AttendanceStatus[];

/** Days where no report is expected. */
export const NON_WORKING_ATTENDANCE = ["WEEKEND", "HOLIDAY", "LEAVE"] as const satisfies readonly AttendanceStatus[];

export const ATTENDANCE_SOURCES = ["SELF", "ADMIN", "SYSTEM"] as const;
export type AttendanceSource = (typeof ATTENDANCE_SOURCES)[number];

// ---------------------------------------------------------------------------
//  Leave
// ---------------------------------------------------------------------------

export const LEAVE_TYPES = ["CASUAL", "SICK", "EARNED", "UNPAID"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

/** Types that draw down an allocated balance. UNPAID is unlimited. */
export const BALANCED_LEAVE_TYPES = ["CASUAL", "SICK", "EARNED"] as const;
export type BalancedLeaveType = (typeof BALANCED_LEAVE_TYPES)[number];

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  CASUAL: "Casual leave",
  SICK: "Sick leave",
  EARNED: "Earned leave",
  UNPAID: "Unpaid leave",
};

export const LEAVE_TYPE_SHORT: Record<LeaveType, string> = {
  CASUAL: "Casual",
  SICK: "Sick",
  EARNED: "Earned",
  UNPAID: "Unpaid",
};

export const LEAVE_TYPE_TONE = {
  CASUAL: "info",
  SICK: "danger",
  EARNED: "success",
  UNPAID: "neutral",
} as const;

/** Annual entitlement per employee, per the HR policy. */
export const DEFAULT_LEAVE_ALLOCATION: Record<BalancedLeaveType, number> = {
  CASUAL: 5,
  SICK: 5,
  EARNED: 5,
};

export const LEAVE_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export const LEAVE_STATUS_TONE = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
} as const;

// ---------------------------------------------------------------------------
//  Notifications
// ---------------------------------------------------------------------------

export const NOTIFICATION_TYPES = [
  "LEAVE_SUBMITTED",
  "LEAVE_APPROVED",
  "LEAVE_REJECTED",
  "LEAVE_CANCELLED",
  "DSR_REMINDER",
  "DSR_REVIEWED",
  "DSR_FLAGGED",
  "ATTENDANCE_REMINDER",
  "EXPENSE_SUBMITTED",
  "EXPENSE_APPROVED",
  "EXPENSE_REJECTED",
  "EXPENSE_REIMBURSED",
  "EXPENSE_COMMENT",
  "TASK_ASSIGNED",
  "TASK_UPDATED",
  "TASK_MENTION",
  "TASK_ATTACHMENT",
  "TASK_DUE_SOON",
  "TASK_OVERDUE",
  "TASK_DEADLINE_CHANGED",
  "TASK_COMPLETED",
  "TASK_BLOCKED",
  "ANNOUNCEMENT",
  "MENTION",
  "SYSTEM",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// ---------------------------------------------------------------------------
//  Announcements, holidays, tokens
// ---------------------------------------------------------------------------

export const ANNOUNCEMENT_AUDIENCES = ["ALL", "DEPARTMENT"] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

export const HOLIDAY_TYPES = ["PUBLIC", "OPTIONAL", "COMPANY"] as const;
export type HolidayType = (typeof HOLIDAY_TYPES)[number];

export const HOLIDAY_TYPE_LABEL: Record<HolidayType, string> = {
  PUBLIC: "Public holiday",
  OPTIONAL: "Optional holiday",
  COMPANY: "Company day",
};

export const TOKEN_TYPES = ["PASSWORD_RESET", "EMAIL_VERIFY", "INVITE"] as const;
export type TokenType = (typeof TOKEN_TYPES)[number];

// ---------------------------------------------------------------------------
//  Presentation helpers
// ---------------------------------------------------------------------------

/**
 * Department colour tokens. Each maps to a CSS variable pair defined in
 * globals.css so charts, badges and avatars stay visually coherent.
 */
export const DEPARTMENT_COLORS = [
  "indigo",
  "emerald",
  "amber",
  "sky",
  "violet",
  "rose",
  "teal",
  "orange",
] as const;
export type DepartmentColor = (typeof DEPARTMENT_COLORS)[number];

export function isDepartmentColor(value: string): value is DepartmentColor {
  return (DEPARTMENT_COLORS as readonly string[]).includes(value);
}

/** Narrowing helpers used when reading untyped strings back out of the database. */
export function asRole(value: string): Role {
  return (ROLES as readonly string[]).includes(value) ? (value as Role) : "EMPLOYEE";
}

export function asDsrStatus(value: string): DsrStatus {
  return (DSR_STATUSES as readonly string[]).includes(value) ? (value as DsrStatus) : "DRAFT";
}

export function asAttendanceStatus(value: string): AttendanceStatus {
  return (ATTENDANCE_STATUSES as readonly string[]).includes(value)
    ? (value as AttendanceStatus)
    : "ABSENT";
}

export function asLeaveStatus(value: string): LeaveStatus {
  return (LEAVE_STATUSES as readonly string[]).includes(value) ? (value as LeaveStatus) : "PENDING";
}

export function asLeaveType(value: string): LeaveType {
  return (LEAVE_TYPES as readonly string[]).includes(value) ? (value as LeaveType) : "CASUAL";
}

export function asUserStatus(value: string): UserStatus {
  return (USER_STATUSES as readonly string[]).includes(value) ? (value as UserStatus) : "ACTIVE";
}

// ---------------------------------------------------------------------------
//  Expense claims
// ---------------------------------------------------------------------------

/**
 * Categories chosen for a manufacturing business rather than a software one:
 * freight, tooling and raw material are what people at a plant actually spend on.
 */
export const EXPENSE_CATEGORIES = [
  "TRAVEL",
  "FUEL",
  "FREIGHT",
  "TOOLS",
  "MATERIALS",
  "MEALS",
  "LODGING",
  "REPAIRS",
  "OFFICE",
  "OTHER",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  TRAVEL: "Travel",
  FUEL: "Fuel",
  FREIGHT: "Freight & courier",
  TOOLS: "Tools & spares",
  MATERIALS: "Raw material",
  MEALS: "Meals",
  LODGING: "Lodging",
  REPAIRS: "Repairs & maintenance",
  OFFICE: "Office supplies",
  OTHER: "Other",
};

export const EXPENSE_CATEGORY_HINT: Record<ExpenseCategory, string> = {
  TRAVEL: "Bus, train, flight, taxi or auto fare.",
  FUEL: "Petrol or diesel for a company or personal vehicle used for work.",
  FREIGHT: "Transport of goods, courier and packing charges.",
  TOOLS: "Hand tools, cutting tools, machine spares.",
  MATERIALS: "Sheet, wire, fasteners or components bought directly.",
  MEALS: "Food while travelling or working late.",
  LODGING: "Hotel or guest house while away from your plant.",
  REPAIRS: "Machine or building repair paid for on the spot.",
  OFFICE: "Stationery, printing, small office items.",
  OTHER: "Anything that doesn't fit above — explain it in the description.",
};

export const EXPENSE_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "REIMBURSED",
  "CANCELLED",
] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const EXPENSE_STATUS_LABEL: Record<ExpenseStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Awaiting approval",
  APPROVED: "Approved",
  REJECTED: "Declined",
  REIMBURSED: "Reimbursed",
  CANCELLED: "Withdrawn",
};

export const EXPENSE_STATUS_TONE = {
  DRAFT: "neutral",
  SUBMITTED: "warning",
  APPROVED: "info",
  REJECTED: "danger",
  REIMBURSED: "success",
  CANCELLED: "neutral",
} as const;

/** What the claimant should expect next, shown on the claim itself. */
export const EXPENSE_STATUS_MEANING: Record<ExpenseStatus, string> = {
  DRAFT: "Not submitted yet — only you can see this.",
  SUBMITTED: "An admin has been notified and will review it.",
  APPROVED: "Approved for payment. Finance will mark it reimbursed once paid.",
  REJECTED: "Declined. Read the note, then submit a corrected claim if needed.",
  REIMBURSED: "Paid out. Nothing further needed.",
  CANCELLED: "You withdrew this claim.",
};

/** Statuses that still count as money owed to the employee. */
export const EXPENSE_OPEN_STATUSES = ["SUBMITTED", "APPROVED"] as const;

export function asExpenseStatus(value: string): ExpenseStatus {
  return (EXPENSE_STATUSES as readonly string[]).includes(value)
    ? (value as ExpenseStatus)
    : "DRAFT";
}

export function asExpenseCategory(value: string): ExpenseCategory {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(value)
    ? (value as ExpenseCategory)
    : "OTHER";
}

// ---------------------------------------------------------------------------
//  Tasks
// ---------------------------------------------------------------------------

export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

export const TASK_PRIORITY_TONE = {
  LOW: "neutral",
  MEDIUM: "info",
  HIGH: "warning",
  CRITICAL: "danger",
} as const;

/** Sort weight — higher is more urgent. Used to order boards and digests. */
export const TASK_PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

export const TASK_STATUSES = [
  "TODO",
  "IN_PROGRESS",
  "REVIEW",
  "COMPLETED",
  "BLOCKED",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  REVIEW: "In review",
  COMPLETED: "Completed",
  BLOCKED: "Blocked",
};

export const TASK_STATUS_TONE = {
  TODO: "neutral",
  IN_PROGRESS: "info",
  REVIEW: "accent",
  COMPLETED: "success",
  BLOCKED: "danger",
} as const;

/** What the assignee should expect next, shown on the task itself. */
export const TASK_STATUS_MEANING: Record<TaskStatus, string> = {
  TODO: "Not started yet.",
  IN_PROGRESS: "Being worked on.",
  REVIEW: "Finished and waiting on a check before it counts as done.",
  COMPLETED: "Done. Nothing further needed.",
  BLOCKED: "Stopped by something outside this task — see the reason.",
};

/**
 * Column order on the Kanban board.
 *
 * BLOCKED sits last rather than between REVIEW and COMPLETED: it is a siding, not a
 * step on the way, and putting it in the middle implies work flows through it.
 */
export const TASK_BOARD_ORDER = [
  "TODO",
  "IN_PROGRESS",
  "REVIEW",
  "COMPLETED",
  "BLOCKED",
] as const satisfies readonly TaskStatus[];

/** Statuses that still represent outstanding work. */
export const TASK_OPEN_STATUSES = [
  "TODO",
  "IN_PROGRESS",
  "REVIEW",
  "BLOCKED",
] as const satisfies readonly TaskStatus[];

/** Progress implied by a status, when nobody has set a figure explicitly. */
export const TASK_STATUS_PROGRESS: Record<TaskStatus, number> = {
  TODO: 0,
  IN_PROGRESS: 25,
  REVIEW: 90,
  COMPLETED: 100,
  BLOCKED: 0,
};

export const TASK_RECURRENCES = ["NONE", "DAILY", "WEEKLY", "MONTHLY"] as const;
export type TaskRecurrence = (typeof TASK_RECURRENCES)[number];

export const TASK_RECURRENCE_LABEL: Record<TaskRecurrence, string> = {
  NONE: "Does not repeat",
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
};

/**
 * Timeline entry kinds.
 *
 * Deliberately finer-grained than the status field: "due date moved" and "reassigned"
 * are different questions after the fact, and collapsing both into "edited" is how a
 * timeline stops answering them.
 */
export const TASK_ACTIVITY_KINDS = [
  "created",
  "assigned",
  "unassigned",
  "status_changed",
  "priority_changed",
  "progress_changed",
  "due_date_changed",
  "commented",
  "attachment_added",
  "attachment_removed",
  "recording_added",
  "tag_added",
  "tag_removed",
  "checklist_added",
  "checklist_completed",
  "dependency_added",
  "dependency_removed",
  "completed",
  "reopened",
  "blocked",
  "unblocked",
  "edited",
  "spawned",
] as const;
export type TaskActivityKind = (typeof TASK_ACTIVITY_KINDS)[number];

/** Verb shown in the timeline. The actor's name is prefixed by the component. */
export const TASK_ACTIVITY_LABEL: Record<TaskActivityKind, string> = {
  created: "created this task",
  assigned: "assigned it",
  unassigned: "removed an assignee",
  status_changed: "changed the status",
  priority_changed: "changed the priority",
  progress_changed: "updated progress",
  due_date_changed: "changed the due date",
  commented: "posted an update",
  attachment_added: "attached a file",
  attachment_removed: "removed a file",
  recording_added: "added a recording",
  tag_added: "added a tag",
  tag_removed: "removed a tag",
  checklist_added: "added checklist items",
  checklist_completed: "ticked a checklist item",
  dependency_added: "added a dependency",
  dependency_removed: "removed a dependency",
  completed: "marked it complete",
  reopened: "reopened it",
  blocked: "marked it blocked",
  unblocked: "unblocked it",
  edited: "edited the details",
  spawned: "was created by a repeating schedule",
};

export function asTaskStatus(value: string): TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value) ? (value as TaskStatus) : "TODO";
}

export function asTaskPriority(value: string): TaskPriority {
  return (TASK_PRIORITIES as readonly string[]).includes(value)
    ? (value as TaskPriority)
    : "MEDIUM";
}

export function asTaskRecurrence(value: string): TaskRecurrence {
  return (TASK_RECURRENCES as readonly string[]).includes(value)
    ? (value as TaskRecurrence)
    : "NONE";
}

export function asTaskActivityKind(value: string): TaskActivityKind {
  return (TASK_ACTIVITY_KINDS as readonly string[]).includes(value)
    ? (value as TaskActivityKind)
    : "edited";
}

/**
 * Seed tag vocabulary from section 6 of the brief.
 *
 * A starting set rather than a closed one — tags are rows, and an admin can add
 * "Painting" or "Tool room" without a deployment.
 */
export const DEFAULT_TASK_TAGS = [
  { name: "Backend", color: "indigo" },
  { name: "Frontend", color: "violet" },
  { name: "Bug", color: "rose" },
  { name: "Security", color: "amber" },
  { name: "Documentation", color: "teal" },
  { name: "Blocked", color: "rose" },
  { name: "Urgent", color: "amber" },
  { name: "Production", color: "indigo" },
  { name: "Quality", color: "violet" },
  { name: "Maintenance", color: "sky" },
  { name: "Dispatch", color: "teal" },
  { name: "Safety", color: "rose" },
] as const;

// ---------------------------------------------------------------------------
//  Orders
// ---------------------------------------------------------------------------

export const ORDER_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "AT_RISK",
  "DELAYED",
  "COMPLETED",
  "CANCELLED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Not started",
  IN_PROGRESS: "On track",
  AT_RISK: "At risk",
  DELAYED: "Delayed",
  COMPLETED: "Delivered",
  CANCELLED: "Cancelled",
};

export const ORDER_STATUS_TONE = {
  PENDING: "neutral",
  IN_PROGRESS: "info",
  AT_RISK: "warning",
  DELAYED: "danger",
  COMPLETED: "success",
  CANCELLED: "neutral",
} as const;

/** What the status means for the promise. Shown beside it, never left to inference. */
export const ORDER_STATUS_MEANING: Record<OrderStatus, string> = {
  PENDING: "No stage has started yet.",
  IN_PROGRESS: "Forecast to land on or before the promised date.",
  AT_RISK: "Forecast to miss the promised date — there is still time to act.",
  DELAYED: "The promised date has passed and the work is not finished.",
  COMPLETED: "Delivered.",
  CANCELLED: "Cancelled — no longer tracked.",
};

/** Statuses that still represent a live commitment to a customer. */
export const ORDER_OPEN_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "AT_RISK",
  "DELAYED",
] as const satisfies readonly OrderStatus[];

/** Statuses that need somebody to act today. */
export const ORDER_ATTENTION_STATUSES = [
  "AT_RISK",
  "DELAYED",
] as const satisfies readonly OrderStatus[];

export const ORDER_ACTIVITY_KINDS = [
  "created",
  "stage_added",
  "stage_started",
  "stage_completed",
  "stage_overran",
  "promised_date_changed",
  "status_changed",
  "at_risk",
  "recovered",
  "delivered",
  "cancelled",
  "note",
] as const;
export type OrderActivityKind = (typeof ORDER_ACTIVITY_KINDS)[number];

export const ORDER_ACTIVITY_LABEL: Record<OrderActivityKind, string> = {
  created: "created the order",
  stage_added: "added a stage",
  stage_started: "started a stage",
  stage_completed: "finished a stage",
  stage_overran: "went over the allotted time",
  promised_date_changed: "moved the promised date",
  status_changed: "changed the status",
  at_risk: "was forecast to run late",
  recovered: "came back on track",
  delivered: "was delivered",
  cancelled: "was cancelled",
  note: "left a note",
};

export function asOrderStatus(value: string): OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value)
    ? (value as OrderStatus)
    : "PENDING";
}

export function asOrderActivityKind(value: string): OrderActivityKind {
  return (ORDER_ACTIVITY_KINDS as readonly string[]).includes(value)
    ? (value as OrderActivityKind)
    : "note";
}

/** Outbound message kinds, for the send log. */
export const MESSAGE_KINDS = [
  "digest",
  /** A message received *from* the admin. Logging it is how the 24h window is found. */
  "inbound",
  "order_risk",
  "order_delayed",
  "order_complete",
  "stage_done",
  "inbound_reply",
  "test",
] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];
