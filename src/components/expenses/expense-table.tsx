"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheck, Paperclip, Receipt, Send, X, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PersonCell } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import {
  cancelExpenseClaimAction,
  decideExpenseClaimAction,
  submitExpenseClaimAction,
} from "@/server/actions/expenses";
import {
  EXPENSE_CATEGORY_LABEL,
  EXPENSE_STATUS_LABEL,
  EXPENSE_STATUS_TONE,
  type ExpenseCategory,
  type ExpenseStatus,
} from "@/lib/constants/enums";
import { formatDay, formatRelative } from "@/lib/utils/date";
import { formatMoney, truncate } from "@/lib/utils/format";

export interface ExpenseRowDto {
  id: string;
  claimNumber: string;
  title: string;
  category: ExpenseCategory;
  amountMinor: number;
  currency: string;
  expenseDate: Date;
  status: ExpenseStatus;
  vendor: string | null;
  attachmentCount: number;
  createdAt: Date;
  user: { id: string; name: string; avatarUrl: string | null; department: string | null };
  decidedBy: { id: string; name: string } | null;
  /** Server-computed from the RBAC policy — the row never offers a rejected action. */
  canDecide: boolean;
  canCancel: boolean;
  canSubmit: boolean;
}

/**
 * Claim table.
 *
 * Serves "my claims" and the admin review queue; the difference is the author column
 * and which actions the server said are permitted. Declining always asks for a note —
 * the confirm dialog makes it required — because "declined" with no reason gives the
 * claimant nothing to act on.
 */
