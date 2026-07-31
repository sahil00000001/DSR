"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheck, Plane, X, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PersonCell } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { cancelLeaveAction, decideLeaveAction } from "@/server/actions/leave";
import { LEAVE_COLOR } from "@/lib/charts/palette";
import {
  LEAVE_STATUS_LABEL,
  LEAVE_STATUS_TONE,
  LEAVE_TYPE_SHORT,
  type LeaveStatus,
  type LeaveType,
} from "@/lib/constants/enums";
import { formatDayRange, formatRelative } from "@/lib/utils/date";
import { formatLeaveDays, truncate } from "@/lib/utils/format";

export interface LeaveRowDto {
  id: string;
  type: LeaveType;
  status: LeaveStatus;
  startDate: Date;
  endDate: Date;
  days: number;
  halfDay: boolean;
  reason: string;
  decisionNote: string | null;
  createdAt: Date;
  user: {
    id: string;
    name: string;
    avatarUrl: string | null;
    department: string | null;
  };
  decidedBy: { id: string; name: string } | null;
  /** Whether the viewer may approve/decline this row. */
  canDecide: boolean;
  /** Whether the viewer may withdraw it. */
  canCancel: boolean;
}

/**
 * Leave request table.
 *
 * Serves both "my requests" and the approval queue — the difference is whether
 * the author column is shown and which actions the server said are permitted.
 * `canDecide` / `canCancel` are computed server-side from the policy, so the row
 * never offers a button the action would reject.
 */
export function LeaveTable({
  rows,
  showAuthor,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: {
  rows: LeaveRowDto[];
  showAuthor: boolean;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: React.ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();

  const decide = async (row: LeaveRowDto, decision: "APPROVED" | "REJECTED") => {
    const approving = decision === "APPROVED";

    const result = await confirm({
      title: approving
        ? `Approve ${row.user.name}'s leave?`
        : `Decline ${row.user.name}'s request?`,
      description: `${formatDayRange({ start: row.startDate, end: row.endDate })} · ${formatLeaveDays(
        row.days,
      )} of ${LEAVE_TYPE_SHORT[row.type].toLowerCase()} leave.${
        approving ? " Their balance and attendance are updated automatically." : ""
      }`,
      confirmLabel: approving ? "Approve" : "Decline",
      tone: approving ? "default" : "danger",
      prompt: {
        label: approving ? "Note (optional)" : "Reason",
        placeholder: approving
          ? "Approved — enjoy the break."
          : "We have two people out that week already. Could you shift it by a few days?",
        required: !approving,
        hint: "Included in the email they receive.",
      },
    });

    if (!result.confirmed) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", row.id);
      formData.set("decision", decision);
      if (result.note) formData.set("note", result.note);

      const response = await decideLeaveAction({ ok: null }, formData);
      if (response.ok) {
        toast.success(response.message ?? "Decision saved");
        router.refresh();
      } else {
        toast.error("Couldn't save the decision", response.message);
      }
    });
  };

  const cancel = async (row: LeaveRowDto) => {
    const result = await confirm({
      title: "Withdraw this request?",
      description:
        row.status === "APPROVED"
          ? "The days go back to your balance and the attendance entries are removed."
          : "The reserved days are returned to your balance.",
      confirmLabel: "Withdraw request",
      tone: "danger",
    });
    if (!result.confirmed) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", row.id);
      const response = await cancelLeaveAction({ ok: null }, formData);
      if (response.ok) {
        toast.success(response.message ?? "Request withdrawn");
        router.refresh();
      } else {
        toast.error("Couldn't withdraw the request", response.message);
      }
    });
  };

  const columns: Array<Column<LeaveRowDto>> = [
    ...(showAuthor
      ? [
          {
            id: "person",
            header: "Person",
            sortable: true,
            sortValue: (row: LeaveRowDto) => row.user.name,
            cell: (row: LeaveRowDto) => (
              <PersonCell
                name={row.user.name}
                seed={row.user.id}
                src={row.user.avatarUrl}
                size="sm"
                meta={row.user.department ?? undefined}
              />
            ),
          } satisfies Column<LeaveRowDto>,
        ]
      : []),
    {
      id: "type",
      header: "Type",
      width: "1%",
      cell: (row) => (
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: LEAVE_COLOR[row.type] }}
          />
          {LEAVE_TYPE_SHORT[row.type]}
        </span>
      ),
    },
    {
      id: "dates",
      header: "Dates",
      sortable: true,
      sortValue: (row) => row.startDate,
      cell: (row) => (
        <span className="whitespace-nowrap">
          {formatDayRange({ start: row.startDate, end: row.endDate })}
          {row.halfDay ? <span className="ml-1 text-fg-subtle">(½)</span> : null}
        </span>
      ),
    },
    {
      id: "days",
      header: "Days",
      align: "right",
      width: "1%",
      sortable: true,
      sortValue: (row) => row.days,
      cell: (row) => <span className="tabular-nums">{row.days}</span>,
    },
    {
      id: "reason",
      header: "Reason",
      hideBelow: "lg",
      cell: (row) => (
        <span className="block max-w-[22rem] text-fg-muted" title={row.reason}>
          {truncate(row.reason, 90)}
        </span>
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
          <Badge tone={LEAVE_STATUS_TONE[row.status]} size="sm" dot>
            {LEAVE_STATUS_LABEL[row.status]}
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
                aria-label={`Decline ${row.user.name}'s request`}
              >
                <XCircle className="size-3.5" />
                <span className="hidden sm:inline">Decline</span>
              </Button>
              <Button
                variant="primary"
                size="xs"
                onClick={() => decide(row, "APPROVED")}
                disabled={isPending}
                aria-label={`Approve ${row.user.name}'s request`}
              >
                <CheckCheck className="size-3.5" />
                <span className="hidden sm:inline">Approve</span>
              </Button>
            </>
          ) : row.canCancel ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => cancel(row)}
              disabled={isPending}
              aria-label="Withdraw this request"
            >
              <X className="size-3.5" />
              Withdraw
            </Button>
          ) : (
            <Link
              href={`/leave/${row.id}`}
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
      caption="Leave requests"
      defaultSort={{ id: "dates", direction: "desc" }}
      empty={
        <EmptyState
          icon={<Plane className="size-5" />}
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
        />
      }
    />
  );
}
