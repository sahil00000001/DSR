"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { errors, toUserMessage } from "@/lib/errors";
import { can } from "@/lib/auth/rbac";
import { requireUserAction } from "@/lib/auth/session";
import { dsrBulkReviewSchema, dsrReviewSchema, dsrSchema, parseFormData } from "@/lib/validation/schemas";
import { differenceInDays, formatDay, isWeekend, parseDayKey, toDayKey, today } from "@/lib/utils/date";
import { recordAudit } from "@/lib/services/audit";
import { notify, notifyMany } from "@/lib/services/notifications";
import { sendEmail } from "@/lib/email/mailer";
import { dsrReviewedEmail } from "@/lib/email/templates";
import { formError, formSuccess, type FormState } from "@/server/actions/form-state";

/**
 * Daily status report writes.
 *
 * ## Rules encoded here
 *
 *  • **One report per person per day** — guaranteed by a composite unique index,
 *    so `upsert` is the natural operation and concurrent submits can't duplicate.
 *  • **No future reports**, and no back-filling beyond `BACKFILL_LIMIT_DAYS`.
 *    Without a floor, "catch up on last quarter" produces data nobody trusts.
 *  • **A submitted report is evidence of attendance.** Submitting marks the day
 *    PRESENT if nothing was recorded, which removes the most common double-entry
 *    complaint about tools like this.
 *  • **Reviewing is not editing.** A reviewer sets status and a comment; the body
 *    stays exactly as the author wrote it.
 */

/** How far back an employee may still file. */
const BACKFILL_LIMIT_DAYS = 30;

export async function saveDsrAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseFormData(dsrSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  try {
    const actor = await requireUserAction();
    const input = parsed.data;
    const date = parseDayKey(input.date);
    const now = today();

    if (date > now) {
      return formError("You can't file a report for a future date.", {
        date: "Pick today or an earlier day.",
      });
    }

    const age = differenceInDays(date, now);
    if (age > BACKFILL_LIMIT_DAYS) {
      return formError(
        `Reports can only be filed for the last ${BACKFILL_LIMIT_DAYS} days. Ask an admin to add anything older.`,
        { date: "This date is too far in the past." },
      );
    }

    const existing = await prisma.dailyStatusReport.findUnique({
      where: { userId_date: { userId: actor.id, date } },
      select: { id: true, status: true, submittedAt: true },
    });

    // A reviewed report is closed: reopening it would invalidate the review.
    if (existing && !can.editDsr(actor, { id: actor.id }, existing.status)) {
      return formError(
        "This report has already been reviewed and can no longer be edited. Ask an admin if it needs a correction.",
      );
    }

    const isSubmitting = input.status === "SUBMITTED";

    const report = await prisma.dailyStatusReport.upsert({
      where: { userId_date: { userId: actor.id, date } },
      create: {
        userId: actor.id,
        date,
        tasksCompleted: input.tasksCompleted,
        blockers: input.blockers ?? null,
        nextSteps: input.nextSteps ?? null,
        notes: input.notes ?? null,
        hoursWorked: input.hoursWorked,
        status: input.status,
        submittedAt: isSubmitting ? new Date() : null,
      },
      update: {
        tasksCompleted: input.tasksCompleted,
        blockers: input.blockers ?? null,
        nextSteps: input.nextSteps ?? null,
        notes: input.notes ?? null,
        hoursWorked: input.hoursWorked,
        status: input.status,
        // Preserve the original submission time across later edits.
        submittedAt: isSubmitting ? (existing?.submittedAt ?? new Date()) : null,
        // Editing a flagged report puts it back in the review queue.
        ...(existing?.status === "FLAGGED" && isSubmitting
          ? { reviewComment: null, reviewedAt: null, reviewedById: null }
          : {}),
      },
      select: { id: true },
    });

    if (isSubmitting) {
      await markAttendanceFromReport(actor.id, date, input.hoursWorked);
    }

    await recordAudit({
      actorId: actor.id,
      action: existing ? (isSubmitting ? "dsr.submit" : "dsr.update") : "dsr.create",
      entity: "dsr",
      entityId: report.id,
      meta: { date: input.date, status: input.status, hours: input.hoursWorked },
    });

    revalidatePath("/dsr");
    revalidatePath("/dashboard");
    revalidatePath("/dsr/review");

    return formSuccess(
      isSubmitting
        ? `Report for ${formatDay(date)} submitted.`
        : `Draft saved for ${formatDay(date)}.`,
      { id: report.id, status: input.status },
    );
  } catch (error) {
    return formError(toUserMessage(error, { action: "saveDsr" }));
  }
}

