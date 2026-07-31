import { z } from "zod";
import {
  ANNOUNCEMENT_AUDIENCES,
  ATTENDANCE_STATUSES,
  DEPARTMENT_COLORS,
  HOLIDAY_TYPES,
  LEAVE_TYPES,
  ROLES,
  SELF_REPORTABLE_ATTENDANCE,
  USER_STATUSES,
} from "@/lib/constants/enums";

/**
 * Every write in the application is validated here before it reaches Prisma.
 *
 * Schemas are derived from the enum tuples in `constants/enums.ts`, so adding a
 * status variant updates the database contract, the TypeScript types and the
 * validation in one edit. Error messages are written to be shown to the person
 * filling in the form — they are user copy, not developer copy.
 */

// ---------------------------------------------------------------------------
//  Primitives
// ---------------------------------------------------------------------------

export const dayKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.")
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()), "Pick a valid date.");

export const email = z
  .string()
  .trim()
  .min(1, "Email is required.")
  .max(254, "That email is too long.")
  .email("Enter a valid email address.")
  .transform((value) => value.toLowerCase());

export const password = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(200, "That password is too long.");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .optional()
    .transform((value) => (value ? value : undefined));

/** Coerces "" → undefined, which is what an untouched `<input>` submits. */
const optionalId = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value !== "" ? value : undefined));

const phone = z
  .string()
  .trim()
  .regex(/^[+\d][\d\s()-]{6,19}$/, "Enter a valid phone number.")
  .optional()
  .or(z.literal("").transform(() => undefined));

// ---------------------------------------------------------------------------
//  Authentication
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  email,
  // Deliberately only a presence check: a length rule here would tell an attacker
  // the minimum length of real passwords.
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(16, "This reset link is invalid."),
    password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Both passwords must match.",
    path: ["confirmPassword"],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Both passwords must match.",
    path: ["confirmPassword"],
  })
  .refine((data) => data.currentPassword !== data.password, {
    message: "Choose a password you haven't used here before.",
    path: ["password"],
  });

// ---------------------------------------------------------------------------
//  Daily status report
// ---------------------------------------------------------------------------

export const dsrSchema = z.object({
  date: dayKey,
  tasksCompleted: z
    .string()
    .trim()
    .min(10, "Describe what you worked on — a line or two is plenty.")
    .max(8000, "That's longer than we can store. Trim it down a little."),
  blockers: optionalText(4000),
  nextSteps: optionalText(4000),
  notes: optionalText(4000),
  hoursWorked: z.coerce
    .number({ error: "Hours must be a number." })
    .min(0, "Hours can't be negative.")
    .max(24, "There are only 24 hours in a day.")
    // Quarter-hour granularity keeps totals tidy across a month.
    .transform((value) => Math.round(value * 4) / 4),
  /** DRAFT saves without submitting; SUBMITTED locks it for review. */
  status: z.enum(["DRAFT", "SUBMITTED"]),
});

export const dsrReviewSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["REVIEWED", "FLAGGED"]),
  comment: optionalText(2000),
});

export const dsrBulkReviewSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Select at least one report.").max(200),
  status: z.enum(["REVIEWED", "FLAGGED"]),
  comment: optionalText(2000),
});

// ---------------------------------------------------------------------------
//  Attendance
// ---------------------------------------------------------------------------

const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour time, e.g. 09:30.")
  .optional()
  .or(z.literal("").transform(() => undefined));

export const selfAttendanceSchema = z.object({
  date: dayKey,
  status: z.enum(SELF_REPORTABLE_ATTENDANCE, {
    error: "Choose how you're working today.",
  }),
  checkIn: timeString,
  checkOut: timeString,
  note: optionalText(500),
});

/** Admin override — can set any status, including LEAVE and ABSENT. */
export const attendanceOverrideSchema = z.object({
  userId: z.string().min(1),
  date: dayKey,
  status: z.enum(ATTENDANCE_STATUSES),
  note: optionalText(500),
});

