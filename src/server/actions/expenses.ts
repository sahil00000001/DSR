"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { errors, toUserMessage } from "@/lib/errors";
import { can } from "@/lib/auth/rbac";
import { requireUserAction } from "@/lib/auth/session";
import {
  expenseClaimSchema,
  expenseCommentSchema,
  expenseDecisionSchema,
  parseFormData,
} from "@/lib/validation/schemas";
import { differenceInDays, formatDay, parseDayKey, today } from "@/lib/utils/date";
import { formatMoney, parseMoneyToMinor } from "@/lib/utils/format";
import {
  asExpenseStatus,
  EXPENSE_CATEGORY_LABEL,
  type ExpenseCategory,
} from "@/lib/constants/enums";
import { getClaimApprovers, nextClaimNumber } from "@/lib/services/expenses";
import { deleteReceipt, uploadReceipt } from "@/lib/storage/supabase-storage";
import { recordAudit } from "@/lib/services/audit";
import { notify, notifyMany } from "@/lib/services/notifications";
import { sendEmail } from "@/lib/email/mailer";
import { emailableNow, shouldEmailNow } from "@/lib/email/policy";
import { expenseDecisionEmail, expenseSubmittedEmail } from "@/lib/email/templates";
import { formError, formSuccess, type FormState } from "@/server/actions/form-state";

/**
 * Expense claim writes.
 *
 * ## Rules encoded here
 *
 *  • **Amounts are integers in paise.** Parsing happens once, at this boundary.
 *    Nothing downstream ever sees a float.
 *  • **A decided claim is closed.** Once approved, declined or reimbursed it cannot
 *    be edited — otherwise the thing an admin approved isn't the thing on file.
 *    A declined claim is corrected by submitting a new one, which keeps the
 *    original decision auditable.
 *  • **Nobody decides their own claim**, admin included. Same separation as leave.
 *  • **Receipts upload before the row is written**, so a storage failure never
 *    leaves a claim referencing a file that isn't there.
 */

/** How far back a claim may be filed. Older needs finance to handle it directly. */
const CLAIM_WINDOW_DAYS = 120;

/** Guards against a fat-fingered amount being silently accepted. */
const MAX_CLAIM_MINOR = 50_000_000; // ₹5,00,000

export async function saveExpenseClaimAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseFormData(expenseClaimSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  try {
    const actor = await requireUserAction();
    const input = parsed.data;

    const amountMinor = parseMoneyToMinor(input.amount);
    if (amountMinor === null) {
      return formError("That amount doesn't look right.", {
        amount: "Enter a number like 1250 or 1250.50.",
      });
    }
    if (amountMinor <= 0) {
      return formError("The amount has to be more than zero.", { amount: "Enter what you paid." });
    }
    if (amountMinor > MAX_CLAIM_MINOR) {
      return formError(
        `Claims above ${formatMoney(MAX_CLAIM_MINOR)} need to go through finance directly.`,
        { amount: "This is unusually large — check the decimal point." },
      );
    }

    const expenseDate = parseDayKey(input.expenseDate);
    const now = today();

    if (expenseDate > now) {
      return formError("You can't claim for a future date.", {
        expenseDate: "Pick the day you actually paid.",
      });
    }
    if (differenceInDays(expenseDate, now) > CLAIM_WINDOW_DAYS) {
      return formError(
        `Claims must be filed within ${CLAIM_WINDOW_DAYS} days. Speak to finance about anything older.`,
        { expenseDate: "This is outside the claim window." },
      );
    }

    // Receipts are uploaded first: a storage failure must not leave a claim row
    // pointing at a file that was never stored.
    const files = formData
      .getAll("receipts")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);

    if (files.length > 5) {
      return formError("Attach at most five receipts to one claim.");
    }

    const uploaded = [];
    try {
      for (const file of files) {
        uploaded.push(await uploadReceipt(file, actor.id));
      }
    } catch (uploadError) {
      // Roll back whatever did land, so no orphans accumulate.
      await Promise.all(uploaded.map((file) => deleteReceipt(file.storagePath)));
      return formError(toUserMessage(uploadError, { action: "uploadReceipt" }));
    }

    const submitting = input.intent === "SUBMITTED";

    const claim = await prisma.expenseClaim.create({
      data: {
        claimNumber: await nextClaimNumber(),
        userId: actor.id,
        title: input.title,
        description: input.description,
        category: input.category,
        amountMinor,
        expenseDate,
        vendor: input.vendor ?? null,
        referenceNo: input.referenceNo ?? null,
        status: submitting ? "SUBMITTED" : "DRAFT",
        submittedAt: submitting ? new Date() : null,
        attachments: {
          create: uploaded.map((file) => ({
            filename: file.filename,
            mimeType: file.mimeType,
            size: file.size,
            storagePath: file.storagePath,
            // Signed on demand; a stored URL would expire and mislead.
            url: "",
            uploadedById: actor.id,
          })),
        },
      },
      select: { id: true, claimNumber: true },
    });

    if (submitting) {
      await notifyApprovers(claim.id, claim.claimNumber, actor, {
        title: input.title,
        amountMinor,
        category: input.category as ExpenseCategory,
        expenseDate,
      });
    }

    await recordAudit({
      actorId: actor.id,
      action: "expense.create",
      entity: "expense",
      entityId: claim.id,
      meta: {
        claimNumber: claim.claimNumber,
        amountMinor,
        category: input.category,
        status: submitting ? "SUBMITTED" : "DRAFT",
        receipts: uploaded.length,
      },
    });

    revalidatePath("/expenses");
    revalidatePath("/expenses/review");
    revalidatePath("/dashboard");

    return formSuccess(
      submitting
        ? `${claim.claimNumber} submitted for ${formatMoney(amountMinor)}. An admin has been notified.`
        : `${claim.claimNumber} saved as a draft. It isn't visible to anyone else yet.`,
      { id: claim.id, claimNumber: claim.claimNumber },
    );
  } catch (error) {
    return formError(toUserMessage(error, { action: "saveExpenseClaim" }));
  }
}

