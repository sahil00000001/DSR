import type { Metadata } from "next";
import { CalendarCheck, Clock3, Plane, Wallet } from "lucide-react";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NavTabs } from "@/components/ui/tabs";
import { SegmentedMeter } from "@/components/ui/progress";
import { requireUser } from "@/lib/auth/session";
import { can, isManagerOrAdmin } from "@/lib/auth/rbac";
import { getLeaveBalances, listMyLeave } from "@/lib/services/leave";
import { LEAVE_TYPE_LABEL } from "@/lib/constants/enums";
import { LEAVE_COLOR } from "@/lib/charts/palette";
import { formatLeaveDays } from "@/lib/utils/format";
import { today } from "@/lib/utils/date";
import { LeaveTable } from "@/components/leave/leave-table";

export const metadata: Metadata = {
  title: "Leave",
  description: "Your leave balances and request history.",
};

export default async function LeavePage() {
  const user = await requireUser();

  const [balances, { rows, total }] = await Promise.all([
    getLeaveBalances(user.id),
    listMyLeave(user.id, { pageSize: 30 }),
  ]);

  const totals = balances.reduce(
    (accumulator, balance) => {
      accumulator.allocated += balance.allocated;
      accumulator.used += balance.used;
      accumulator.pending += balance.pending;
      accumulator.available += balance.available;
      return accumulator;
    },
    { allocated: 0, used: 0, pending: 0, available: 0 },
  );

  const pendingRequests = rows.filter((row) => row.status === "PENDING").length;
  const upcoming = rows.filter(
    (row) => row.status === "APPROVED" && row.endDate >= today(),
  ).length;

  return (
    <>
      <PageHeader
        title="Leave"
        description={`Your ${today().getUTCFullYear()} entitlement, and everything you've requested.`}
        tabs={
          isManagerOrAdmin(user) ? (
            <NavTabs
              items={[
                { href: "/leave", label: "Mine", exact: true },
                { href: "/leave/approvals", label: "Approvals" },
              ]}
            />
          ) : undefined
        }
        actions={
          <ButtonLink href="/leave/new" variant="primary" size="sm">
            <Plane className="size-4" />
            Request leave
          </ButtonLink>
        }
      />

      <StatGrid className="mb-6">
        <StatCard
          label="Days available"
          value={totals.available}
          unit={`of ${totals.allocated}`}
          icon={<Wallet />}
          footnote="Across casual, sick and earned leave"
        />
        <StatCard
          label="Days taken"
          value={totals.used}
          icon={<CalendarCheck />}
          footnote={`${Math.round((totals.used / Math.max(1, totals.allocated)) * 100)}% of entitlement`}
        />
        <StatCard
          label="Awaiting decision"
          value={pendingRequests}
          icon={<Clock3 />}
          footnote={
            totals.pending > 0 ? `${formatLeaveDays(totals.pending)} reserved` : "Nothing pending"
          }
        />
        <StatCard
          label="Upcoming leave"
          value={upcoming}
          icon={<Plane />}
          footnote={upcoming === 0 ? "Nothing booked" : "Approved and still to come"}
        />
      </StatGrid>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {balances.map((balance) => (
          <Card key={balance.type}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[13.5px]">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: LEAVE_COLOR[balance.type] }}
                />
                {LEAVE_TYPE_LABEL[balance.type]}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="flex items-baseline gap-1.5">
                <span className="text-2xl leading-none font-semibold text-fg">
                  {balance.available}
                </span>
                <span className="text-[12.5px] text-fg-muted">of {balance.allocated} days left</span>
              </p>

              <SegmentedMeter
                used={balance.used}
                pending={balance.pending}
                total={balance.allocated}
                tone={balance.available === 0 ? "danger" : "accent"}
                className="mt-3"
              />

              <p className="mt-2.5 text-[11.5px] text-fg-subtle">
                {balance.used} taken
                {balance.pending > 0 ? ` · ${balance.pending} pending` : ""}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <SectionHeader
        title="Your requests"
        description={`${total} request${total === 1 ? "" : "s"} in total`}
      />

      <LeaveTable
        showAuthor={false}
        emptyTitle="No leave requested yet"
        emptyDescription="When you need time off, request it here. Your balance updates automatically once it's approved."
        emptyAction={
          <ButtonLink href="/leave/new" variant="primary" size="sm">
            <Plane className="size-4" />
            Request leave
          </ButtonLink>
        }
        rows={rows.map((row) => ({
          id: row.id,
          type: row.type,
          status: row.status,
          startDate: row.startDate,
          endDate: row.endDate,
          days: row.days,
          halfDay: row.halfDay,
          reason: row.reason,
          decisionNote: row.decisionNote,
          createdAt: row.createdAt,
          user: {
            id: row.user.id,
            name: row.user.name,
            avatarUrl: row.user.avatarUrl,
            department: row.user.department?.name ?? null,
          },
          decidedBy: row.decidedBy,
          // Own requests are never self-approvable — see the RBAC policy.
          canDecide: false,
          canCancel: can.cancelLeave(user, { id: row.user.id }, row.status),
        }))}
      />
    </>
  );
}
