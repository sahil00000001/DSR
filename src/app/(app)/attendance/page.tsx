import type { Metadata } from "next";
import { CalendarCheck, Clock, House, Plane, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { NavTabs } from "@/components/ui/tabs";
import { requireUser } from "@/lib/auth/session";
import { isManagerOrAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { getAttendanceMonth, getAttendanceSummary } from "@/lib/services/attendance";
import {
  endOfMonth,
  formatMonthLong,
  isWeekend,
  startOfMonth,
  toDayKey,
  today,
} from "@/lib/utils/date";
import { formatDuration, formatPercent } from "@/lib/utils/format";
import { MyAttendance } from "@/components/attendance/my-attendance";

export const metadata: Metadata = {
  title: "Attendance",
  description: "Your attendance history and today's status.",
};

/** Parses `?month=YYYY-MM`, falling back to the current month. */
function resolveMonth(value: string | undefined): Date {
  const match = value && /^\d{4}-\d{2}$/.test(value) ? value : null;
  if (!match) return startOfMonth(today());

  const [year, month] = match.split("-").map(Number);
  const candidate = new Date(Date.UTC(year!, month! - 1, 1));
  // Guard against ?month=9999-99 producing an Invalid Date.
  return Number.isNaN(candidate.getTime()) ? startOfMonth(today()) : candidate;
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireUser();
  const { month: monthParam } = await searchParams;

  const month = resolveMonth(monthParam);
  const monthKey = `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`;
  const now = today();

  const [days, summary, todayHoliday] = await Promise.all([
    getAttendanceMonth(user.id, month),
    getAttendanceSummary(user.id, { start: startOfMonth(month), end: endOfMonth(month) }),
    prisma.holiday.findFirst({
      where: { date: now, type: { in: ["PUBLIC", "COMPANY"] } },
      select: { name: true },
    }),
  ]);

  const todayRecord = days.find((day) => day.key === toDayKey(now));
  const canMarkToday = !isWeekend(now) && !todayHoliday;

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Your month at a glance. Mark today in a tap."
        tabs={
          isManagerOrAdmin(user) ? (
            <NavTabs
              items={[
                { href: "/attendance", label: "Mine", exact: true },
                { href: "/attendance/board", label: "Team board" },
              ]}
            />
          ) : undefined
        }
      />

      <StatGrid className="mb-6">
        <StatCard
          label="Days worked"
          value={summary.present + summary.wfh + summary.halfDay}
          unit={`of ${summary.workingDays}`}
          icon={<CalendarCheck />}
          footnote={formatMonthLong(month)}
        />
        <StatCard
          label="Attendance rate"
          value={formatPercent(summary.rate, 1)}
          icon={<TrendingUp />}
          footnote={
            summary.absent > 0
              ? `${summary.absent} unrecorded ${summary.absent === 1 ? "day" : "days"}`
              : "Fully recorded"
          }
        />
        <StatCard
          label="Remote days"
          value={summary.wfh}
          icon={<House />}
          footnote={summary.halfDay > 0 ? `${summary.halfDay} half ${summary.halfDay === 1 ? "day" : "days"}` : "In-office otherwise"}
        />
        <StatCard
          label="Time logged"
          value={formatDuration(summary.totalMinutes)}
          icon={<Clock />}
          footnote={summary.leave > 0 ? `${summary.leave} on leave` : undefined}
        />
      </StatGrid>

      {todayHoliday ? (
        <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-border bg-surface-inset px-4 py-3">
          <Plane className="size-4 shrink-0 text-cat-amber" aria-hidden="true" />
          <p className="text-[13px] text-fg-muted">
            Today is <span className="font-medium text-fg">{todayHoliday.name}</span> — enjoy it.
          </p>
        </div>
      ) : null}

      <MyAttendance
        days={days}
        monthKey={monthKey}
        todayKey={toDayKey(now)}
        todayStatus={todayRecord && !todayRecord.inferred ? todayRecord.status : null}
        todayNote={todayRecord?.note ?? null}
        canMarkToday={canMarkToday}
      />
    </>
  );
}
