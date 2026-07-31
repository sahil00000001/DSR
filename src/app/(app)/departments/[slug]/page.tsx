import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  ClipboardList,
  Clock,
  FileSpreadsheet,
  FileText,
  Lock,
  TrendingUp,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PersonCell } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { PrintButton } from "@/components/ui/print-button";
import { DepartmentReportFeed } from "@/components/departments/department-report-feed";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { getDepartmentBySlug } from "@/lib/services/people";
import { getCompletionByEmployee, listDsrBoard } from "@/lib/services/dsr";
import { getDepartmentActivity } from "@/lib/services/analytics";
import { dsrFilterSchema, parseSearchParams } from "@/lib/validation/schemas";
import { formatDayRange, lastNDays } from "@/lib/utils/date";
import { formatHours, formatPercent, pluralize } from "@/lib/utils/format";
import { ROLE_LABEL } from "@/lib/constants/enums";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const department = await getDepartmentBySlug(slug);
  return { title: department?.name ?? "Department not found" };
}

/**
 * Department detail — the whole department's status reporting in one place.
 *
 * This route was already linked from the ⌘K palette but had never been built, so
 * searching a department and opening it 404'd.
 *
 * Access mirrors the employee profile: anyone may see the department, its teams and
 * who is in it (that's directory information). The *status reports* section is
 * management-only — it aggregates colleagues' daily reports, which an employee has
 * no business reading in bulk.
 */
