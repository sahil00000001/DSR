import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, FileText, Flame, PenLine, Plus, Clock } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { NavTabs } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";
import { DsrCard } from "@/components/dsr/dsr-card";
import { requireUser } from "@/lib/auth/session";
import { isManagerOrAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { listMyReports } from "@/lib/services/dsr";
import { getReportStreak } from "@/lib/services/shell";
import {
  endOfMonth,
  formatDayShort,
  formatMonthLong,
  lastNDays,
  startOfMonth,
  toDayKey,
  today,
  workingDaysIn,
} from "@/lib/utils/date";
import { formatHours, formatPercent, percentage } from "@/lib/utils/format";
import { DSR_STATUS_LABEL, type DsrStatus } from "@/lib/constants/enums";

export const metadata: Metadata = {
  title: "My reports",
  description: "Your daily status report history.",
};

/**
 * Personal report history.
 *
 * Leads with a strip of the last three working weeks so gaps are visible at a
 * glance — a list of what you *did* file hides what you didn't, which is the more
 * useful information.
 */
export default async function MyReportsPage() {
  const user = await requireUser();
  const now = today();
  const monthRange = { start: startOfMonth(now), end: endOfMonth(now) };
  const stripRange = lastNDays(21, now);

  const [{ rows, total }, streak, monthReports, holidays] = await Promise.all([
    listMyReports(user.id, { pageSize: 12 }),
    getReportStreak(user.id),
    prisma.dailyStatusReport.findMany({
      where: { userId: user.id, date: { gte: stripRange.start, lte: stripRange.end } },
      select: { id: true, date: true, status: true, hoursWorked: true },
    }),
    prisma.holiday.findMany({
      where: { date: { gte: stripRange.start, lte: stripRange.end } },
      select: { date: true, name: true },
    }),
  ]);

  const holidayMap = new Map(holidays.map((holiday) => [toDayKey(holiday.date), holiday.name]));
  const reportMap = new Map(monthReports.map((report) => [toDayKey(report.date), report]));
  const workingDays = workingDaysIn(stripRange, new Set(holidayMap.keys()));

  const thisMonth = rows.filter(
    (report) => report.date >= monthRange.start && report.date <= monthRange.end,
  );
  const submittedThisMonth = thisMonth.filter((report) => report.status !== "DRAFT").length;
  const monthHours = thisMonth.reduce((sum, report) => sum + report.hoursWorked, 0);

  const filedInStrip = workingDays.filter((day) => {
    const report = reportMap.get(toDayKey(day));
    return report && report.status !== "DRAFT";
  }).length;

  const tabs = [
    { href: "/dsr", label: "My reports", exact: true },
    ...(isManagerOrAdmin(user) ? [{ href: "/dsr/review", label: "Team review" }] : []),
  ];

  return (
    <>
      <PageHeader
        title="My reports"
        description="Everything you've filed, and anything still open."
        tabs={tabs.length > 1 ? <NavTabs items={tabs} /> : undefined}
        actions={
          <ButtonLink href="/dsr/new" variant="primary" size="sm">
            <Plus className="size-4" />
            Write today&apos;s report
          </ButtonLink>
        }
      />

      <StatGrid className="mb-6">
        <StatCard
          label="Filed this month"
          value={submittedThisMonth}
          icon={<FileText />}
          footnote={formatMonthLong(now)}
        />
        <StatCard
          label="Current streak"
          value={streak}
          unit={streak === 1 ? "day" : "days"}
          icon={<Flame />}
          footnote={
            streak === 0
              ? "File today's report to start one"
              : streak >= 5
                ? "Excellent consistency"
                : "Keep it going"
          }
        />
        <StatCard
          label="Hours this month"
          value={formatHours(monthHours)}
          icon={<Clock />}
          footnote={
            submittedThisMonth > 0
              ? `${formatHours(monthHours / submittedThisMonth)} per report`
              : "No reports yet"
          }
        />
        <StatCard
          label="Last 3 weeks"
          value={formatPercent(percentage(filedInStrip, workingDays.length))}
          icon={<CalendarClock />}
          footnote={`${filedInStrip} of ${workingDays.length} working days`}
        />
      </StatGrid>

      {/* Gap strip — every working day of the last three weeks, filed or not. */}
      <Card className="mb-6">
        <CardContent className="pt-4">
          <SectionHeader
            title="Last three weeks"
            description="Each square is a working day. Click a gap to fill it in."
            className="mb-3"
          />
          <ul className="flex flex-wrap gap-1.5">
            {workingDays.map((day) => {
              const key = toDayKey(day);
              const report = reportMap.get(key);
              const status = (report?.status ?? null) as DsrStatus | null;
              const isToday = key === toDayKey(now);

              const tone =
                status === null
                  ? "border-dashed border-border-strong bg-surface-inset text-fg-subtle hover:border-accent hover:text-accent"
                  : status === "DRAFT"
                    ? "border-border-strong bg-surface-muted text-fg-muted"
                    : status === "FLAGGED"
                      ? "border-warning/40 bg-warning-soft text-warning-text"
                      : status === "REVIEWED"
                        ? "border-success/40 bg-success-soft text-success-text"
                        : "border-accent/40 bg-accent-soft text-accent";

              return (
                <li key={key}>
                  <Tooltip
                    content={
                      status
                        ? `${formatDayShort(day)} · ${DSR_STATUS_LABEL[status]} · ${formatHours(report!.hoursWorked)}`
                        : `${formatDayShort(day)} · nothing filed`
                    }
                  >
                    <Link
                      href={report ? `/dsr/${report.id}` : `/dsr/new?date=${key}`}
                      className={cn(
                        "grid h-11 w-[52px] place-items-center rounded-lg border text-center transition-colors",
                        tone,
                        isToday && "ring-2 ring-accent/40 ring-offset-1 ring-offset-canvas",
                      )}
                    >
                      <span className="block text-[9.5px] leading-none font-medium opacity-70">
                        {formatDayShort(day).split(",")[0]}
                      </span>
                      <span className="mt-0.5 block text-[13px] leading-none font-semibold tabular-nums">
                        {day.getUTCDate()}
                      </span>
                    </Link>
                  </Tooltip>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <SectionHeader
        title="Report history"
        description={`${total} report${total === 1 ? "" : "s"} in total`}
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText className="size-5" />}
            title="No reports yet"
            description="Your daily status report is how the rest of the team knows what you're working on. It takes about two minutes."
            action={
              <ButtonLink href="/dsr/new" variant="primary" size="sm">
                <PenLine className="size-4" />
                Write your first report
              </ButtonLink>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((report) => (
            <DsrCard
              key={report.id}
              report={report}
              headerActions={
                <ButtonLink
                  href={
                    report.status === "REVIEWED"
                      ? `/dsr/${report.id}`
                      : `/dsr/new?date=${toDayKey(report.date)}`
                  }
                  variant="ghost"
                  size="xs"
                >
                  {report.status === "REVIEWED" ? "View" : "Edit"}
                </ButtonLink>
              }
            />
          ))}

          {total > rows.length ? (
            <p className="pt-1 text-center text-[12.5px] text-fg-subtle">
              Showing the {rows.length} most recent of {total}. Older reports are available in{" "}
              <Link href="/reports" className="font-medium text-accent hover:underline">
                Reports
              </Link>
              .
            </p>
          ) : null}
        </div>
      )}
    </>
  );
}
