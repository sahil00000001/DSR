import {
  BadgeCheck,
  Ban,
  FilePlus2,
  IndianRupee,
  Send,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { EXPENSE_STATUS_MEANING, type ExpenseStatus } from "@/lib/constants/enums";
import { formatDateTime } from "@/lib/utils/date";

/**
 * The claim's life so far, as a vertical timeline.
 *
 * This is the answer to the brief's "the person who filed it can track it cleanly
 * and see how it's going". A status badge alone says *where* a claim is; this says
 * how it got there, who moved it, and — for the step it's sitting on — what happens
 * next. Steps that haven't happened yet are shown greyed rather than hidden, so
 * the claimant can see the whole route the money takes before they chase anyone.
 */

type StepState = "done" | "current" | "upcoming" | "failed";

interface Step {
  key: string;
  label: string;
  icon: LucideIcon;
  at: Date | null;
  by?: string | null;
  state: StepState;
  note?: string | null;
  detail?: string;
}

export function ExpenseTimeline({
  status,
  createdAt,
  submittedAt,
  decidedAt,
  decidedByName,
  decisionNote,
  reimbursedAt,
  claimantFirstName,
}: {
  status: ExpenseStatus;
  createdAt: Date;
  submittedAt: Date | null;
  decidedAt: Date | null;
  decidedByName: string | null;
  decisionNote: string | null;
  reimbursedAt: Date | null;
  claimantFirstName: string;
}) {
  const withdrawn = status === "CANCELLED";
  const declined = status === "REJECTED";
  const approved = status === "APPROVED" || status === "REIMBURSED";
  const paid = status === "REIMBURSED";

  const steps: Step[] = [
    {
      key: "filed",
      label: "Claim filed",
      icon: FilePlus2,
      at: createdAt,
      by: claimantFirstName,
      state: "done",
    },
    {
      key: "submitted",
      label: submittedAt ? "Sent for approval" : "Not sent yet",
      icon: Send,
      at: submittedAt,
      state: submittedAt ? "done" : status === "DRAFT" ? "current" : "upcoming",
      detail: submittedAt ? undefined : EXPENSE_STATUS_MEANING.DRAFT,
    },
  ];

  if (withdrawn) {
    steps.push({
      key: "withdrawn",
      label: "Withdrawn",
      icon: Ban,
      at: decidedAt,
      state: "failed",
      detail: "No decision was made — nothing is owed.",
    });
  } else {
    steps.push({
      key: "decision",
      label: declined ? "Declined" : approved ? "Approved" : "Awaiting a decision",
      icon: declined ? XCircle : BadgeCheck,
      at: decidedAt,
      by: decidedByName,
      state: declined ? "failed" : approved ? "done" : submittedAt ? "current" : "upcoming",
      note: decisionNote,
      detail:
        !decidedAt && submittedAt
          ? "An admin reviews the receipts and either approves it or asks for a change."
          : undefined,
    });

    if (!declined) {
      steps.push({
        key: "reimbursed",
        label: paid ? "Reimbursed" : "Payment",
        icon: IndianRupee,
        at: reimbursedAt,
        state: paid ? "done" : approved ? "current" : "upcoming",
        detail: paid
          ? "Paid out in full."
          : approved
            ? "Approved and queued for the next payout run."
            : undefined,
      });
    }
  }

  return (
    <ol className="relative space-y-0">
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        const Icon = step.icon;

        return (
          <li key={step.key} className="relative flex gap-3 pb-4 last:pb-0">
            {/* Connector, drawn behind the marker and stopped at the last step. */}
            {!last ? (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-6 left-[11px] w-px",
                  // Reach into the next row's marker rather than stopping short.
                  "bottom-[-2px]",
                  step.state === "done" ? "bg-accent/35" : "bg-border",
                )}
              />
            ) : null}

            <span
              aria-hidden="true"
              className={cn(
                "relative z-1 grid size-[23px] shrink-0 place-items-center rounded-full border",
                step.state === "done" && "border-accent/30 bg-accent-soft text-accent",
                step.state === "current" &&
                  "border-warning/40 bg-warning-soft text-warning-text shadow-[0_0_0_3px_var(--color-warning-soft)]",
                step.state === "failed" && "border-danger/30 bg-danger-soft text-danger-text",
                step.state === "upcoming" && "border-border bg-surface-inset text-fg-subtle",
              )}
            >
              <Icon className="size-3" />
            </span>

            <div className="min-w-0 flex-1 pt-0.5">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span
                  className={cn(
                    "text-[13px] font-medium",
                    step.state === "upcoming" ? "text-fg-subtle" : "text-fg",
                  )}
                >
                  {step.label}
                </span>
                {step.at ? (
                  <span className="text-[11.5px] text-fg-subtle">{formatDateTime(step.at)}</span>
                ) : null}
              </p>

              {step.by ? (
                <p className="mt-0.5 text-[11.5px] text-fg-subtle">by {step.by}</p>
              ) : null}

              {step.detail ? (
                <p className="mt-1 text-[12px] leading-[17px] text-fg-muted">{step.detail}</p>
              ) : null}

              {step.note ? (
                <p
                  className={cn(
                    "mt-1.5 rounded-md border-l-2 px-2.5 py-1.5 text-[12.5px] leading-[18px]",
                    step.state === "failed"
                      ? "border-danger/40 bg-danger-soft/40 text-danger-text"
                      : "border-border bg-surface-inset text-fg-muted",
                  )}
                >
                  {step.note}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