async function notifyApprovers(
  claimId: string,
  claimNumber: string,
  actor: { id: string; name: string; email: string },
  claim: { title: string; amountMinor: number; category: ExpenseCategory; expenseDate: Date },
) {
  const approvers = await getClaimApprovers(actor.id);

  await notifyMany(
    approvers.map((approver) => ({
      userId: approver.id,
      actorId: actor.id,
      type: "EXPENSE_SUBMITTED" as const,
      title: `${actor.name} claimed ${formatMoney(claim.amountMinor)} — ${claimNumber}`,
      body: `${claim.title} · ${EXPENSE_CATEGORY_LABEL[claim.category]}`,
      // Straight to the claim, not the queue — the decision needs the receipts and
      // the description, and a queue row is one more click away from both.
      href: `/expenses/${claimId}`,
    })),
  );

  // Routine: a claim filed at 3pm can be decided at 6pm with nothing lost.
  for (const approver of emailableNow(approvers, "routine")) {
    await sendEmail({
      to: approver.email,
      replyTo: actor.email,
      content: expenseSubmittedEmail({
        approverName: approver.name,
        claimantName: actor.name,
        claimNumber,
        title: claim.title,
        amount: formatMoney(claim.amountMinor),
        category: EXPENSE_CATEGORY_LABEL[claim.category],
        expenseDate: formatDay(claim.expenseDate),
        reviewUrl: `${env.NEXT_PUBLIC_APP_URL}/expenses/${claimId}`,
      }),
    });
  }
}

/** Submits a draft. Separate from create so the form can save without sending. */
export async function submitExpenseClaimAction(id: string): Promise<FormState> {
  try {
    const actor = await requireUserAction();

    const claim = await prisma.expenseClaim.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
        claimNumber: true,
        title: true,
        amountMinor: true,
        category: true,
        expenseDate: true,
      },
    });
    if (!claim) throw errors.notFound("That claim");
    if (claim.userId !== actor.id) throw errors.forbidden("You can only submit your own claims.");
    if (claim.status !== "DRAFT") {
      return formError(`This claim is already ${asExpenseStatus(claim.status).toLowerCase()}.`);
    }

    await prisma.expenseClaim.update({
      where: { id },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });

    await notifyApprovers(claim.id, claim.claimNumber, actor, {
      title: claim.title,
      amountMinor: claim.amountMinor,
      category: claim.category as ExpenseCategory,
      expenseDate: claim.expenseDate,
    });

    await recordAudit({
      actorId: actor.id,
      action: "expense.submit",
      entity: "expense",
      entityId: id,
      meta: { claimNumber: claim.claimNumber, amountMinor: claim.amountMinor },
    });

    revalidatePath("/expenses");
    revalidatePath(`/expenses/${id}`);
    revalidatePath("/expenses/review");

    return formSuccess(`${claim.claimNumber} submitted for approval.`);
  } catch (error) {
    return formError(toUserMessage(error, { action: "submitExpenseClaim" }));
  }
}

