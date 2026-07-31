import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckCheck, Clock3, Plane, Users } from "lucide-react";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { NavTabs } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { getTeamBalances, listLeaveRequests } from "@/lib/services/leave";
import { leaveFilterSchema, parseSearchParams } from "@/lib/validation/schemas";
import { LEAVE_TYPE_SHORT } from "@/lib/constants/enums";
import { formatLeaveDays } from "@/lib/utils/format";
import { tryParseDayKey } from "@/lib/utils/date";
import { LeaveTable } from "@/components/leave/leave-table";
import { SegmentedMeter } from "@/components/ui/progress";

export const metadata: Metadata = {
  title: "Leave approvals",
  description: "Decide on leave requests from your team.",
};

/**
 * Approval queue.
 *
 * Pending requests come first (the service orders by status), because this screen
 * exists to empty a queue rather than to browse history.
 */
export default async function LeaveApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can.viewLeave(user, { id: user.id }) || user.role === "EMPLOYEE") redirect("/forbidden");

  const raw = parseSearchParams(leaveFilterSchema, await searchParams);
  // The schema validates dates as `YYYY-MM-DD`; the service works in Date objects.
  const filters = {
    ...raw,
    from: tryParseDayKey(raw.from) ?? undefined,
    to: tryParseDayKey(raw.to) ?? undefined,
  };

  const [{ rows, total, pendingCount }, teamBalances] = await Promise.all([
    listLeaveRequests(user, filters, { pageSize: 50 }),
    getTeamBalances(user),
  ]);

  const pendingDays = rows
    .filter((row) => row.status === "PENDING")
    .reduce((sum, row) => sum + row.days, 0);

  const approvedThisYear = rows
    .filter((row) => row.status === "APPROVED")
    .reduce((sum, row) => sum + row.days, 0);

  return (
    <>
      <PageHeader
        title="Leave approvals"
        description="Requests from your reporting line, newest decisions last."
        tabs={
          <NavTabs
            items={[
              { href: "/leave", label: "Mine", exact: true },
              { href: "/leave/approvals", label: "Approvals", count: pendingCount },
            ]}
          />
        }
      />

      <StatGrid columns={4} className="mb-6">
        <StatCard
          label="Awaiting you"
          value={pendingCount}
          icon={<Clock3 />}
          footnote={
            pendingCount === 0
              ? "Queue is clear"
              : `${formatLeaveDays(pendingDays)} across these requests`
          }
        />
        <StatCard
          label="Approved days"
          value={approvedThisYear}
          icon={<CheckCheck />}
          footnote="In the current view"
        />
        <StatCard
          label="People covered"
          value={teamBalances.length}
          icon={<Users />}
          footnote="In your reporting line"
        />
        <StatCard
          label="Requests total"
          value={total}
          icon={<Plane />}
          footnote="All statuses"
        />
      </StatGrid>

      <div className="mb-6">
        <LeaveTable
          showAuthor
          emptyTitle="Nothing to decide"
          emptyDescription="When someone on your team requests leave, it appears here and you'll get an email."
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
            canDecide:
              row.status === "PENDING" &&
              can.decideLeave(user, { id: row.user.id, managerId: row.user.manager?.id ?? null }),
            canCancel: can.cancelLeave(user, { id: row.user.id }, row.status),
          }))}
        />
      </div>

      <SectionHeader
        title="Team balances"
        description="What everyone has left this year — useful context before approving."
      />

      <Card>
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <caption className="sr-only">Remaining leave balance per person</caption>
              <thead>
                <tr className="border-b border-border text-fg-muted">
                  <th scope="col" className="pb-2 font-medium">
                    Person
                  </th>
                  {teamBalances[0]?.balances.map((balance) => (
                    <th key={balance.type} scope="col" className="pb-2 font-medium">
                      {LEAVE_TYPE_SHORT[balance.type]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {teamBalances.map((entry) => (
                  <tr key={entry.user.id}>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      <span className="font-medium text-fg">{entry.user.name}</span>
                      {entry.user.department ? (
                        <span className="ml-1.5 text-fg-subtle">{entry.user.department}</span>
                      ) : null}
                    </td>
                    {entry.balances.map((balance) => (
                      <td key={balance.type} className="w-[7.5rem] py-2 pr-4">
                        <span className="mb-1 block text-[11.5px] tabular-nums text-fg-muted">
                          <span className="font-semibold text-fg">{balance.available}</span> /{" "}
                          {balance.allocated}
                        </span>
                        <SegmentedMeter
                          used={balance.used}
                          pending={balance.pending}
                          total={balance.allocated}
                          tone={balance.available === 0 ? "danger" : "accent"}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
