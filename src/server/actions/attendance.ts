"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { errors, toUserMessage } from "@/lib/errors";
import { can } from "@/lib/auth/rbac";
import { requireUserAction } from "@/lib/auth/session";
import {
  attendanceOverrideSchema,
  parseFormData,
  selfAttendanceSchema,
} from "@/lib/validation/schemas";
import {
  ATTENDANCE_STATUS_LABEL,
  asAttendanceStatus,
  type AttendanceStatus,
} from "@/lib/constants/enums";
import { differenceInDays, formatDay, parseDayKey, today, todayKey } from "@/lib/utils/date";
import { recordAudit } from "@/lib/services/audit";
import { formError, formSuccess, type FormState } from "@/server/actions/form-state";

/**
 * Attendance writes.
 *
 * Self-service is intentionally narrow: an employee may say *how* they worked
 * (present / WFH / half day) for today or the last few days, and nothing more.
 * Marking someone absent, on leave, or editing history is an admin correction —
 * it changes the record of what happened, so it is audited and attributed.
 */

/** How far back self-service marking is allowed. */
const SELF_MARK_WINDOW_DAYS = 3;

/** Combines a `YYYY-MM-DD` day with a `HH:MM` time into an instant. */
function toInstant(day: Date, time: string | undefined): Date | null {
  if (!time) return null;
  const [hours, minutes] = time.split(":").map(Number);
  const instant = new Date(day.getTime());
  instant.setUTCHours(hours ?? 0, minutes ?? 0, 0, 0);
  return instant;
}

export async function markAttendanceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseFormData(selfAttendanceSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  try {
    const actor = await requireUserAction();
    const input = parsed.data;
    const date = parseDayKey(input.date);
    const now = today();

    if (date > now) {
      return formError("You can't mark attendance for a future date.", {
        date: "Pick today or a recent day.",
      });
    }

    // `differenceInDays(a, b)` is b − a, so this is positive for past dates.
    const age = differenceInDays(date, now);
    if (age > SELF_MARK_WINDOW_DAYS) {
      return formError(
        `Attendance can only be marked for the last ${SELF_MARK_WINDOW_DAYS} days. Ask an admin to correct anything older.`,
        { date: "This date is outside the window you can edit." },
      );
    }

    const existing = await prisma.attendance.findUnique({
      where: { userId_date: { userId: actor.id, date } },
      select: { id: true, status: true, source: true },
    });

    // Don't let self-service overwrite an admin's correction or approved leave.
    if (existing && existing.source === "ADMIN") {
      return formError(
        `An admin has already set this day to “${
          ATTENDANCE_STATUS_LABEL[asAttendanceStatus(existing.status)]
        }”. Ask them if it needs changing.`,
      );
    }
    if (existing && existing.status === "LEAVE") {
      return formError(
        "This day is recorded as approved leave. Cancel the leave request first if you actually worked.",
      );
    }

    const checkInAt = toInstant(date, input.checkIn);
    const checkOutAt = toInstant(date, input.checkOut);

    if (checkInAt && checkOutAt && checkOutAt <= checkInAt) {
      return formError("Check-out has to be after check-in.", {
        checkOut: "This is earlier than the check-in time.",
      });
    }

    const workedMinutes =
      checkInAt && checkOutAt
        ? Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 60_000)
        : // No times given: assume the standard day, halved for a half day.
          input.status === "HALF_DAY"
          ? 240
          : 480;

    await prisma.attendance.upsert({
      where: { userId_date: { userId: actor.id, date } },
      create: {
        userId: actor.id,
        date,
        status: input.status,
        checkInAt,
        checkOutAt,
        workedMinutes,
        note: input.note ?? null,
        source: "SELF",
      },
      update: {
        status: input.status,
        checkInAt,
        checkOutAt,
        workedMinutes,
        note: input.note ?? null,
        source: "SELF",
      },
    });

    await recordAudit({
      actorId: actor.id,
      action: "attendance.mark",
      entity: "attendance",
      meta: { date: input.date, status: input.status },
    });

    revalidatePath("/attendance");
    revalidatePath("/dashboard");
    revalidatePath("/attendance/board");

    return formSuccess(
      `Marked ${ATTENDANCE_STATUS_LABEL[input.status as AttendanceStatus].toLowerCase()} for ${formatDay(date)}.`,
    );
  } catch (error) {
    return formError(toUserMessage(error, { action: "markAttendance" }));
  }
}

/**
 * Admin correction of any day for any person.
 *
 * Setting a day to WEEKEND or HOLIDAY *deletes* the row rather than storing it:
 * those states are derived (see `services/attendance.ts`), and persisting them
 * would create two sources of truth that could disagree.
 */
export async function overrideAttendanceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseFormData(attendanceOverrideSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  try {
    const actor = await requireUserAction();
    if (!can.overrideAttendance(actor)) {
      throw errors.forbidden("Only admins can correct attendance records.");
    }

    const input = parsed.data;
    const date = parseDayKey(input.date);
    const status = input.status as AttendanceStatus;

    const target = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, name: true },
    });
    if (!target) throw errors.notFound("That employee");

    if (date > today()) {
      return formError("You can't set attendance for a future date.", {
        date: "Pick today or an earlier day.",
      });
    }

    if (status === "WEEKEND" || status === "HOLIDAY") {
      await prisma.attendance.deleteMany({ where: { userId: input.userId, date } });
    } else {
      await prisma.attendance.upsert({
        where: { userId_date: { userId: input.userId, date } },
        create: {
          userId: input.userId,
          date,
          status,
          workedMinutes: status === "PRESENT" || status === "WFH" ? 480 : status === "HALF_DAY" ? 240 : 0,
          note: input.note ?? null,
          source: "ADMIN",
        },
        update: {
          status,
          workedMinutes: status === "PRESENT" || status === "WFH" ? 480 : status === "HALF_DAY" ? 240 : 0,
          note: input.note ?? null,
          source: "ADMIN",
        },
      });
    }

    await recordAudit({
      actorId: actor.id,
      action: "attendance.override",
      entity: "attendance",
      entityId: input.userId,
      meta: { date: input.date, status, subject: target.name },
    });

    revalidatePath("/attendance/board");
    revalidatePath("/attendance");
    revalidatePath("/dashboard");

    return formSuccess(
      `${target.name}'s ${formatDay(date)} set to ${ATTENDANCE_STATUS_LABEL[status].toLowerCase()}.`,
    );
  } catch (error) {
    return formError(toUserMessage(error, { action: "overrideAttendance" }));
  }
}

/** One-tap "I'm working today" from the dashboard. */
export async function quickMarkTodayAction(status: AttendanceStatus): Promise<FormState> {
  const formData = new FormData();
  // `todayKey()` derives the day from local components. `toISOString()` would use
  // UTC and record yesterday for anyone east of Greenwich early in the morning.
  formData.set("date", todayKey());
  formData.set("status", status);
  return markAttendanceAction({ ok: null }, formData);
}