export async function decideExpenseClaimAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseFormData(expenseDecisionSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  try {
    const actor = await requireUserAction();
    const { id, decision, note } = parsed.data;

    const claim = await prisma.expenseClaim.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
        claimNumber: true,
        title: true,
        amountMinor: true,
        category: true,
        expenseDate: true,
        user: { select: { name: true, email: true, notifyByEmail: true, emailDigestOnly: true } },
      },
    });
    if (!claim) throw errors.notFound("That claim");

    if (!can.decideExpense(actor, { id: claim.userId })) {
      throw errors.forbidden(
        claim.userId === actor.id
          ? "You can't decide on your own claim."
          : "Only admins can approve or decline expense claims.",
      );
    }

    if (claim.status !== "SUBMITTED") {
      return formError(
        `This claim is ${asExpenseStatus(claim.status).toLowerCase()} — only submitted claims can be decided.`,
      );
    }

    if (decision === "REJECTED" && !note) {
      return formError("Add a reason so the claimant knows what to correct.", {
        note: "A note is required when declining.",
      });
    }

    await prisma.expenseClaim.update({
      where: { id },
      data: {
        status: decision,
        decidedById: actor.id,
        decidedAt: new Date(),
        decisionNote: note ?? null,
      },
    });

    const approved = decision === "APPROVED";
    const href = `/expenses/${id}`;

    await notify({
      userId: claim.userId,
      actorId: actor.id,
      type: approved ? "EXPENSE_APPROVED" : "EXPENSE_REJECTED",
      title: `${claim.claimNumber} was ${approved ? "approved" : "declined"}`,
      body: `${formatMoney(claim.amountMinor)} · ${claim.title}${note ? ` — ${note}` : ""}`,
      href,
    });

    // The claimant hears about a decision straight away — they are waiting on the money,
    // and a verdict batched until evening reads as being ignored.
    if (shouldEmailNow(claim.user, "urgent")) {
      await sendEmail({
        to: claim.user.email,
        replyTo: actor.email,
        content: expenseDecisionEmail({
          claimantName: claim.user.name,
          deciderName: actor.name,
          approved,
          claimNumber: claim.claimNumber,
          title: claim.title,
          amount: formatMoney(claim.amountMinor),
          category: EXPENSE_CATEGORY_LABEL[claim.category as ExpenseCategory],
          expenseDate: formatDay(claim.expenseDate),
          note,
          detailUrl: `${env.NEXT_PUBLIC_APP_URL}${href}`,
        }),
      });
    }

    await recordAudit({
      actorId: actor.id,
      action: approved ? "expense.approve" : "expense.reject",
      entity: "expense",
      entityId: id,
      meta: {
        claimNumber: claim.claimNumber,
        amountMinor: claim.amountMinor,
        claimant: claim.userId,
        hasNote: Boolean(note),
      },
    });

    revalidatePath("/expenses");
    revalidatePath("/expenses/review");
    revalidatePath(`/expenses/${id}`);
    revalidatePath("/dashboard");

    return formSuccess(
      `${claim.claimNumber} ${approved ? "approved" : "declined"}. ${claim.user.name.split(" ")[0]} has been notified.`,
    );
  } catch (error) {
    return formError(toUserMessage(error, { action: "decideExpenseClaim" }));
  }
}

