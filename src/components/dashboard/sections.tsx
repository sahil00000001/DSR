import { Clock, FileText, Plane, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { Skeleton, SkeletonCard, SkeletonChart } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { isManagerOrAdmin } from "@/lib/auth/rbac";
import { getDashboardData } from "@/lib/services/analytics";
import { getLeaveBalances, listMyLeave } from "@/lib/services/leave";
import { countClaimsAwaitingDecision, getExpenseSnapshot } from "@/lib/services/expenses";
import { getOrderSnapshot } from "@/lib/services/orders";
import {
  getAdminTaskSnapshot,
  getRecentTaskActivity,
  getUpcomingTasks,
  getUserTaskSnapshot,
} from "@/lib/services/tasks";
import { getDsrForDate } from "@/lib/services/dsr";
import { getTodayAttendance } from "@/lib/services/attendance";
import { getUpcoming } from "@/lib/services/calendar";
import { getLatestAnnouncement } from "@/lib/services/announcements";
import { getNavCounts, getReportStreak } from "@/lib/services/shell";
import { formatDayLong, formatDayRange, today } from "@/lib/utils/date";
import { firstName, formatHours, formatPercent } from "@/lib/utils/format";
import { TodayCard } from "@/components/dashboard/today-card";
import { ExpenseCard } from "@/components/dashboard/expense-card";
import { OrderCard } from "@/components/dashboard/order-card";
import {
  MyTasksCard,
  TaskActivityCard,
  TeamWorkloadCard,
} from "@/components/dashboard/task-cards";
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

/**
 * Dashboard sections, each independently suspendable.
 *
 * ## Why the page is split this way
 *
 * The dashboard used to `await Promise.all([...9 calls])` before rendering anything,
 * so time-to-first-paint was gated by the *slowest* query — `getDashboardData`,
 * which loads the whole attendance board. The personal "your day" card, which is
 * what someone actually opens the page for, waited on team-wide analytics it has
 * nothing to do with.
 *
 * Now the work is separated by cost:
 *
 *   fast (~1 query each)   your day, leave balance, upcoming  → paint almost at once
 *   slow (~25 queries)     team stats, charts, activity feed  → stream in after
 *
 * Same total work, but the screen is usable while the expensive half is still in
 * flight. `getDashboardData` is request-cached, so the three slow sections share one
 * aggregation rather than running it three times.
 */

// ---------------------------------------------------------------------------
//  Fast sections — personal, roughly one query each
// ---------------------------------------------------------------------------

export async function TodaySection() {
  const user = await requireUser();
  const now = today();

  const [todayDsr, todayAttendance, streak, counts, nonWorking] = await Promise.all([
    getDsrForDate(user.id, now),
    getTodayAttendance(user.id),
    getReportStreak(user.id),
    getNavCounts(user),
    // Cheap standalone check rather than waiting on the full board.
    isNonWorkingDay(now),
  ]);

  return (
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
      isNonWorkingDay={nonWorking}
      missingReports={counts.openDsr ?? 0}
    />
  );
}

/** Weekend/holiday check without loading an attendance board. */
async function isNonWorkingDay(day: Date): Promise<boolean> {
  const { isWeekend } = await import("@/lib/utils/date");
  if (isWeekend(day)) return true;

  const { prisma } = await import("@/lib/db/prisma");
  const holiday = await prisma.holiday.findFirst({
    where: { date: day, type: { in: ["PUBLIC", "COMPANY"] } },
    select: { id: true },
  });
  return holiday !== null;
}

export async function LeaveSection() {
  const user = await requireUser();

  const [balances, myLeave] = await Promise.all([
    getLeaveBalances(user.id),
    listMyLeave(user.id, { pageSize: 5 }),
  ]);

  const pendingDays = myLeave.rows
    .filter((request) => request.status === "PENDING")
    .reduce((sum, request) => sum + request.days, 0);

  return <LeaveBalanceCard balances={balances} pendingCount={pendingDays} />;
}

export async function OrdersSection() {
  const user = await requireUser();
  // Orders are a management surface — an employee sees their stages as tasks instead.
  if (!isManagerOrAdmin(user)) return null;

  const snapshot = await getOrderSnapshot(user);
  if (snapshot.open === 0 && snapshot.deliveredThisMonth === 0) return null;

  return <OrderCard snapshot={snapshot} />;
}

export async function MyTasksSection() {
  const user = await requireUser();

  const [snapshot, upcoming] = await Promise.all([
    getUserTaskSnapshot(user.id),
    getUpcomingTasks(user.id, 4),
  ]);

  // Nothing assigned and nothing finished: the card would be a permanent empty
  // prompt, so it is not rendered until there is something to say.
  if (snapshot.assigned === 0 && snapshot.completedThisMonth === 0) return null;

  return <MyTasksCard snapshot={snapshot} upcoming={upcoming} />;
}

export async function TeamWorkloadSection() {
  const user = await requireUser();
  if (!isManagerOrAdmin(user)) return null;

  const snapshot = await getAdminTaskSnapshot(user);
  if (snapshot.total === 0) return null;

  return <TeamWorkloadCard snapshot={snapshot} />;
}

export async function TaskActivitySection() {
  const user = await requireUser();
  if (!isManagerOrAdmin(user)) return null;

  const activity = await getRecentTaskActivity(user, 8);
  if (activity.length === 0) return null;

  return <TaskActivityCard activity={activity} />;
}

export async function ExpenseSection() {
  const user = await requireUser();

  const [snapshot, awaitingDecision] = await Promise.all([
    getExpenseSnapshot(user.id),
    countClaimsAwaitingDecision(user),
  ]);

  // Nothing filed and nothing to decide: the card would be a permanent empty
  // prompt, so it isn't rendered at all until there's something to say.
  if (
    snapshot.awaitingCount === 0 &&
    snapshot.approvedCount === 0 &&
    snapshot.draftCount === 0 &&
    snapshot.reimbursedMinor === 0 &&
    awaitingDecision === 0
  ) {
    return null;
  }

  return <ExpenseCard snapshot={snapshot} awaitingDecision={awaitingDecision} />;
}

export async function UpcomingSection() {
  return <UpcomingCard events={await getUpcoming(21)} />;
}

export async function AnnouncementSection() {
  const user = await requireUser();
  const announcement = await getLatestAnnouncement(user);
  if (!announcement) return null;

  return (
    <div className="mb-5">
      <AnnouncementBanner announcement={announcement} />
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Slow sections — team-wide aggregation, share one cached payload
// ---------------------------------------------------------------------------

export async function TeamStatsSection() {
  const user = await requireUser();
  const data = await getDashboardData(user);
  const hoursDelta = Math.round((data.hoursThisWeek - data.hoursLastWeek) * 10) / 10;

  return (
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
        delta={{ value: data.dsrDelta, period: "vs yesterday", higherIsBetter: true }}
        footnote={`${formatPercent(data.dsrToday.rate)} completion`}
      />
      <StatCard
        label="Pending approvals"
        value={data.pendingLeave}
        icon={<Plane />}
        href="/leave/approvals"
        footnote={data.pendingLeave === 0 ? "Queue is clear" : "Leave awaiting a decision"}
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
  );
}

export async function RollCallSection() {
  const user = await requireUser();
  const data = await getDashboardData(user);

  return (
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
  );
}

export async function ChartsSection() {
  const user = await requireUser();
  const data = await getDashboardData(user);
  const canSeeTeam = isManagerOrAdmin(user);

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-2">
        <CompletionTrendChart data={data.completionTrend} />
        <HoursTrendChart data={data.completionTrend} />
      </div>

      {canSeeTeam ? (
        <>
          <AttendanceTrendChart data={data.attendanceTrend} />
          {data.departmentActivity.length > 0 ? (
            <DepartmentActivityChart data={data.departmentActivity} />
          ) : null}
        </>
      ) : null}
    </>
  );
}

export async function RailSection() {
  const user = await requireUser();
  const canSeeTeam = isManagerOrAdmin(user);
  const data = await getDashboardData(user);

  return (
    <>
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
    </>
  );
}

// ---------------------------------------------------------------------------
//  Fallbacks — shaped like the real thing so nothing jumps when it arrives
// ---------------------------------------------------------------------------

export function TodayCardFallback() {
  return (
    <Card className="overflow-hidden" aria-hidden="true">
      <div className="border-b border-border bg-surface-inset px-5 py-4">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-2 h-3 w-32" />
      </div>
      <div className="divide-y divide-border">
        {[0, 1].map((index) => (
          <div key={index} className="flex items-center justify-between gap-3 px-5 py-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-8 rounded-lg" />
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
            <Skeleton className="h-8 w-28 rounded-lg" />
          </div>
        ))}
      </div>
    </Card>
  );
}

export function StatGridFallback() {
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden="true">
      {[0, 1, 2, 3].map((index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
}

export function ChartsFallback() {
  return (
    <div className="grid gap-5 lg:grid-cols-2" aria-hidden="true">
      {[0, 1].map((index) => (
        <div key={index} className="rounded-xl border border-border bg-surface p-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-2 h-3 w-48" />
          <div className="mt-5 h-[150px]">
            <SkeletonChart />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PanelFallback({ rows = 4 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5" aria-hidden="true">
      <Skeleton className="h-4 w-28" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex items-center gap-2.5">
            <Skeleton className="size-6 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-2.5 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
