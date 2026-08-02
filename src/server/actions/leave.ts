"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { errors, toUserMessage } from "@/lib/errors";
import { can } from "@/lib/auth/rbac";
import { requireUserAction } from "@/lib/auth/session";
import {
  leaveCancelSchema,
  leaveDecisionSchema,
  leaveRequestSchema,
  parseFormData,
} from "@/lib/validation/schemas";
import {
  eachDay,
  formatDayRange,
  parseDayKey,
  subDays,
  toDayKey,
  today,
} from "@/lib/utils/date";
import { formatLeaveDays } from "@/lib/utils/format";
import {
  LEAVE_TYPE_LABEL,
  type BalancedLeaveType,
  type LeaveType,
} from "@/lib/constants/enums";
import { calculateLeaveDays, findOverlappingLeave, getApproversFor, getBalanceFor } from "@/lib/services/leave";
import { recordAudit } from "@/lib/services/audit";
import { notify, notifyMany } from "@/lib/services/notifications";
import { sendEmail } from "@/lib/email/mailer";
import { emailableNow, shouldEmailNow } from "@/lib/email/policy";
import { leaveDecisionEmail, leaveSubmittedEmail } from "@/lib/email/templates";
import { formError, formSuccess, type FormState } from "@/server/actions/form-state";

/**
 * Leave workflow.
 *
 * ## The balance invariant
 *
 * `allocated = used + pending + available` must hold at every moment. Requesting
 * moves days into `pending`; approving moves them from `pending` to `used`;
 * rejecting or cancelling releases them. Each of those transitions runs inside a
 * `$transaction` together with the status change, so a crash can never leave
 * balance reserved against a request that no longer exists.
 *
 * ## Attendance coupling
 *
 * Approving leave writes LEAVE attendance rows for the affected working days, and
 * cancelling an already-approved request removes them again. That's what keeps the
 * attendance board honest without a nightly reconciliation job.
 */

const isBalanced = (type: LeaveType): type is BalancedLeaveType => type !== "UNPAID";

export async function requestLeaveAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseFormData(leaveRequestSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  try {
    const actor = await requireUserAction();
    const input = parsed.data;
    const type = input.type as LeaveType;

    const range = { start: parseDayKey(input.startDate), end: parseDayKey(input.endDate) };

    // A little backdating is legitimate (sick leave); a lot is a data-entry error.
    if (range.start < subDays(today(), 30)) {
      return formError("Leave can only be requested up to 30 days in the past.", {
        startDate: "This date is too far in the past.",
      });
    }

    const { days } = await calculateLeaveDays(range, input.halfDay);

    if (days <= 0) {
      return formError(
        "Those dates contain no working days — weekends and public holidays don't need a leave request.",
        { startDate: "Pick at least one working day." },
      );
    }

    const overlapping = await findOverlappingLeave(actor.id, range);
    if (overlapping.length > 0) {
      const clash = overlapping[0]!;
      return formError(
        `This overlaps a request you already have for ${formatDayRange({
          start: clash.startDate,
          end: clash.endDate,
        })} (${clash.status.toLowerCase()}).`,
      );
    }

    // Unpaid leave is unlimited, so it has no balance to check.
    if (isBalanced(type)) {
      const balance = await getBalanceFor(actor.id, type);
      if (balance && days > balance.available) {
        return formError(
          `You only have ${formatLeaveDays(balance.available)} of ${LEAVE_TYPE_LABEL[
            type
          ].toLowerCase()} left this year${
            balance.pending > 0 ? ` (${formatLeaveDays(balance.pending)} is already awaiting a decision)` : ""
          }. Choose unpaid leave, or fewer days.`,
          { type: "Not enough balance for this request." },
        );
      }
    }

    const request = await prisma.$transaction(async (tx) => {
      const created = await tx.leaveRequest.create({
        data: {
          userId: actor.id,
          type,
          startDate: range.start,
          endDate: range.end,
          days,
          halfDay: input.halfDay,
          reason: input.reason,
          status: "PENDING",
        },
        select: { id: true },
      });

      // Reserve the days immediately — see the balance invariant above.
      if (isBalanced(type)) {
        await tx.leaveBalance.update({
          where: {
            userId_year_type: { userId: actor.id, year: range.start.getUTCFullYear(), type },
          },
          data: { pending: { increment: days } },
        });
      }

      return created;
    });

    const approvers = await getApproversFor(actor.id);
    const balanceAfter = isBalanced(type) ? await getBalanceFor(actor.id, type) : null;

    await notifyMany(
      approvers.map((approver) => ({
        userId: approver.id,
        actorId: actor.id,
        type: "LEAVE_SUBMITTED" as const,
        title: `${actor.name} requested ${formatLeaveDays(days)} of ${LEAVE_TYPE_LABEL[type].toLowerCase()}`,
        body: `${formatDayRange(range)} — ${input.reason}`,
        href: "/leave/approvals",
      })),
    );

    // Routine: leave is nearly always for a future date.
    for (const approver of emailableNow(approvers, "routine")) {
      await sendEmail({
        to: approver.email,
        replyTo: actor.email,
        content: leaveSubmittedEmail({
          approverName: approver.name,
          requesterName: actor.name,
          leaveType: LEAVE_TYPE_LABEL[type],
          dateRange: formatDayRange(range),
          days: formatLeaveDays(days),
          reason: input.reason,
          reviewUrl: `${env.NEXT_PUBLIC_APP_URL}/leave/approvals`,
          balanceAfter: balanceAfter
            ? `${formatLeaveDays(Math.max(0, balanceAfter.available))} remaining`
            : "Unpaid — no balance",
        }),
      });
    }

    await recordAudit({
      actorId: actor.id,
      action: "leave.request",
      entity: "leave",
      entityId: request.id,
      meta: { type, days, range: `${input.startDate}→${input.endDate}` },
    });

    revalidatePath("/leave");
    revalidatePath("/leave/approvals");
    revalidatePath("/dashboard");

    return formSuccess(
      `Request submitted for ${formatDayRange(range)}. ${
        approvers.length === 1 ? approvers[0]!.name : "Your approvers"
      } ${approvers.length === 1 ? "has" : "have"} been notified.`,
      { id: request.id },
    );
  } catch (error) {
    return formError(toUserMessage(error, { action: "requestLeave" }));
  }
}

