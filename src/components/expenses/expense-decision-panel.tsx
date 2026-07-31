"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, BadgeCheck, IndianRupee, Send, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import {
  cancelExpenseClaimAction,
  decideExpenseClaimAction,
  markReimbursedAction,
  submitExpenseClaimAction,
} from "@/server/actions/expenses";
import { IDLE } from "@/server/actions/form-state";
import { formatMoney } from "@/lib/utils/format";

/**
 * Everything that can be *done* to a claim, in one place.
 *
 * Which controls appear is decided server-side from the RBAC policy and passed in —
 * this component never re-derives permission, so it cannot offer a button the action
 * would reject. Declining requires a note in the markup *and* in the action; the
 * client requirement is for the person typing, the server one is the actual rule.
 */
export function ExpenseDecisionPanel({
  claimId,
  claimNumber,
  claimantFirstName,
  amountMinor,
  currency,
  canDecide,
  canReimburse,
  canSubmit,
  canCancel,
}: {
  claimId: string;
  claimNumber: string;
  claimantFirstName: string;
  amountMinor: number;
  currency: string;
  canDecide: boolean;
  canReimburse: boolean;
  canSubmit: boolean;
  canCancel: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [state, action, pending] = useActionState(decideExpenseClaimAction, IDLE);

  const [decision, setDecision] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (state.ok === true) {
      toast.success("Decision saved", state.message);
      router.refresh();
    } else if (state.ok === false && state.message) {
      toast.error("Couldn't save the decision", state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  async function run(
    fn: (id: string) => Promise<{ ok: boolean | null; message?: string }>,
    successFallback: string,
    failure: string,
  ) {
    setBusy(true);
    try {
      const response = await fn(claimId);
      if (response.ok) {
        toast.success(response.message ?? successFallback);
        router.refresh();
      } else {
        toast.error(failure, response.message);
      }
    } finally {
      setBusy(false);
    }
  }

  const declining = decision === "REJECTED";
  const noteRequired = declining && note.trim().length === 0;

  // Nothing actionable — render nothing rather than an empty card.
  if (!canDecide && !canReimburse && !canSubmit && !canCancel) return null;

  return (
    <Card
      className={cn(
        canDecide && "border-warning/30 shadow-[0_0_0_3px_var(--color-warning-soft)]",
      )}
    >
      <CardHeader>
        <CardTitle>{canDecide ? "Your decision" : "Actions"}</CardTitle>
        <CardDescription>
          {canDecide
            ? `${claimantFirstName} is notified by email either way, with whatever you write below.`
            : canReimburse
              ? "Mark this as paid once the money has actually gone out."
              : canSubmit
                ? "This is still a draft — nobody else can see it yet."
                : undefined}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3.5">
        {canDecide ? (
          <form action={action} className="space-y-3.5">
            <input type="hidden" name="id" value={claimId} />
            <input type="hidden" name="decision" value={decision} />

            <div
              role="radiogroup"
              aria-label="Decision"
              className="grid grid-cols-2 gap-2"
            >
              <button
                type="button"
                role="radio"
                aria-checked={!declining}
                onClick={() => setDecision("APPROVED")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-[13px] font-medium transition-colors",
                  !declining
                    ? "border-success/40 bg-success-soft text-success-text"
                    : "border-border text-fg-muted hover:bg-surface-hover",
                )}
              >
                <BadgeCheck className="size-4" aria-hidden="true" />
                Approve
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={declining}
                onClick={() => setDecision("REJECTED")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-[13px] font-medium transition-colors",
                  declining
                    ? "border-danger/40 bg-danger-soft text-danger-text"
                    : "border-border text-fg-muted hover:bg-surface-hover",
                )}
              >
                <XCircle className="size-4" aria-hidden="true" />
                Decline
              </button>
            </div>

            <Field
              label={declining ? "Reason" : "Note"}
              required={declining}
              optional={!declining}
              hint={
                declining
                  ? "Say what to change — a bare “declined” gives them nothing to act on."
                  : "Anything finance should know when paying it."
              }
              error={state.fieldErrors?.note}
            >
              <Textarea
                name="note"
                rows={3}
                autosize
                maxLength={1000}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={
                  declining
                    ? "The bill covers two people — please split it and re-file your share."
                    : "Approved. Goes out with this month's payout."
                }
              />
            </Field>

            {state.ok === false && state.message && !state.fieldErrors ? (
              <p role="alert" className="flex items-start gap-2 text-[12.5px] text-danger-text">
                <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                {state.message}
              </p>
            ) : null}

            <Button
              type="submit"
              variant={declining ? "danger" : "primary"}
              block
              loading={pending}
              disabled={noteRequired || busy}
            >
              {declining ? (
                <>
                  <XCircle className="size-4" />
                  Decline {claimNumber}
                </>
              ) : (
                <>
                  <BadgeCheck className="size-4" />
                  Approve {formatMoney(amountMinor, currency)}
                </>
              )}
            </Button>
          </form>
        ) : null}

        {canReimburse ? (
          <Button
            variant="primary"
            block
            loading={busy}
            onClick={async () => {
              const result = await confirm({
                title: `Mark ${claimNumber} as reimbursed?`,
                description: `Confirms that ${formatMoney(
                  amountMinor,
                  currency,
                )} has been paid to ${claimantFirstName}. They're notified, and it stops showing as money owed.`,
                confirmLabel: "Mark reimbursed",
              });
              if (!result.confirmed) return;
              await run(markReimbursedAction, "Marked reimbursed", "Couldn't update the claim");
            }}
          >
            <IndianRupee className="size-4" />
            Mark reimbursed
          </Button>
        ) : null}

        {canSubmit ? (
          <Button
            variant="primary"
            block
            loading={busy}
            onClick={() => run(submitExpenseClaimAction, "Submitted", "Couldn't submit the claim")}
          >
            <Send className="size-4" />
            Submit for approval
          </Button>
        ) : null}

        {canCancel ? (
          <Button
            variant="secondary"
            block
            disabled={busy}
            onClick={async () => {
              const result = await confirm({
                title: `Withdraw ${claimNumber}?`,
                description:
                  "It's removed from the review queue. You can file a fresh claim any time.",
                confirmLabel: "Withdraw claim",
                tone: "danger",
              });
              if (!result.confirmed) return;
              await run(cancelExpenseClaimAction, "Withdrawn", "Couldn't withdraw the claim");
            }}
          >
            <X className="size-4" />
            Withdraw claim
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
