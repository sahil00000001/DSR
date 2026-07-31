import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  Cake,
  CalendarCheck,
  CalendarPlus,
  Clock,
  FileText,
  Lock,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, PersonCell } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedMeter } from "@/components/ui/progress";
import { MarkdownView } from "@/components/markdown-view";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { getEmployeeActivity, getEmployeeProfile } from "@/lib/services/people";
import { getAttendanceSummary } from "@/lib/services/attendance";
import { getLeaveBalances } from "@/lib/services/leave";
import { getReportStreak } from "@/lib/services/shell";
import {
  DSR_STATUS_LABEL,
  DSR_STATUS_TONE,
  LEAVE_STATUS_LABEL,
  LEAVE_STATUS_TONE,
  LEAVE_TYPE_SHORT,
  ROLE_LABEL,
  USER_STATUS_LABEL,
  asDsrStatus,
  asLeaveStatus,
  asLeaveType,
} from "@/lib/constants/enums";
import { LEAVE_COLOR } from "@/lib/charts/palette";
import {
  differenceInDays,
  formatDay,
  formatDayFriendly,
  formatDayRange,
  lastNDays,
  today,
} from "@/lib/utils/date";
import {
  firstName,
  formatDuration,
  formatHours,
  formatPercent,
  truncate,
} from "@/lib/utils/format";
import { markdownToText } from "@/lib/utils/markdown";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const user = await requireUser();
  const profile = await getEmployeeProfile(id, user);
  return { title: profile?.name ?? "Employee not found" };
}