/**
 * Records attendance implicitly when a report is submitted.
 *
 * Only fills a *gap* — an existing record (including an admin override or a
 * leave day) is never touched. Weekend work is left alone too: someone catching
 * up on a Saturday shouldn't have it counted as a working day.
 */
async function markAttendanceFromReport(userId: string, date: Date, hours: number) {
  if (isWeekend(date)) return;

  const existing = await prisma.attendance.findUnique({
    where: { userId_date: { userId, date } },
    select: { id: true },
  });
  if (existing) return;

  const isHoliday = await prisma.holiday.findFirst({
    where: { date, type: { in: ["PUBLIC", "COMPANY"] } },
    select: { id: true },
  });
  if (isHoliday) return;

  await prisma.attendance.create({
    data: {
      userId,
      date,
      // Under four hours reads as a half day, which is what the policy says.
      status: hours > 0 && hours < 4 ? "HALF_DAY" : "PRESENT",
      workedMinutes: Math.round(hours * 60),
      source: "SYSTEM",
      note: "Recorded automatically from the submitted status report.",
    },
  });
}

export async function reviewDsrAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseFormData(dsrReviewSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  try {
    const actor = await requireUserAction();
    const { id, status, comment } = parsed.data;

    const report = await prisma.dailyStatusReport.findUnique({
      where: { id },
      select: {
        id: true,
        date: true,
        status: true,
        user: {
          select: { id: true, name: true, email: true, managerId: true, notifyByEmail: true },
        },
      },
    });

    if (!report) throw errors.notFound("That report");

    if (!can.reviewDsr(actor, { id: report.user.id, managerId: report.user.managerId })) {
      throw errors.forbidden(
        actor.id === report.user.id
          ? "You can't review your own report."
          : "You can only review reports from your own team.",
      );
    }

    if (report.status === "DRAFT") {
      return formError("This report is still a draft — there's nothing to review yet.");
    }

    if (status === "FLAGGED" && !comment) {
      return formError("Add a note so the author knows what needs attention.", {
        comment: "A comment is required when flagging a report.",
      });
    }

    await prisma.dailyStatusReport.update({
      where: { id },
      data: {
        status,
        reviewedById: actor.id,
        reviewedAt: new Date(),
        reviewComment: comment ?? null,
      },
    });

    const flagged = status === "FLAGGED";
    const href = `/dsr/${id}`;

    await notify({
      userId: report.user.id,
      actorId: actor.id,
      type: flagged ? "DSR_FLAGGED" : "DSR_REVIEWED",
      title: flagged
        ? `${actor.name} has a question about your ${formatDay(report.date)} report`
        : `${actor.name} reviewed your ${formatDay(report.date)} report`,
      body: comment ?? null,
      href,
    });

    if (report.user.notifyByEmail) {
      await sendEmail({
        to: report.user.email,
        replyTo: actor.email,
        content: dsrReviewedEmail({
          name: report.user.name,
          reviewerName: actor.name,
          dateLabel: formatDay(report.date),
          flagged,
          comment,
          url: `${env.NEXT_PUBLIC_APP_URL}${href}`,
        }),
      });
    }

    await recordAudit({
      actorId: actor.id,
      action: "dsr.review",
      entity: "dsr",
      entityId: id,
      meta: { status, hasComment: Boolean(comment), author: report.user.id },
    });

    revalidatePath("/dsr/review");
    revalidatePath(`/dsr/${id}`);
    revalidatePath("/dashboard");

    return formSuccess(flagged ? "Report flagged and the author notified." : "Report marked as reviewed.");
  } catch (error) {
    return formError(toUserMessage(error, { action: "reviewDsr" }));
  }
}