// ---------------------------------------------------------------------------
//  Leave
// ---------------------------------------------------------------------------

export const leaveRequestSchema = z
  .object({
    type: z.enum(LEAVE_TYPES, {
      error: "Choose a leave type.",
    }),
    startDate: dayKey,
    endDate: dayKey,
    halfDay: z.coerce.boolean().default(false),
    reason: z
      .string()
      .trim()
      .min(5, "A short reason helps your manager decide.")
      .max(1000, "Keep the reason under 1000 characters."),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: "The end date can't be before the start date.",
    path: ["endDate"],
  })
  .refine((data) => !data.halfDay || data.startDate === data.endDate, {
    message: "A half day has to be a single date.",
    path: ["halfDay"],
  })
  .refine(
    (data) => {
      // Guard against fat-fingered years creating a 3-year absence.
      const days =
        (new Date(`${data.endDate}T00:00:00Z`).getTime() -
          new Date(`${data.startDate}T00:00:00Z`).getTime()) /
        86_400_000;
      return days <= 90;
    },
    { message: "Leave longer than 90 days needs to be arranged with HR directly.", path: ["endDate"] },
  );

export const leaveDecisionSchema = z.object({
  id: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: optionalText(1000),
});

export const leaveCancelSchema = z.object({ id: z.string().min(1) });

// ---------------------------------------------------------------------------
//  People & organisation
// ---------------------------------------------------------------------------

export const employeeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter the employee's full name.")
    .max(120, "That name is too long."),
  email,
  employeeCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{3,20}$/, "Use letters, numbers and dashes only.")
    .transform((value) => value.toUpperCase()),
  role: z.enum(ROLES),
  status: z.enum(USER_STATUSES).default("ACTIVE"),
  designation: optionalText(120),
  phone,
  departmentId: optionalId,
  teamId: optionalId,
  locationId: optionalId,
  managerId: optionalId,
  joinedAt: dayKey,
  dateOfBirth: dayKey.optional().or(z.literal("").transform(() => undefined)),
});

export const employeeUpdateSchema = employeeSchema.extend({ id: z.string().min(1) });

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(120),
  phone,
  designation: optionalText(120),
  bio: optionalText(600),
  dateOfBirth: dayKey.optional().or(z.literal("").transform(() => undefined)),
});

export const preferencesSchema = z.object({
  theme: z.enum(["light", "dark", "system"]),
  notifyByEmail: z.coerce.boolean().default(true),
  dsrReminderOptOut: z.coerce.boolean().default(false),
});

export const departmentSchema = z.object({
  name: z.string().trim().min(2, "Enter a department name.").max(80),
  description: optionalText(400),
  color: z.enum(DEPARTMENT_COLORS).default("indigo"),
  headId: optionalId,
});

export const departmentUpdateSchema = departmentSchema.extend({ id: z.string().min(1) });

export const teamSchema = z.object({
  name: z.string().trim().min(2, "Enter a team name.").max(80),
  departmentId: z.string().min(1, "Choose a department."),
});

export const locationSchema = z.object({
  name: z.string().trim().min(2, "Enter a location name.").max(80),
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{2,10}$/, "Use a short code like BLR or NYC.")
    .transform((value) => value.toUpperCase()),
  city: z.string().trim().min(2, "Enter a city.").max(80),
  country: z.string().trim().min(2, "Enter a country.").max(80),
  timezone: z.string().trim().min(2).max(64).default("Asia/Kolkata"),
});

// ---------------------------------------------------------------------------
//  Communication
// ---------------------------------------------------------------------------

export const announcementSchema = z
  .object({
    title: z.string().trim().min(4, "Give the announcement a title.").max(160),
    body: z.string().trim().min(10, "Add some detail.").max(8000),
    audience: z.enum(ANNOUNCEMENT_AUDIENCES).default("ALL"),
    departmentId: optionalId,
    pinned: z.coerce.boolean().default(false),
  })
  .refine((data) => data.audience !== "DEPARTMENT" || Boolean(data.departmentId), {
    message: "Choose which department this is for.",
    path: ["departmentId"],
  });

