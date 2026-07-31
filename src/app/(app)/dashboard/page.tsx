import type { Metadata } from "next";
import { Suspense } from "react";
import { ClipboardList, Clock, FileText, Plane, Users } from "lucide-react";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { SkeletonCard, SkeletonChart } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { isManagerOrAdmin } from "@/lib/auth/rbac";
import { getDashboardData } from "@/lib/services/analytics";
import { getLeaveBalances, listMyLeave } from "@/lib/services/leave";
import { getDsrForDate } from "@/lib/services/dsr";
import { getTodayAttendance } from "@/lib/services/attendance";
import { getUpcoming } from "@/lib/services/calendar";
import { getLatestAnnouncement } from "@/lib/services/announcements";
import { getNavCounts, getReportStreak } from "@/lib/services/shell";
import { formatDayLong, formatDayRange, today } from "@/lib/utils/date";
import { firstName, formatHours, formatPercent } from "@/lib/utils/format";
import { TodayCard } from "@/components/dashboard/today-card";
import {
  ActivityFeedCard,
  AnnouncementBanner,
  ContributorsCard,
  LeaveBalanceCard,
  NotMarkedCard,
  UpcomingCard,
} from "@/components/dashboard/panels";
import {
  AttendanceTrendChart,
  CompletionTrendChart,
  DepartmentActivityChart,
  HoursTrendChart,
  TodayMixBar,
} from "@/components/dashboard/charts";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Today's status across the team.",
};

/**
 * Dashboard.
 *
 * Role-aware rather than role-duplicated: everyone gets the personal "your day"
 * column, and the organisation-wide tiles, charts and roll-call are added for
 * managers and admins. One page, one set of components, no parallel screens to
 * keep in sync.
 *
 * All data loads in a single `Promise.all` — the queries are independent, so
 * awaiting them in sequence would multiply the page's latency for no reason.
 */