export default async function DepartmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { slug } = await params;

  const department = await getDepartmentBySlug(slug);
  if (!department) notFound();

  const canSeeReports = can.viewDsrBoard(user);
  const raw = await searchParams;
  const filters = parseSearchParams(dsrFilterSchema, raw);
  const range = lastNDays(30);

  /**
   * Scoped by department id at the query level, not filtered afterwards — and it
   * reuses the same `listDsrBoard` the review board uses, so the role scoping,
   * ordering and status semantics are identical rather than reimplemented.
   */
  const [board, activity, completion] = canSeeReports
    ? await Promise.all([
        listDsrBoard(
          {
            ...filters,
            department: [department.id],
            range: filters.range ?? "last-30",
            size: filters.size ?? 50,
          },
          user,
        ),
        getDepartmentActivity(range, user),
        getCompletionByEmployee(range, user),
      ])
    : [null, null, null];

  const stats = activity?.find((row) => row.id === department.id) ?? null;

  // Completion is org-wide; narrow it to this department's members.
  const memberIds = new Set(department.members.map((member) => member.id));
  const departmentCompletion = (completion ?? []).filter((row) => memberIds.has(row.user.id));

  const exportHref = `/api/export/dsr?department=${department.id}&range=last-30&format=xlsx`;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Departments", href: "/departments" }, { label: department.name }]}
        title={
          <span className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: `var(--cat-${department.color})` }}
            />
            {department.name}
          </span>
        }
        description={department.description ?? undefined}
        meta={
          <>
            <Badge tone="neutral" variant="outline">
              {pluralize(department.memberCount, "person", "people")}
            </Badge>
            {department.teams.length > 0 ? (
              <Badge tone="neutral" variant="outline">
                {pluralize(department.teams.length, "team")}
              </Badge>
            ) : null}
            {department.head ? (
              <Badge tone="accent" variant="outline">
                Led by {department.head.name}
              </Badge>
            ) : null}
          </>
        }
        actions={
          canSeeReports ? (
            <>
              <PrintButton label="Print digest" />
              <a
                href={exportHref}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-[12.5px] font-medium text-fg shadow-xs transition-colors hover:bg-surface-hover"
              >
                <FileSpreadsheet className="size-3.5" />
                Excel
              </a>
              <ButtonLink
                href={`/dsr/review?department=${department.id}&range=last-30`}
                variant="primary"
                size="sm"
              >
                <ClipboardList className="size-4" />
                Review queue
              </ButtonLink>
            </>
          ) : undefined
        }
      />

      {canSeeReports && stats ? (
        <StatGrid className="mb-6">
          <StatCard
            label="Reports filed"
            value={stats.reports}
            icon={<FileText />}
            footnote={`Last 30 days · ${formatDayRange(range)}`}
          />
          <StatCard
            label="Completion"
            value={formatPercent(stats.completionRate)}
            icon={<TrendingUp />}
            footnote="Against expected working days"
          />
          <StatCard
            label="Hours logged"
            value={formatHours(stats.hours)}
            icon={<Clock />}
            footnote={`${formatHours(stats.avgHoursPerReport)} per report`}
          />
          <StatCard
            label="People reporting"
            value={departmentCompletion.filter((row) => row.submitted > 0).length}
            unit={`of ${department.memberCount}`}
            icon={<Users />}
            footnote={
              board ? `${board.summary.byStatus.SUBMITTED} awaiting review` : undefined
            }
          />
        </StatGrid>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Status reports — the point of this page */}
        <div className="min-w-0">
          {!canSeeReports ? (
            <Card>
              <EmptyState
                icon={<Lock className="size-5" />}
                title="Status reports are private"
                description="A department's daily reports are visible to managers and admins. You can still see who's in the team on the right."
              />
            </Card>
          ) : board && board.rows.length === 0 ? (
            <Card>
              <EmptyState
                icon={<FileText className="size-5" />}
                title={`No reports from ${department.name} in this period`}
                description="Nothing has been filed in the last 30 days. Widen the range from the review queue, or check whether the team has been onboarded."
                action={
                  <ButtonLink href="/dsr/review" variant="secondary" size="sm">
                    Open review queue
                  </ButtonLink>
                }
              />
            </Card>
          ) : board ? (
            <DepartmentReportFeed
              reports={board.rows}
              total={board.total}
              summary={board.summary}
              departmentName={department.name}
              rangeLabel={formatDayRange(board.range)}
              currentUserId={user.id}
            />
          ) : null}
        </div>

        {/* Team roster + per-person completion */}
        <aside className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-3.5 text-fg-subtle" aria-hidden="true" />
                Team
                <span className="font-normal text-fg-subtle tabular-nums">
                  {department.memberCount}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {department.members.length === 0 ? (
                <EmptyState size="sm" title="Nobody assigned yet" />
              ) : (
                <ul className="space-y-2.5">
                  {department.members.map((member) => {
                    const row = departmentCompletion.find((entry) => entry.user.id === member.id);
                    return (
                      <li key={member.id}>
                        <Link href={`/employees/${member.id}`} className="block">
                          <div className="flex items-center gap-2">
                            <PersonCell
                              name={member.name}
                              seed={member.id}
                              src={member.avatarUrl}
                              size="sm"
                              meta={member.designation ?? member.teamName ?? undefined}
                              className="min-w-0 flex-1"
                            />
                            {member.role !== "EMPLOYEE" ? (
                              <Badge
                                tone={member.role === "ADMIN" ? "accent" : "info"}
                                size="sm"
                                className="shrink-0"
                              >
                                {ROLE_LABEL[member.role]}
                              </Badge>
                            ) : null}
                          </div>

                          {/* Per-person completion, so it's obvious who is behind. */}
                          {canSeeReports && row ? (
                            <div className="mt-1.5 flex items-center gap-2 pl-[34px]">
                              <Progress
                                value={row.rate}
                                tone={
                                  row.rate >= 80 ? "success" : row.rate >= 50 ? "warning" : "danger"
                                }
                                size="sm"
                                label={`${member.name} report completion`}
                              />
                              <span className="w-16 shrink-0 text-right text-[10.5px] text-fg-subtle tabular-nums">
                                {row.submitted}/{row.expected}
                              </span>
                            </div>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {department.teams.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="size-3.5 text-fg-subtle" aria-hidden="true" />
                  Teams
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="space-y-1.5">
                  {department.teams.map((team) => (
                    <li
                      key={team.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-inset px-2.5 py-2"
                    >
                      <span className="truncate text-[12.5px] font-medium text-fg">{team.name}</span>
                      <Badge tone="neutral" size="sm" variant="outline">
                        {team.memberCount}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </>
  );
}
