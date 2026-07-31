import type { Metadata } from "next";
import { Clock3, FileEdit, IndianRupee, Plus, Receipt, Wallet } from "lucide-react";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { ButtonLink } from "@/components/ui/button";
import { NavTabs } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/rbac";
import {
  countClaimsAwaitingDecision,
  getExpenseSnapshot,
  listExpenseClaims,
} from "@/lib/services/expenses";
import { getOrgOptions } from "@/lib/services/people";
import { expenseFilterSchema, parseSearchParams } from "@/lib/validation/schemas";
import { tryParseDayKey, today } from "@/lib/utils/date";
import { formatMoney, formatMoneyCompact } from "@/lib/utils/format";
import { ExpenseFilters } from "@/components/expenses/expense-filters";
import { ExpenseTable } from "@/components/expenses/expense-table";
import { toExpenseRow } from "@/lib/services/expense-rows";

export const metadata: Metadata = {
  title: "Expenses",
  description: "Claim what you spent, and follow it through to payment.",
};

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();

  const raw = parseSearchParams(expenseFilterSchema, await searchParams);
  const filters = {
    ...raw,
    from: tryParseDayKey(raw.from) ?? undefined,
    to: tryParseDayKey(raw.to) ?? undefined,
  };

  const page = raw.page ?? 1;
  const pageSize = raw.size ?? 30;

  const [{ rows, total, summary }, snapshot, options, awaitingDecision] = await Promise.all([
    listExpenseClaims(filters, user, { page, pageSize }),
    getExpenseSnapshot(user.id),
    getOrgOptions(),
    countClaimsAwaitingDecision(user),
  ]);

  const owed = snapshot.awaitingMinor + snapshot.approvedMinor;

  return (
    <>
      <PageHeader
        title="Expenses"
        description={`What you've spent on the company's behalf in ${today().getUTCFullYear()}, and where each claim stands.`}
        tabs={
          isAdmin(user) ? (
            <NavTabs
              items={[
                { href: "/expenses", label: "Mine", exact: true },
                { href: "/expenses/review", label: "Review", count: awaitingDecision },
              ]}
            />
          ) : undefined
        }
        actions={
          <ButtonLink href="/expenses/new" variant="primary" size="sm">
            <Plus className="size-4" />
            New claim
          </ButtonLink>
        }
      />

      <StatGrid className="mb-6">
        <StatCard
          label="Owed to you"
          value={formatMoneyCompact(owed)}
          icon={<Wallet />}
          footnote={
            owed === 0
              ? "Nothing outstanding"
              : `${formatMoney(owed)} across ${snapshot.awaitingCount + snapshot.approvedCount} claim${
                  snapshot.awaitingCount + snapshot.approvedCount === 1 ? "" : "s"
                }`
          }
        />
        <StatCard
          label="Awaiting approval"
          value={snapshot.awaitingCount}
          icon={<Clock3 />}
          footnote={
            snapshot.awaitingCount === 0
              ? "Nothing pending"
              : `${formatMoney(snapshot.awaitingMinor)} under review`
          }
        />
        <StatCard
          label="Approved, unpaid"
          value={snapshot.approvedCount}
          icon={<IndianRupee />}
          footnote={
            snapshot.approvedCount === 0
              ? "Nothing queued"
              : `${formatMoney(snapshot.approvedMinor)} on the next payout`
          }
        />
        <StatCard
          label="Reimbursed"
          value={formatMoneyCompact(snapshot.reimbursedMinor)}
          icon={<Receipt />}
          footnote="Paid to you this year"
        />
      </StatGrid>

      {snapshot.draftCount > 0 ? (
        <Card variant="inset" className="mb-6">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
            <p className="flex items-center gap-2 text-[13px] text-fg-muted">
              <FileEdit className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
              You have {snapshot.draftCount} draft{snapshot.draftCount === 1 ? "" : "s"} nobody can
              see yet. A draft isn&apos;t a claim until it&apos;s submitted.
            </p>
            <ButtonLink href="/expenses?status=DRAFT" variant="secondary" size="xs">
              Show drafts
            </ButtonLink>
          </CardContent>
        </Card>
      ) : null}

      <div className="mb-4">
        <ExpenseFilters basePath="/expenses" options={options} showPeople={false} />
      </div>

      <SectionHeader
        title="Your claims"
        description={
          total === 0
            ? "Nothing filed yet"
            : `${total} claim${total === 1 ? "" : "s"} · ${formatMoney(summary.totalMinor)} claimed`
        }
      />

      <ExpenseTable
        showAuthor={false}
        emptyTitle="No claims yet"
        emptyDescription="Paid for something on the company's behalf? File it here with a photo of the bill, and you can follow it through to payment."
        emptyAction={
          <ButtonLink href="/expenses/new" variant="primary" size="sm">
            <Plus className="size-4" />
            File your first claim
          </ButtonLink>
        }
        rows={rows.map((row) => toExpenseRow(row, user))}
      />
    </>
  );
}
