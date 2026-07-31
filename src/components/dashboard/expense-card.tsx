import Link from "next/link";
import { ArrowRight, Clock3, IndianRupee, Plus, Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney, formatMoneyCompact } from "@/lib/utils/format";
import type { ExpenseSnapshot } from "@/lib/services/expenses";

/**
 * Expense state, on the dashboard.
 *
 * Deliberately answers one question — "what is the company holding of mine, and is
 * anything stuck?" — rather than listing claims. A list belongs on `/expenses`; the
 * dashboard's job is to tell you whether you need to go there.
 */
export function ExpenseCard({
  snapshot,
  awaitingDecision,
}: {
  snapshot: ExpenseSnapshot;
  /** Admin-only: claims from other people waiting on a decision. */
  awaitingDecision: number;
}) {
  const owed = snapshot.awaitingMinor + snapshot.approvedMinor;
  const openClaims = snapshot.awaitingCount + snapshot.approvedCount;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Receipt className="size-3.5 text-fg-subtle" aria-hidden="true" />
          Expenses
        </CardTitle>
        <Link
          href="/expenses"
          className="inline-flex items-center gap-0.5 rounded-sm text-[11.5px] font-medium text-fg-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          All claims
          <ArrowRight className="size-3" aria-hidden="true" />
        </Link>
      </CardHeader>

      <CardContent className="space-y-3">
        <div>
          <p className="flex items-baseline gap-1.5">
            <span className="text-2xl leading-none font-semibold tabular-nums text-fg">
              {formatMoneyCompact(owed)}
            </span>
            <span className="text-[12.5px] text-fg-muted">owed to you</span>
          </p>
          <p className="mt-1.5 text-[11.5px] text-fg-subtle">
            {openClaims === 0
              ? "No open claims. Reimbursed " + formatMoneyCompact(snapshot.reimbursedMinor) + " this year."
              : `${formatMoney(owed)} across ${openClaims} open claim${openClaims === 1 ? "" : "s"}`}
          </p>
        </div>

        {snapshot.awaitingCount > 0 || snapshot.approvedCount > 0 || snapshot.draftCount > 0 ? (
          <ul className="space-y-1.5 text-[12px]">
            {snapshot.awaitingCount > 0 ? (
              <Row
                icon={<Clock3 />}
                label="Awaiting approval"
                value={formatMoney(snapshot.awaitingMinor)}
                count={snapshot.awaitingCount}
                tone="warning"
              />
            ) : null}
            {snapshot.approvedCount > 0 ? (
              <Row
                icon={<IndianRupee />}
                label="Approved, awaiting payment"
                value={formatMoney(snapshot.approvedMinor)}
                count={snapshot.approvedCount}
                tone="info"
              />
            ) : null}
            {snapshot.draftCount > 0 ? (
              <Row
                icon={<Receipt />}
                label="Drafts not submitted"
                value="—"
                count={snapshot.draftCount}
                tone="neutral"
              />
            ) : null}
          </ul>
        ) : (
          <Link
            href="/expenses/new"
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-[12.5px] text-fg-muted transition-colors hover:border-accent/50 hover:bg-accent-soft/30 hover:text-fg"
          >
            <Plus className="size-3.5 shrink-0" aria-hidden="true" />
            Paid for something? Claim it back.
          </Link>
        )}

        {awaitingDecision > 0 ? (
          <Link
            href="/expenses/review"
            className="flex items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning-soft/50 px-3 py-2 text-[12.5px] font-medium text-warning-text transition-colors hover:bg-warning-soft"
          >
            <span>
              {awaitingDecision} claim{awaitingDecision === 1 ? "" : "s"} need your decision
            </span>
            <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Row({
  icon,
  label,
  value,
  count,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  count: number;
  tone: "warning" | "info" | "neutral";
}) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-1.5 text-fg-muted">
        <span className="shrink-0 text-fg-subtle [&>svg]:size-3" aria-hidden="true">
          {icon}
        </span>
        <span className="truncate">{label}</span>
        <Badge tone={tone} variant="soft" size="sm">
          {count}
        </Badge>
      </span>
      <span className="shrink-0 font-medium tabular-nums text-fg">{value}</span>
    </li>
  );
}