export async function decideLeaveAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseFormData(leaveDecisionSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  try {
    const actor = await requireUserAction();
    const { id, decision, note } = parsed.data;

    const request = await prisma.leaveRequest.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        type: true,
        status: true,
        startDate: true,
        endDate: true,
        days: true,
        halfDay: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            managerId: true,
            notifyByEmail: true,
            emailDigestOnly: true,
          },
        },
      },
    });

    if (!request) throw errors.notFound("That leave request");

    if (!can.decideLeave(actor, { id: request.userId, managerId: request.user.managerId })) {
      throw errors.forbidden(
        actor.id === request.userId
          ? "You can't decide on your own leave request."
          : "You can only decide on requests from your own team.",
      );
    }

    if (request.status !== "PENDING") {
      return formError(`This request was already ${request.status.toLowerCase()}.`);
    }

    const type = request.type as LeaveType;
    const approved = decision === "APPROVED";
    const year = request.startDate.getUTCFullYear();

    await prisma.$transaction(async (tx) => {
      await tx.leaveRequest.update({
        where: { id },
        data: {
          status: decision,
          decidedById: actor.id,
          decidedAt: new Date(),
          decisionNote: note ?? null,
        },
      });

      if (isBalanced(type)) {
        await tx.leaveBalance.update({
          where: { userId_year_type: { userId: request.userId, year, type } },
          data: approved
            ? // Reserved days become consumed days.
              { pending: { decrement: request.days }, used: { increment: request.days } }
            : // Declined: release the reservation.
              { pending: { decrement: request.days } },
        });
      }

      if (approved) {
        // Write LEAVE attendance for each working day the request covers.
        const holidays = await tx.holiday.findMany({
          where: {
            date: { gte: request.startDate, lte: request.endDate },
            type: { in: ["PUBLIC", "COMPANY"] },
          },
          select: { date: true },
        });
        const holidayKeys = new Set(holidays.map((holiday) => toDayKey(holiday.date)));

        for (const day of eachDay({ start: request.startDate, end: request.endDate })) {
          const dow = day.getUTCDay();
          if (dow === 0 || dow === 6) continue;
          if (holidayKeys.has(toDayKey(day))) continue;

          await tx.attendance.upsert({
            where: { userId_date: { userId: request.userId, date: day } },
            create: {
              userId: request.userId,
              date: day,
              // A half day of leave still means half a day worked.
              status: request.halfDay ? "HALF_DAY" : "LEAVE",
              source: "SYSTEM",
              note: `Approved ${type.toLowerCase()} leave`,
            },
            update: {
              status: request.halfDay ? "HALF_DAY" : "LEAVE",
              source: "SYSTEM",
              note: `Approved ${type.toLowerCase()} leave`,
            },
          });
        }
      }
    });

    const balance = isBalanced(type) ? await getBalanceFor(request.userId, type, year) : null;
    const range = { start: request.startDate, end: request.endDate };
    const href = `/leave/${id}`;

    await notify({
      userId: request.userId,
      actorId: actor.id,
      type: approved ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
      title: `Your leave request was ${approved ? "approved" : "declined"}`,
      body: `${formatDayRange(range)} · ${LEAVE_TYPE_LABEL[type]}${note ? ` — ${note}` : ""}`,
      href,
    });

    // A decision on time off changes somebody's plans, so it goes out immediately.
    if (shouldEmailNow(request.user, "urgent")) {
      await sendEmail({
        to: request.user.email,
        replyTo: actor.email,
        content: leaveDecisionEmail({
          requesterName: request.user.name,
          deciderName: actor.name,
          approved,
          leaveType: LEAVE_TYPE_LABEL[type],
          dateRange: formatDayRange(range),
          days: formatLeaveDays(request.days),
          note,
          remainingBalance: balance
            ? `${formatLeaveDays(balance.available)} of ${LEAVE_TYPE_LABEL[type].toLowerCase()}`
            : "Unpaid — no balance",
          detailUrl: `${env.NEXT_PUBLIC_APP_URL}${href}`,
        }),
      });
    }

    await recordAudit({
      actorId: actor.id,
      action: approved ? "leave.approve" : "leave.reject",
      entity: "leave",
      entityId: id,
      meta: { requester: request.userId, type, days: request.days, hasNote: Boolean(note) },
    });

    revalidatePath("/leave");
    revalidatePath("/leave/approvals");
    revalidatePath("/attendance");
    revalidatePath("/dashboard");

    return formSuccess(
      `${request.user.name}'s request has been ${approved ? "approved" : "declined"} and they've been notified.`,
    );
  } catch (error) {
    return formError(toUserMessage(error, { action: "decideLeave" }));
  }
}

