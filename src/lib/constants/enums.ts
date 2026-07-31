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
