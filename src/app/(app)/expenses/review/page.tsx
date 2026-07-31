import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Clock3, IndianRupee, Receipt, Users, Wallet } from "lucide-react";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { NavTabs } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PersonCell } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import {
  getExpensesByCategory,
  getOutstandingByEmployee,
  listExpenseClaims,
} from "@/lib/services/expenses";
import { toExpenseRow } from "@/lib/services/expense-rows";
import { getOrgOptions } from "@/lib/services/people";
import { expenseFilterSchema, parseSearchParams } from "@/lib/validation/schemas";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/constants/enums";
import { lastNDays, tryParseDayKey } from "@/lib/utils/date";
import { formatMoney, formatMoneyCompact, percentage } from "@/lib/utils/format";
import { seriesColorAt } from "@/lib/charts/palette";
import { ExpenseFilters } from "@/components/expenses/expense-filters";
import { ExpenseTable } from "@/components/expenses/expense-table";

export const metadata: Metadata = {
  title: "Expense review",
  description: "Approve, decline and pay out expense claims.",
};

/**
 * Admin review queue.
 *
 * Submitted claims come first (the service orders by status) because this screen
 * exists to empty a queue. The payout list beside it answers the question that
 * always follows approving something — "what do we actually owe, and to whom?"
 */
export default async function ExpenseReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can.viewExpenseQueue(user)) redirect("/forbidden");

  const raw = parseSearchParams(expenseFilterSchema, await searchParams);
  const filters = {
    ...raw,
    from: tryParseDayKey(raw.from) ?? undefined,
    to: tryParseDayKey(raw.to) ?? undefined,
  };

  const page = raw.page ?? 1;
  const pageSize = raw.size ?? 50;

  const [{ rows, total, summary }, outstanding, byCategory, options] = await Promise.all([
    listExpenseClaims(filters, user, { page, pageSize }),
    getOutstandingByEmployee(user),
    getExpensesByCategory(lastNDays(90), user),
    getOrgOptions(),
  ]);

  const owedTotal = outstanding.reduce((sum, entry) => sum + entry.totalMinor, 0);
  const categoryTotal = byCategory.reduce((sum, entry) => sum + entry.totalMinor, 0);

  return (
    <>
      <PageHeader
        title="Expense review"
        description="Claims from across the company, oldest waiting first."
        tabs={
          <NavTabs
            items={[
              { href: "/expenses", label: "Mine", exact: true },
              { href: "/expenses/review", label: "Review", count: summary.awaitingCount },
            ]}
          />
        }
      />

      <StatGrid columns={4} className="mb-6">
        <StatCard
          label="Awaiting you"
          value={summary.awaitingCount}
          icon={<Clock3 />}
          footnote={
            summary.awaitingCount === 0
              ? "Queue is clear"
              : `${formatMoney(summary.byStatus.SUBMITTED.totalMinor)} to decide on`
          }
        />
        <StatCard
          label="Approved, unpaid"
          value={formatMoneyCompact(summary.byStatus.APPROVED.totalMinor)}
          icon={<IndianRupee />}
          footnote={`${summary.byStatus.APPROVED.count} claim${
            summary.byStatus.APPROVED.count === 1 ? "" : "s"
          } waiting on payment`}
        />
        <StatCard
          label="Reimbursed"
          value={formatMoneyCompact(summary.byStatus.REIMBURSED.totalMinor)}
          icon={<Receipt />}
          footnote="Paid out in the current view"
        />
        <StatCard
          label="Claimants"
          value={summary.claimants}
          icon={<Users />}
          footnote={`${total} claim${total === 1 ? "" : "s"} in this view`}
        />
      </StatGrid>

      <div className="mb-4">
        <ExpenseFilters basePath="/expenses/review" options={options} showPeople />
      </div>

      <div className="mb-6">
        <ExpenseTable
          showAuthor
          emptyTitle="Nothing to review"
          emptyDescription="When someone files a claim it appears here, and you'll get an email with the amount and what it was for."
          rows={rows.map((row) => toExpenseRow(row, user))}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <SectionHeader
            title="What we owe"
            description={
              owedTotal === 0
                ? "Nothing approved and unpaid"
                : `${formatMoney(owedTotal)} approved and awaiting payment`
            }
          />

          <Card>
            <CardContent className="pt-4">
              {outstanding.length === 0 ? (
                <p className="py-2 text-[13px] text-fg-muted">
                  Every approved claim has been paid. Nothing outstanding.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {outstanding.map((entry) => (
                    <li
                      key={entry.user!.id}
                      className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <Link
                        href={`/expenses/review?employee=${entry.user!.id}&status=APPROVED`}
                        className="min-w-0 rounded-sm hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                      >
                        <PersonCell
                          name={entry.user!.name}
                          seed={entry.user!.id}
                          src={entry.user!.avatarUrl}
                          size="sm"
                          meta={entry.user!.department ?? undefined}
                        />
                      </Link>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge tone="neutral" variant="outline" size="sm">
                          {entry.count} claim{entry.count === 1 ? "" : "s"}
                        </Badge>
                        <span className="text-[13px] font-semibold tabular-nums text-fg">
                          {formatMoney(entry.totalMinor)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        <section>
          <SectionHeader
            title="Where it goes"
            description="Spend by category over the last 90 days"
          />

          <Card>
            <CardHeader className="sr-only">
              <CardTitle>Spend by category</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {byCategory.length === 0 ? (
                <p className="py-2 text-[13px] text-fg-muted">
                  No claims in the last 90 days.
                </p>
              ) : (
                <ul className="space-y-3">
                  {byCategory.map((entry, index) => (
                    <li key={entry.category}>
                      <p className="mb-1.5 flex items-baseline justify-between gap-3 text-[12.5px]">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span
                            aria-hidden="true"
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: seriesColorAt(index) }}
                          />
                          <span className="truncate text-fg">
                            {EXPENSE_CATEGORY_LABEL[entry.category]}
                          </span>
                          <span className="shrink-0 text-fg-subtle">({entry.count})</span>
                        </span>
                        <span className="shrink-0 font-medium tabular-nums text-fg">
                          {formatMoney(entry.totalMinor)}
                        </span>
                      </p>
                      <Progress
                        value={percentage(entry.totalMinor, categoryTotal)}
                        size="sm"
                        label={`${EXPENSE_CATEGORY_LABEL[entry.category]} — ${formatMoney(
                          entry.totalMinor,
                        )}`}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      {summary.byStatus.REJECTED.count > 0 ? (
        <p className="mt-5 flex items-center gap-2 text-[12px] text-fg-subtle">
          <Wallet className="size-3.5 shrink-0" aria-hidden="true" />
          {summary.byStatus.REJECTED.count} declined claim
          {summary.byStatus.REJECTED.count === 1 ? "" : "s"} in this view, totalling{" "}
          {formatMoney(summary.byStatus.REJECTED.totalMinor)} — excluded from everything above.
        </p>
      ) : null}
    </>
  );
}