/**
 * Bulk review — the reason the review board exists.
 *
 * Reports the actor may not review are filtered out rather than failing the whole
 * batch, and the result says how many were skipped so the outcome is never a
 * silent partial success.
 */
export async function bulkReviewDsrAction(input: {
  ids: string[];
  status: "REVIEWED" | "FLAGGED";
  comment?: string;
}): Promise<FormState> {
  const parsed = dsrBulkReviewSchema.safeParse(input);
  if (!parsed.success) {
    return formError(parsed.error.issues[0]?.message ?? "Select at least one report.");
  }

  try {
    const actor = await requireUserAction();
    const { ids, status, comment } = parsed.data;

    if (status === "FLAGGED" && !comment) {
      return formError("Add a note when flagging reports so authors know what to fix.");
    }

    const reports = await prisma.dailyStatusReport.findMany({
      where: { id: { in: ids }, status: { in: ["SUBMITTED", "FLAGGED", "REVIEWED"] } },
      select: {
        id: true,
        date: true,
        user: { select: { id: true, name: true, email: true, managerId: true, notifyByEmail: true } },
      },
    });

    const permitted = reports.filter((report) =>
      can.reviewDsr(actor, { id: report.user.id, managerId: report.user.managerId }),
    );

    if (permitted.length === 0) {
      return formError("None of the selected reports are yours to review.");
    }

    const now = new Date();
    await prisma.dailyStatusReport.updateMany({
      where: { id: { in: permitted.map((report) => report.id) } },
      data: { status, reviewedById: actor.id, reviewedAt: now, reviewComment: comment ?? null },
    });

    await notifyMany(
      permitted.map((report) => ({
        userId: report.user.id,
        actorId: actor.id,
        type: status === "FLAGGED" ? ("DSR_FLAGGED" as const) : ("DSR_REVIEWED" as const),
        title:
          status === "FLAGGED"
            ? `${actor.name} has a question about your ${formatDay(report.date)} report`
            : `${actor.name} reviewed your ${formatDay(report.date)} report`,
        body: comment ?? null,
        href: `/dsr/${report.id}`,
      })),
    );

    await recordAudit({
      actorId: actor.id,
      action: "dsr.bulk_review",
      entity: "dsr",
      meta: { count: permitted.length, status, requested: ids.length },
    });

    revalidatePath("/dsr/review");
    revalidatePath("/dashboard");

    const skipped = ids.length - permitted.length;
    return formSuccess(
      `${permitted.length} report${permitted.length === 1 ? "" : "s"} marked as ${
        status === "FLAGGED" ? "needing attention" : "reviewed"
      }.${skipped > 0 ? ` ${skipped} skipped — outside your team.` : ""}`,
    );
  } catch (error) {
    return formError(toUserMessage(error, { action: "bulkReviewDsr" }));
  }
}

export async function deleteDsrAction(id: string): Promise<FormState> {
  try {
    const actor = await requireUserAction();

    const report = await prisma.dailyStatusReport.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true, date: true },
    });
    if (!report) throw errors.notFound("That report");

    // Authors may discard their own drafts; anything reviewed is admin-only.
    const isOwnDraft = report.userId === actor.id && report.status === "DRAFT";
    if (!isOwnDraft && actor.role !== "ADMIN") {
      throw errors.forbidden("Only drafts can be deleted, and only by their author.");
    }

    await prisma.dailyStatusReport.delete({ where: { id } });

    await recordAudit({
      actorId: actor.id,
      action: "dsr.delete",
      entity: "dsr",
      entityId: id,
      meta: { date: toDayKey(report.date), author: report.userId },
    });

    revalidatePath("/dsr");
    revalidatePath("/dsr/review");

    return formSuccess("Report deleted.");
  } catch (error) {
    return formError(toUserMessage(error, { action: "deleteDsr" }));
  }
}
