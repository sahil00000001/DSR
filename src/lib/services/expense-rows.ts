import "server-only";
import { can, type Actor } from "@/lib/auth/rbac";
import type { ExpenseClaimDto } from "@/lib/services/expenses";
import type { ExpenseRowDto } from "@/components/expenses/expense-table";

/**
 * Maps a claim to the table's row DTO, resolving permissions server-side.
 *
 * Both `/expenses` and `/expenses/review` render the same table, and both need the
 * identical `canDecide`/`canCancel`/`canSubmit` computation. Duplicating that in two
 * page files is exactly how a queue ends up offering a button the action rejects —
 * so it lives here, once, next to the policy it consults.
 */
export function toExpenseRow(claim: ExpenseClaimDto, actor: Actor): ExpenseRowDto {
  const subject = { id: claim.user.id, managerId: claim.user.managerId };

  return {
    id: claim.id,
    claimNumber: claim.claimNumber,
    title: claim.title,
    category: claim.category,
    amountMinor: claim.amountMinor,
    currency: claim.currency,
    expenseDate: claim.expenseDate,
    status: claim.status,
    vendor: claim.vendor,
    attachmentCount: claim.attachmentCount,
    createdAt: claim.createdAt,
    user: {
      id: claim.user.id,
      name: claim.user.name,
      avatarUrl: claim.user.avatarUrl,
      department: claim.user.department?.name ?? null,
    },
    decidedBy: claim.decidedBy,
    canDecide: claim.status === "SUBMITTED" && can.decideExpense(actor, subject),
    canCancel: can.cancelExpense(actor, subject, claim.status),
    canSubmit: claim.status === "DRAFT" && claim.user.id === actor.id,
  };
}