export function ExpenseTable({
  rows,
  showAuthor,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: {
  rows: ExpenseRowDto[];
  showAuthor: boolean;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: React.ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();

  const decide = async (row: ExpenseRowDto, decision: "APPROVED" | "REJECTED") => {
    const approving = decision === "APPROVED";

    const result = await confirm({
      title: approving
        ? `Approve ${formatMoney(row.amountMinor)} for ${row.user.name.split(" ")[0]}?`
        : `Decline ${row.claimNumber}?`,
      description: `${row.title} · ${EXPENSE_CATEGORY_LABEL[row.category]} · ${formatDay(
        row.expenseDate,
      )}${
        approving
          ? ". It moves to the payout list and can be marked reimbursed once paid."
          : ""
      }`,
      confirmLabel: approving ? "Approve claim" : "Decline claim",
      tone: approving ? "default" : "danger",
      prompt: {
        label: approving ? "Note (optional)" : "Reason",
        placeholder: approving
          ? "Approved — will go out with this month's payout."
          : "The bill is for two people. Please split it and re-file your share.",
        required: !approving,
        hint: "Included in the email they receive, and shown on the claim.",
      },
    });

    if (!result.confirmed) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", row.id);
      formData.set("decision", decision);
      if (result.note) formData.set("note", result.note);

      const response = await decideExpenseClaimAction({ ok: null }, formData);
      if (response.ok) {
        toast.success(response.message ?? "Decision saved");
        router.refresh();
      } else {
        toast.error("Couldn't save the decision", response.message);
      }
    });
  };

  const submit = (row: ExpenseRowDto) => {
    startTransition(async () => {
      const response = await submitExpenseClaimAction(row.id);
      if (response.ok) {
        toast.success(response.message ?? "Submitted");
        router.refresh();
      } else {
        toast.error("Couldn't submit the claim", response.message);
      }
    });
  };

  const cancel = async (row: ExpenseRowDto) => {
    const result = await confirm({
      title: `Withdraw ${row.claimNumber}?`,
      description:
        row.status === "SUBMITTED"
          ? "It disappears from the admin's queue. You can file a fresh claim any time."
          : "The draft and its receipts are kept, but the claim is closed.",
      confirmLabel: "Withdraw claim",
      tone: "danger",
    });
    if (!result.confirmed) return;

    startTransition(async () => {
      const response = await cancelExpenseClaimAction(row.id);
      if (response.ok) {
        toast.success(response.message ?? "Withdrawn");
        router.refresh();
      } else {
        toast.error("Couldn't withdraw the claim", response.message);
      }
    });
  };

  const columns: Array<Column<ExpenseRowDto>> = [
    ...(showAuthor
      ? [
          {
            id: "person",
            header: "Person",
            sortable: true,
            sortValue: (row: ExpenseRowDto) => row.user.name,
            cell: (row: ExpenseRowDto) => (
              <PersonCell
                name={row.user.name}
                seed={row.user.id}
                src={row.user.avatarUrl}
                size="sm"
                meta={row.user.department ?? undefined}
              />
            ),
          } satisfies Column<ExpenseRowDto>,
        ]
      : []),
    {
      id: "claim",
      header: "Claim",
      sortable: true,
      sortValue: (row) => row.title,
      cell: (row) => (
        <span className="block min-w-0">
          <Link
            href={`/expenses/${row.id}`}
            className="block max-w-[24rem] truncate font-medium text-fg underline-offset-2 hover:underline"
            title={row.title}
          >
            {truncate(row.title, 70)}
          </Link>
          <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-fg-subtle">
            <span className="font-mono tabular-nums">{row.claimNumber}</span>
            <span aria-hidden="true">·</span>
            {EXPENSE_CATEGORY_LABEL[row.category]}
            {row.attachmentCount > 0 ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-0.5">
                  <Paperclip className="size-2.5" aria-hidden="true" />
                  {row.attachmentCount}
                </span>
              </>
            ) : null}
          </span>
        </span>
      ),
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      width: "1%",
      sortable: true,
      sortValue: (row) => row.amountMinor,
      cell: (row) => (
        <span className="font-medium whitespace-nowrap tabular-nums text-fg">
          {formatMoney(row.amountMinor, row.currency)}
        </span>
      ),
    },
    {
      id: "date",
      header: "Spent on",
      width: "1%",
      sortable: true,
      sortValue: (row) => row.expenseDate,
      cell: (row) => <span className="whitespace-nowrap">{formatDay(row.expenseDate)}</span>,
    },
    {
      id: "vendor",
      header: "Paid to",
      hideBelow: "lg",
      cell: (row) => (
        <span className="text-fg-muted">{row.vendor ?? <span className="text-fg-subtle">—</span>}</span>
      ),
    },
    {
      id: "status",
      header: "Status",
      width: "1%",
      sortable: true,
      sortValue: (row) => row.status,
      cell: (row) => (
        <span className="flex flex-col items-start gap-1">
          <Badge tone={EXPENSE_STATUS_TONE[row.status]} size="sm" dot>
            {EXPENSE_STATUS_LABEL[row.status]}
          </Badge>
          {row.decidedBy ? (
            <span className="text-[10.5px] whitespace-nowrap text-fg-subtle">
              by {row.decidedBy.name.split(" ")[0]}
            </span>
          ) : (
            <span className="text-[10.5px] whitespace-nowrap text-fg-subtle">
              {formatRelative(row.createdAt)}
            </span>
          )}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      width: "1%",
      cell: (row) => (
        <div className="flex items-center justify-end gap-1 whitespace-nowrap">
          {row.canDecide ? (
            <>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => decide(row, "REJECTED")}
                disabled={isPending}
                aria-label={`Decline ${row.claimNumber}`}
              >
                <XCircle className="size-3.5" />
                <span className="hidden sm:inline">Decline</span>
              </Button>
              <Button
                variant="primary"
                size="xs"
                onClick={() => decide(row, "APPROVED")}
                disabled={isPending}
                aria-label={`Approve ${row.claimNumber}`}
              >
                <CheckCheck className="size-3.5" />
                <span className="hidden sm:inline">Approve</span>
              </Button>
            </>
          ) : row.canSubmit ? (
            <>
              {row.canCancel ? (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => cancel(row)}
                  disabled={isPending}
                  aria-label={`Withdraw ${row.claimNumber}`}
                >
                  <X className="size-3.5" />
                </Button>
              ) : null}
              <Button
                variant="primary"
                size="xs"
                onClick={() => submit(row)}
                disabled={isPending}
                aria-label={`Submit ${row.claimNumber} for approval`}
              >
                <Send className="size-3.5" />
                Submit
              </Button>
            </>
          ) : row.canCancel ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => cancel(row)}
              disabled={isPending}
              aria-label={`Withdraw ${row.claimNumber}`}
            >
              <X className="size-3.5" />
              Withdraw
            </Button>
          ) : (
            <Link
              href={`/expenses/${row.id}`}
              className="text-[12px] font-medium text-accent underline-offset-2 hover:underline"
            >
              View
            </Link>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      data={rows}
      columns={columns}
      rowKey={(row) => row.id}
      caption="Expense claims"
      defaultSort={{ id: "date", direction: "desc" }}
      empty={
        <EmptyState
          icon={<Receipt className="size-5" />}
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
        />
      }
    />
  );
}