export const holidaySchema = z.object({
  name: z.string().trim().min(2, "Name the holiday.").max(120),
  date: dayKey,
  type: z.enum(HOLIDAY_TYPES).default("PUBLIC"),
  locationId: optionalId,
});

// ---------------------------------------------------------------------------
//  Filters (parsed from URL search params, so everything is optional)
// ---------------------------------------------------------------------------

/** Splits a repeated or comma-joined query value into a clean array. */
const csvList = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => {
    if (!value) return [] as string[];
    const raw = Array.isArray(value) ? value : value.split(",");
    return raw.map((item) => item.trim()).filter(Boolean);
  });

export const dsrFilterSchema = z.object({
  q: z.string().trim().max(200).optional(),
  employee: csvList,
  department: csvList,
  team: csvList,
  location: csvList,
  manager: csvList,
  status: csvList,
  from: dayKey.optional(),
  to: dayKey.optional(),
  /** Named window; `custom` defers to from/to. */
  range: z.enum(["today", "yesterday", "week", "last-week", "month", "last-30", "custom"]).optional(),
  group: z.enum(["none", "employee", "department", "date", "status"]).optional(),
  sort: z.enum(["date-desc", "date-asc", "name-asc", "hours-desc"]).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  size: z.coerce.number().int().min(10).max(200).optional(),
});

export type DsrFilterInput = z.infer<typeof dsrFilterSchema>;

export const attendanceFilterSchema = z.object({
  q: z.string().trim().max(200).optional(),
  department: csvList,
  location: csvList,
  status: csvList,
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

export const leaveFilterSchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: csvList,
  type: csvList,
  department: csvList,
  from: dayKey.optional(),
  to: dayKey.optional(),
});

export const employeeFilterSchema = z.object({
  q: z.string().trim().max(200).optional(),
  department: csvList,
  team: csvList,
  location: csvList,
  role: csvList,
  status: csvList,
  sort: z.enum(["name-asc", "name-desc", "joined-desc", "joined-asc", "department"]).optional(),
});

export const exportSchema = z.object({
  kind: z.enum(["dsr", "attendance", "leave", "employees", "departments", "dsr-completion"]),
  format: z.enum(["csv", "xlsx"]),
});

// ---------------------------------------------------------------------------
//  FormData bridge
// ---------------------------------------------------------------------------

export interface ParseFailure {
  ok: false;
  fieldErrors: Record<string, string>;
  message: string;
}

export type ParseResult<T> = { ok: true; data: T } | ParseFailure;

/**
 * Validates a `FormData` payload against a schema.
 *
 * Repeated keys (checkbox groups, multi-selects) collapse into arrays; unchecked
 * checkboxes are absent from FormData entirely, which is why boolean fields use
 * `coerce.boolean().default(false)`.
 *
 * Returns the first message per field, which is what a form can actually show.
 */
export function parseFormData<S extends z.ZodTypeAny>(
  schema: S,
  formData: FormData,
): ParseResult<z.infer<S>> {
  const raw: Record<string, string | string[]> = {};

  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue; // Files are handled separately.
    const existing = raw[key];
    if (existing === undefined) {
      raw[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      raw[key] = [existing, value];
    }
  }

  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };

  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join(".") || "_form";
    if (!fieldErrors[path]) fieldErrors[path] = issue.message;
  }

  return {
    ok: false,
    fieldErrors,
    message: fieldErrors._form ?? "Please check the highlighted fields.",
  };
}

/** Validates URL search params — always lenient, never throws. */
export function parseSearchParams<S extends z.ZodTypeAny>(
  schema: S,
  params: Record<string, string | string[] | undefined>,
): z.infer<S> {
  const result = schema.safeParse(params);
  // Filters must degrade gracefully: a hand-edited URL shows defaults, not a crash.
  return result.success ? result.data : schema.parse({});
}