/** Marks an approved claim as actually paid. */
export async function markReimbursedAction(id: string): Promise<FormState> {
  try {
    const actor = await requireUserAction();
    if (!can.decideExpense(actor, { id: "" })) {
      throw errors.forbidden("Only admins can mark a claim reimbursed.");
    }

    const claim = await prisma.expenseClaim.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true, claimNumber: true, amountMinor: true },
    });
    if (!claim) throw errors.notFound("That claim");

    if (claim.status !== "APPROVED") {
      return formError("Only an approved claim can be marked reimbursed.");
    }

    await prisma.expenseClaim.update({
      where: { id },
      data: { status: "REIMBURSED", reimbursedAt: new Date() },
    });

    await notify({
      userId: claim.userId,
      actorId: actor.id,
      type: "EXPENSE_REIMBURSED",
      title: `${claim.claimNumber} has been reimbursed`,
      body: `${formatMoney(claim.amountMinor)} paid out.`,
      href: `/expenses/${id}`,
    });

    await recordAudit({
      actorId: actor.id,
      action: "expense.reimburse",
      entity: "expense",
      entityId: id,
      meta: { claimNumber: claim.claimNumber, amountMinor: claim.amountMinor },
    });

    revalidatePath("/expenses");
    revalidatePath("/expenses/review");
    revalidatePath(`/expenses/${id}`);

    return formSuccess(`${claim.claimNumber} marked as reimbursed.`);
  } catch (error) {
    return formError(toUserMessage(error, { action: "markReimbursed" }));
  }
}

/** Withdraw your own claim, while it's still open. */
export async function cancelExpenseClaimAction(id: string): Promise<FormState> {
  try {
    const actor = await requireUserAction();

    const claim = await prisma.expenseClaim.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true, claimNumber: true },
    });
    if (!claim) throw errors.notFound("That claim");

    const isOwn = claim.userId === actor.id;
    if (!isOwn && actor.role !== "ADMIN") {
      throw errors.forbidden("You can only withdraw your own claims.");
    }
    if (claim.status !== "DRAFT" && claim.status !== "SUBMITTED") {
      return formError(
        `A ${asExpenseStatus(claim.status).toLowerCase()} claim can't be withdrawn. Ask an admin if it needs reversing.`,
      );
    }

    await prisma.expenseClaim.update({
      where: { id },
      data: { status: "CANCELLED", decidedById: actor.id, decidedAt: new Date() },
    });

    await recordAudit({
      actorId: actor.id,
      action: "expense.cancel",
      entity: "expense",
      entityId: id,
      meta: { claimNumber: claim.claimNumber, wasStatus: claim.status },
    });

    revalidatePath("/expenses");
    revalidatePath("/expenses/review");
    revalidatePath(`/expenses/${id}`);

    return formSuccess(`${claim.claimNumber} withdrawn.`);
  } catch (error) {
    return formError(toUserMessage(error, { action: "cancelExpenseClaim" }));
  }
}

/**
 * Adds a message to the claim thread.
 *
 * This is what makes the module feel "integrated" rather than a form and a verdict:
 * an admin can ask which vehicle a fuel bill was for, and the claimant can answer
 * without opening a new claim.
 */
export async function addExpenseCommentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseFormData(expenseCommentSchema, formData);
  if (!parsed.ok) return formError(parsed.message, parsed.fieldErrors);

  try {
    const actor = await requireUserAction();
    const { claimId, body } = parsed.data;

    const claim = await prisma.expenseClaim.findUnique({
      where: { id: claimId },
      select: {
        id: true,
        userId: true,
        claimNumber: true,
        user: { select: { managerId: true } },
      },
    });
    if (!claim) throw errors.notFound("That claim");

    if (!can.viewExpense(actor, { id: claim.userId, managerId: claim.user.managerId })) {
      throw errors.forbidden("You can't comment on this claim.");
    }

    await prisma.expenseComment.create({
      data: { claimId, authorId: actor.id, body },
    });

    // Tell the other side. If the claimant commented, notify the admins; if an
    // admin commented, notify the claimant.
    if (actor.id === claim.userId) {
      const approvers = await getClaimApprovers(actor.id);
      await notifyMany(
        approvers.map((approver) => ({
          userId: approver.id,
          actorId: actor.id,
          type: "EXPENSE_COMMENT" as const,
          title: `${actor.name} replied on ${claim.claimNumber}`,
          body,
          href: `/expenses/${claimId}`,
        })),
      );
    } else {
      await notify({
        userId: claim.userId,
        actorId: actor.id,
        type: "EXPENSE_COMMENT",
        title: `${actor.name} commented on ${claim.claimNumber}`,
        body,
        href: `/expenses/${claimId}`,
      });
    }

    revalidatePath(`/expenses/${claimId}`);
    return formSuccess("Comment added.");
  } catch (error) {
    return formError(toUserMessage(error, { action: "addExpenseComment" }));
  }
}