export default async function DashboardPage() {
  const user = await requireUser();
  const canSeeTeam = isManagerOrAdmin(user);
  const now = today();

  const [
    data,
    balances,
    myLeave,
    todayDsr,
    todayAttendance,
    upcoming,
    announcement,
    counts,
    streak,
  ] = await Promise.all([
    getDashboardData(user),
    getLeaveBalances(user.id),
    listMyLeave(user.id, { pageSize: 5 }),
    getDsrForDate(user.id, now),
    getTodayAttendance(user.id),
    getUpcoming(21),
    getLatestAnnouncement(user),
    getNavCounts(user),
    getReportStreak(user.id),
  ]);

  const pendingLeaveDays = myLeave.rows
    .filter((request) => request.status === "PENDING")
    .reduce((sum, request) => sum + request.days, 0);

  const hoursDelta = Math.round((data.hoursThisWeek - data.hoursLastWeek) * 10) / 10;

  return (
    <>
      <PageHeader
        title={canSeeTeam ? "Team dashboard" : "Your dashboard"}
        description={
          canSeeTeam
            ? "Where the team is today, and how the week is tracking."
            : "Your day at a glance, plus what's coming up."
        }
        actions={
          <>
            <ButtonLink href="/dsr/new" variant="primary" size="sm">
              <FileText className="size-4" />
              Write report
            </ButtonLink>
            {canSeeTeam ? (
              <ButtonLink href="/dsr/review" variant="secondary" size="sm">
                <ClipboardList className="size-4" />
                Review queue
              </ButtonLink>
            ) : (
              <ButtonLink href="/leave/new" variant="secondary" size="sm">
                <Plane className="size-4" />
                Request leave
              </ButtonLink>
            )}
          </>
        }
      />

      {announcement ? (
        <div className="mb-5">
          <AnnouncementBanner announcement={announcement} />
        </div>
      ) : null}

      {canSeeTeam ? (
        <StatGrid className="mb-5">
          <StatCard
            label="In today"
            value={data.today.counts.PRESENT + data.today.counts.WFH}
            unit={`of ${data.today.total}`}
            icon={<Users />}
            href="/attendance/board"
            footnote={
              data.today.isNonWorkingDay
                ? "Non-working day"
                : `${data.today.counts.WFH} remote · ${data.today.counts.LEAVE} on leave`
            }
          />
          <StatCard
            label="Reports today"
            value={data.dsrToday.submitted}
            unit={`of ${data.dsrToday.expected}`}
            icon={<FileText />}
            href="/dsr/review"
            delta={{
              value: data.dsrDelta,
              period: "vs yesterday",
              higherIsBetter: true,
            }}
            footnote={`${formatPercent(data.dsrToday.rate)} completion`}
          />
          <StatCard
            label="Pending approvals"
            value={data.pendingLeave}
            icon={<Plane />}
            href="/leave/approvals"
            footnote={
              data.pendingLeave === 0 ? "Queue is clear" : "Leave requests awaiting a decision"
            }
          />
          <StatCard
            label="Hours this week"
            value={formatHours(data.hoursThisWeek)}
            icon={<Clock />}
            trend={data.completionTrend.slice(-12).map((point) => point.hours)}
            delta={{ value: hoursDelta, period: "vs last week", higherIsBetter: true }}
            footnote={formatDayRange(data.weekRange)}
          />
        </StatGrid>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Main column */}
        <div className="min-w-0 space-y-5">
          <TodayCard
            firstName={firstName(user.name)}
            today={formatDayLong(now)}
            dsr={
              todayDsr
                ? { id: todayDsr.id, status: todayDsr.status, hoursWorked: todayDsr.hoursWorked }
                : null
            }
            attendance={
              todayAttendance
                ? { status: todayAttendance.status, inferred: todayAttendance.inferred }
                : null
            }
            streak={streak}
            isNonWorkingDay={data.today.isNonWorkingDay}
            missingReports={counts.openDsr ?? 0}
          />

          {canSeeTeam ? (
            <>
              <Card>
                <CardHeader
                  actions={
                    <span className="text-[12px] text-fg-muted tabular-nums">
                      {data.today.total} people
                    </span>
                  }
                >
                  <CardTitle>Today&apos;s roll-call</CardTitle>
                </CardHeader>
                <CardContent>
                  <TodayMixBar
                    counts={{
                      PRESENT: data.today.counts.PRESENT,
                      WFH: data.today.counts.WFH,
                      HALF_DAY: data.today.counts.HALF_DAY,
                      LEAVE: data.today.counts.LEAVE,
                      ABSENT: data.today.counts.ABSENT,
                    }}
                  />
                </CardContent>
              </Card>

              <Suspense fallback={<ChartFallback />}>
                <div className="grid gap-5 lg:grid-cols-2">
                  <CompletionTrendChart data={data.completionTrend} />
                  <HoursTrendChart data={data.completionTrend} />
                </div>
              </Suspense>

              <SectionHeader
                title="How the team is working"
                description="Last three weeks of working days"
                className="mt-1 mb-0"
              />
              <AttendanceTrendChart data={data.attendanceTrend} />

              {data.departmentActivity.length > 0 ? (
                <DepartmentActivityChart data={data.departmentActivity} />
              ) : null}
            </>
          ) : (
            <Suspense fallback={<ChartFallback />}>
              <div className="grid gap-5 lg:grid-cols-2">
                <CompletionTrendChart data={data.completionTrend} />
                <HoursTrendChart data={data.completionTrend} />
              </div>
            </Suspense>
          )}
        </div>

        {/* Rail */}
        <aside className="min-w-0 space-y-5">
          <LeaveBalanceCard balances={balances} pendingCount={pendingLeaveDays} />
          <UpcomingCard events={upcoming} />
          {canSeeTeam && data.today.notYetMarked.length > 0 ? (
            <NotMarkedCard
              people={data.today.notYetMarked.map((person) => ({
                id: person.id,
                name: person.name,
                avatarUrl: person.avatarUrl,
                department: person.department,
              }))}
            />
          ) : null}
          {canSeeTeam ? <ContributorsCard rows={data.topContributors} /> : null}
          <ActivityFeedCard entries={data.recentActivity} />
        </aside>
      </div>
    </>
  );
}

function ChartFallback() {
  return (
    <div className="grid gap-5 lg:grid-cols-2" role="status" aria-label="Loading charts">
      {[0, 1].map((index) => (
        <div key={index} className="rounded-xl border border-border bg-surface p-5">
          <SkeletonCard className="border-0 bg-transparent p-0" />
          <div className="mt-4 h-[150px]">
            <SkeletonChart />
          </div>
        </div>
      ))}
    </div>
  );
}