export async function cancelLeaveAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseFormData(leaveCancelSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  try {
    const actor = await requireUserAction();
    const { id } = parsed.data;

    const request = await prisma.leaveRequest.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        type: true,
        status: true,
        days: true,
        startDate: true,
        endDate: true,
        user: { select: { name: true, managerId: true } },
      },
    });

    if (!request) throw errors.notFound("That leave request");

    if (!can.cancelLeave(actor, { id: request.userId }, request.status)) {
      throw errors.forbidden(
        request.status === "PENDING"
          ? "You can only cancel your own pending requests."
          : "Only an admin can cancel a request that's already been decided.",
      );
    }

    if (request.status === "CANCELLED" || request.status === "REJECTED") {
      return formError(`This request is already ${request.status.toLowerCase()}.`);
    }

    const type = request.type as LeaveType;
    const wasApproved = request.status === "APPROVED";
    const year = request.startDate.getUTCFullYear();

    await prisma.$transaction(async (tx) => {
      await tx.leaveRequest.update({
        where: { id },
        data: { status: "CANCELLED", decidedById: actor.id, decidedAt: new Date() },
      });

      if (isBalanced(type)) {
        await tx.leaveBalance.update({
          where: { userId_year_type: { userId: request.userId, year, type } },
          // Release from whichever bucket the days were sitting in.
          data: wasApproved
            ? { used: { decrement: request.days } }
            : { pending: { decrement: request.days } },
        });
      }

      if (wasApproved) {
        // Undo the attendance rows this approval created — but only ours, so an
        // admin's manual override on one of those days survives.
        await tx.attendance.deleteMany({
          where: {
            userId: request.userId,
            date: { gte: request.startDate, lte: request.endDate },
            source: "SYSTEM",
            status: { in: ["LEAVE", "HALF_DAY"] },
          },
        });
      }
    });

    // Tell the other party, whoever that is.
    if (actor.id !== request.userId) {
      await notify({
        userId: request.userId,
        actorId: actor.id,
        type: "LEAVE_CANCELLED",
        title: `${actor.name} cancelled your leave request`,
        body: formatDayRange({ start: request.startDate, end: request.endDate }),
        href: `/leave/${id}`,
      });
    } else {
      const approvers = await getApproversFor(actor.id);
      await notifyMany(
        approvers.map((approver) => ({
          userId: approver.id,
          actorId: actor.id,
          type: "LEAVE_CANCELLED" as const,
          title: `${actor.name} withdrew a leave request`,
          body: formatDayRange({ start: request.startDate, end: request.endDate }),
          href: "/leave/approvals",
        })),
      );
    }

    await recordAudit({
      actorId: actor.id,
      action: "leave.cancel",
      entity: "leave",
      entityId: id,
      meta: { requester: request.userId, type, days: request.days, wasApproved },
    });

    revalidatePath("/leave");
    revalidatePath("/leave/approvals");
    revalidatePath("/attendance");

    return formSuccess("Leave request cancelled and the balance released.");
  } catch (error) {
    return formError(toUserMessage(error, { action: "cancelLeave" }));
  }
}
