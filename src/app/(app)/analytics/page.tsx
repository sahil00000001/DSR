import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarCheck, Clock, FileText, Plane, TrendingUp, Users } from "lucide-react";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PersonCell } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { getAnalyticsData } from "@/lib/services/analytics";
import { endOfMonth, formatDayRange, lastNDays, startOfMonth, subDays, today } from "@/lib/utils/date";
import { formatHours, formatPercent } from "@/lib/utils/format";
import {
  AttendanceTrendChart,
  CompletionTrendChart,
  DepartmentActivityChart,
  HoursTrendChart,
} from "@/components/dashboard/charts";
import { LeaveTrendChart } from "@/components/analytics/leave-trend-chart";
import { RangePicker } from "@/components/analytics/range-picker";

export const metadata: Metadata = {
  title: "Analytics",
  description: "Trends across reports, attendance and leave.",
};

const RANGES = {
  "last-7": { label: "Last 7 days", resolve: () => lastNDays(7) },
  "last-30": { label: "Last 30 days", resolve: () => lastNDays(30) },
  "last-90": { label: "Last 90 days", resolve: () => lastNDays(90) },
  month: {
    label: "This month",
    resolve: () => ({ start: startOfMonth(today()), end: endOfMonth(today()) }),
  },
  "last-month": {
    label: "Last month",
    resolve: () => {
      const previous = subDays(startOfMonth(today()), 1);
      return { start: startOfMonth(previous), end: endOfMonth(previous) };
    },
  },
} as const;

export type RangeKey = keyof typeof RANGES;

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const user = await requireUser();
  if (!can.viewAnalytics(user)) redirect("/forbidden");

  const { range: rangeParam } = await searchParams;
  const rangeKey: RangeKey = rangeParam && rangeParam in RANGES ? (rangeParam as RangeKey) : "last-30";
  const range = RANGES[rangeKey].resolve();

  const data = await getAnalyticsData(range, user);

  return (
    <>
      <PageHeader
        title="Analytics"
        description={`How the team is tracking — ${formatDayRange(range)}.`}
        actions={
          <RangePicker
            value={rangeKey}
            options={Object.entries(RANGES).map(([value, config]) => ({
              value,
              label: config.label,
            }))}
          />
        }
      />

      <StatGrid className="mb-6">
        <StatCard
          label="Reports filed"
          value={data.totals.reports}
          icon={<FileText />}
          trend={data.completionTrend.slice(-12).map((point) => point.submitted)}
          footnote={`${data.totals.activePeople} people contributed`}
        />
        <StatCard
          label="Completion rate"
          value={formatPercent(data.totals.completionRate)}
          icon={<TrendingUp />}
          footnote="Against expected working days"
        />
        <StatCard
          label="Hours logged"
          value={formatHours(data.totals.hours)}
          icon={<Clock />}
          trend={data.completionTrend.slice(-12).map((point) => point.hours)}
          footnote={`${formatHours(data.totals.avgHoursPerDay)} per report`}
        />
        <StatCard
          label="Leave days taken"
          value={data.totals.leaveDays}
          icon={<Plane />}
          footnote="Approved, in this period"
        />
      </StatGrid>

      <div className="mb-6 grid gap-5 lg:grid-cols-2">
        <CompletionTrendChart data={data.completionTrend} />
        <HoursTrendChart data={data.completionTrend} />
      </div>

      <div className="mb-6 grid gap-5 lg:grid-cols-2">
        <AttendanceTrendChart data={data.attendanceTrend} />
        <LeaveTrendChart data={data.leaveTrend} />
      </div>

      {data.departmentActivity.length > 0 ? (
        <div className="mb-6">
          <DepartmentActivityChart data={data.departmentActivity} />
        </div>
      ) : null}

      <SectionHeader
        title="Completion by person"
        description="Expected reports exclude weekends, public holidays and each person's approved leave."
      />

      <Card className="mb-6">
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <caption className="sr-only">Report completion per employee</caption>
              <thead>
                <tr className="border-b border-border text-fg-muted">
                  <th scope="col" className="pb-2 font-medium">Person</th>
                  <th scope="col" className="pb-2 text-right font-medium">Expected</th>
                  <th scope="col" className="pb-2 text-right font-medium">Filed</th>
                  <th scope="col" className="w-[9rem] pb-2 pl-4 font-medium">Completion</th>
                  <th scope="col" className="pb-2 text-right font-medium">Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.completion.map((row) => (
                  <tr key={row.user.id}>
                    <td className="py-2 pr-4">
                      <PersonCell
                        name={row.user.name}
                        seed={row.user.id}
                        src={row.user.avatarUrl}
                        size="xs"
                        meta={row.user.department ?? undefined}
                      />
                    </td>
                    <td className="py-2 text-right tabular-nums text-fg-muted">{row.expected}</td>
                    <td className="py-2 text-right font-medium tabular-nums">{row.submitted}</td>
                    <td className="py-2 pl-4">
                      <div className="flex items-center gap-2">
                        <Progress
                          value={row.rate}
                          tone={row.rate >= 80 ? "success" : row.rate >= 50 ? "warning" : "danger"}
                          size="sm"
                          label={`${row.user.name} completion`}
                        />
                        <span className="w-9 shrink-0 text-right text-[11.5px] tabular-nums text-fg-muted">
                          {row.rate}%
                        </span>
                      </div>
                    </td>
                    <td className="py-2 text-right tabular-nums text-fg-muted">
                      {formatHours(row.totalHours)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-3.5 text-fg-subtle" aria-hidden="true" />
              Most consistent
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ol className="space-y-2.5">
              {data.contributors.slice(0, 8).map((row, index) => (
                <li key={row.id} className="flex items-center gap-3">
                  <span className="w-3.5 text-right text-[11px] font-semibold text-fg-subtle tabular-nums">
                    {index + 1}
                  </span>
                  <PersonCell
                    name={row.name}
                    seed={row.id}
                    src={row.avatarUrl}
                    size="sm"
                    meta={row.department ?? undefined}
                    className="min-w-0 flex-1"
                  />
                  <Badge tone="neutral" size="sm">
                    {row.reports} reports
                  </Badge>
                  {row.streak >= 3 ? (
                    <Badge tone="warning" size="sm">
                      {row.streak}-day streak
                    </Badge>
                  ) : null}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck className="size-3.5 text-fg-subtle" aria-hidden="true" />
              Department summary
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-3">
              {data.departmentActivity.map((department) => (
                <li key={department.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-fg">
                      <span
                        aria-hidden="true"
                        className="size-2 rounded-full"
                        style={{ backgroundColor: `var(--cat-${department.color})` }}
                      />
                      {department.name}
                    </span>
                    <span className="text-[11.5px] text-fg-muted tabular-nums">
                      {department.reports} reports · {formatHours(department.hours)}
                    </span>
                  </div>
                  <Progress
                    value={department.completionRate}
                    tone={
                      department.completionRate >= 80
                        ? "success"
                        : department.completionRate >= 50
                          ? "warning"
                          : "danger"
                    }
                    size="sm"
                    label={`${department.name} completion`}
                  />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