export default async function EmployeeProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const profile = await getEmployeeProfile(id, user);
  // A genuinely missing record is the only 404 here. Anyone may open a colleague's
  // profile; what appears on it is decided per-section below.
  if (!profile) notFound();

  const canSeePrivate = can.viewEmployeePrivateDetail(user, { id: profile.id });
  const range = lastNDays(30);

  /**
   * Private data is not fetched at all unless the viewer may see it.
   *
   * Skipping the queries rather than filtering afterwards means a colleague's
   * attendance and report history never enter the render tree — and it takes four
   * queries off the request for the common directory-browsing case.
   */
  const [activity, attendance, balances, streak] = canSeePrivate
    ? await Promise.all([
        getEmployeeActivity(profile.id, 30),
        getAttendanceSummary(profile.id, range),
        getLeaveBalances(profile.id),
        getReportStreak(profile.id),
      ])
    : [null, null, [], 0];

  const tenureDays = differenceInDays(profile.joinedAt, today());
  const tenureYears = Math.floor(tenureDays / 365);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "People", href: "/employees" }, { label: profile.name }]}
        title={profile.name}
        description={profile.designation ?? undefined}
        meta={
          <>
            <Badge
              tone={
                profile.role === "ADMIN" ? "accent" : profile.role === "MANAGER" ? "info" : "neutral"
              }
            >
              {ROLE_LABEL[profile.role]}
            </Badge>
            {profile.status !== "ACTIVE" ? (
              <Badge tone={profile.status === "DISABLED" ? "danger" : "warning"}>
                {USER_STATUS_LABEL[profile.status]}
              </Badge>
            ) : null}
            <Badge tone="neutral" variant="outline">
              {profile.employeeCode}
            </Badge>
            {profile.department ? (
              <Badge tone="neutral" variant="outline">
                {profile.department.name}
              </Badge>
            ) : null}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Identity card */}
        <aside className="space-y-5">
          <Card>
            <CardContent className="pt-5">
              <div className="flex flex-col items-center text-center">
                <Avatar
                  name={profile.name}
                  seed={profile.id}
                  src={profile.avatarUrl}
                  size="2xl"
                />
                <h2 className="mt-3 text-[15px] font-semibold text-fg">{profile.name}</h2>
                {profile.designation ? (
                  <p className="mt-0.5 text-[12.5px] text-fg-muted">{profile.designation}</p>
                ) : null}
              </div>

              <dl className="mt-5 space-y-3 border-t border-border pt-4 text-[12.5px]">
                <Detail icon={<Mail />} label="Email">
                  <a
                    href={`mailto:${profile.email}`}
                    className="break-all text-fg transition-colors hover:text-accent"
                  >
                    {profile.email}
                  </a>
                </Detail>

                {profile.phone ? (
                  <Detail icon={<Phone />} label="Phone">
                    <a
                      href={`tel:${profile.phone}`}
                      className="text-fg transition-colors hover:text-accent"
                    >
                      {profile.phone}
                    </a>
                  </Detail>
                ) : null}

                {profile.department ? (
                  <Detail icon={<Building2 />} label="Department">
                    <Link
                      href="/departments"
                      className="flex items-center gap-1.5 text-fg hover:underline"
                    >
                      <span
                        aria-hidden="true"
                        className="size-2 rounded-full"
                        style={{ backgroundColor: `var(--cat-${profile.department.color})` }}
                      />
                      {profile.department.name}
                      {profile.team ? ` · ${profile.team.name}` : ""}
                    </Link>
                  </Detail>
                ) : null}

                {profile.location ? (
                  <Detail icon={<MapPin />} label="Location">
                    <span className="text-fg">
                      {profile.location.name} · {profile.location.city}
                    </span>
                  </Detail>
                ) : null}

                {profile.manager ? (
                  <Detail icon={<ShieldCheck />} label="Reports to">
                    <Link href={`/employees/${profile.manager.id}`} className="hover:underline">
                      <PersonCell
                        name={profile.manager.name}
                        seed={profile.manager.id}
                        src={profile.manager.avatarUrl}
                        size="xs"
                      />
                    </Link>
                  </Detail>
                ) : null}

                <Detail icon={<CalendarPlus />} label="Joined">
                  <span className="text-fg">{formatDay(profile.joinedAt)}</span>
                  <span className="block text-fg-subtle">
                    {tenureYears >= 1
                      ? `${tenureYears} ${tenureYears === 1 ? "year" : "years"} with the team`
                      : `${tenureDays} days with the team`}
                  </span>
                </Detail>

                {profile.dateOfBirth ? (
                  <Detail icon={<Cake />} label="Birthday">
                    <span className="text-fg">
                      {formatDay(profile.dateOfBirth).replace(/ \d{4}$/, "")}
                    </span>
                  </Detail>
                ) : null}
              </dl>

              {profile.bio ? (
                <div className="mt-4 border-t border-border pt-4">
                  <MarkdownView source={profile.bio} className="text-[12.5px]" />
                </div>
              ) : null}
            </CardContent>
          </Card>

          {profile.directReports.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="size-3.5 text-fg-subtle" aria-hidden="true" />
                  Direct reports
                  <span className="font-normal text-fg-subtle tabular-nums">
                    {profile.directReports.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="space-y-2.5">
                  {profile.directReports.map((report) => (
                    <li key={report.id}>
                      <Link href={`/employees/${report.id}`} className="block hover:underline">
                        <PersonCell
                          name={report.name}
                          seed={report.id}
                          src={report.avatarUrl}
                          size="sm"
                          meta={report.designation ?? undefined}
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {balances.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Leave balance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {balances.map((balance) => (
                  <div key={balance.type}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-[12px] font-medium text-fg">
                        <span
                          aria-hidden="true"
                          className="size-2 rounded-full"
                          style={{ backgroundColor: LEAVE_COLOR[balance.type] }}
                        />
                        {LEAVE_TYPE_SHORT[balance.type]}
                      </span>
                      <span className="text-[11.5px] text-fg-muted tabular-nums">
                        {balance.available} / {balance.allocated}
                      </span>
                    </div>
                    <SegmentedMeter
                      used={balance.used}
                      pending={balance.pending}
                      total={balance.allocated}
                      tone={balance.available === 0 ? "danger" : "accent"}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </aside>

        {/* Activity — private to the person themselves and their management line. */}
        <div className="min-w-0 space-y-5">
          {!canSeePrivate || !activity || !attendance ? (
            <Card>
              <EmptyState
                icon={<Lock className="size-5" />}
                title={`${firstName(profile.name)}'s activity is private`}
                description={
                  "Status reports, attendance and leave are visible to the person themselves, " +
                  "their manager and admins. Everything else on this page is open to the team."
                }
              />
            </Card>
          ) : (
            <>
          <StatGrid columns={4}>
            <StatCard
              label="Reports (30d)"
              value={activity.reports.length}
              icon={<FileText />}
              footnote={`Streak: ${streak} ${streak === 1 ? "day" : "days"}`}
            />
            <StatCard
              label="Attendance"
              value={formatPercent(attendance.rate, 0)}
              icon={<CalendarCheck />}
              footnote={`${attendance.present + attendance.wfh} of ${attendance.workingDays} days`}
            />
            <StatCard
              label="Time logged"
              value={formatDuration(attendance.totalMinutes)}
              icon={<Clock />}
              footnote={formatDayRange(range)}
            />
            <StatCard
              label="Leave taken"
              value={attendance.leave}
              icon={<CalendarPlus />}
              footnote="In the last 30 days"
            />
          </StatGrid>

          <Card>
            <CardHeader>
              <CardTitle>Recent reports</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {activity.reports.length === 0 ? (
                <EmptyState
                  size="sm"
                  icon={<FileText className="size-4" />}
                  title="No reports in the last 30 days"
                />
              ) : (
                <ul className="divide-y divide-border">
                  {activity.reports.map((report) => (
                    <li key={report.id}>
                      <Link
                        href={`/dsr/${report.id}`}
                        className="flex items-start gap-3 py-2.5 transition-colors hover:bg-surface-hover"
                      >
                        <span className="w-16 shrink-0 text-[11.5px] text-fg-subtle tabular-nums">
                          {formatDayFriendly(report.date)}
                        </span>
                        <span className="min-w-0 flex-1 text-[12.5px] text-fg-muted">
                          {truncate(markdownToText(report.tasksCompleted), 120)}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="text-[11.5px] text-fg-subtle tabular-nums">
                            {formatHours(report.hoursWorked)}
                          </span>
                          <Badge tone={DSR_STATUS_TONE[asDsrStatus(report.status)]} size="sm">
                            {DSR_STATUS_LABEL[asDsrStatus(report.status)]}
                          </Badge>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {activity.leave.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Leave history</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="divide-y divide-border">
                  {activity.leave.map((request) => (
                    <li key={request.id} className="flex items-center gap-3 py-2.5">
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: LEAVE_COLOR[asLeaveType(request.type)] }}
                      />
                      <span className="min-w-0 flex-1 text-[12.5px] text-fg">
                        {LEAVE_TYPE_SHORT[asLeaveType(request.type)]} ·{" "}
                        <span className="text-fg-muted">
                          {formatDayRange({ start: request.startDate, end: request.endDate })}
                        </span>
                      </span>
                      <span className="shrink-0 text-[11.5px] text-fg-subtle tabular-nums">
                        {request.days}d
                      </span>
                      <Badge tone={LEAVE_STATUS_TONE[asLeaveStatus(request.status)]} size="sm">
                        {LEAVE_STATUS_LABEL[asLeaveStatus(request.status)]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Detail({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="mb-0.5 flex items-center gap-1.5 text-[10.5px] font-semibold tracking-wide text-fg-subtle uppercase">
        <span className="[&>svg]:size-3" aria-hidden="true">
          {icon}
        </span>
        {label}
      </dt>
      <dd className="text-fg-muted">{children}</dd>
    </div>
  );
}
