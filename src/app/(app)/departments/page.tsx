import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AvatarStack, PersonCell } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { getOrgOptions, listDepartments } from "@/lib/services/people";
import { getDepartmentActivity } from "@/lib/services/analytics";
import { lastNDays } from "@/lib/utils/date";
import { formatHours, formatPercent, pluralize } from "@/lib/utils/format";
import { ROLE_LABEL } from "@/lib/constants/enums";
import { DepartmentAdmin } from "@/components/departments/department-admin";

export const metadata: Metadata = {
  title: "Departments",
  description: "How the organisation is structured.",
};

export default async function DepartmentsPage() {
  const user = await requireUser();
  const canManage = can.manageDepartments(user);
  const range = lastNDays(30);

  const [departments, activity, options] = await Promise.all([
    listDepartments(),
    getDepartmentActivity(range, user),
    getOrgOptions(),
  ]);

  const activityById = new Map(activity.map((row) => [row.id, row]));
  const totalPeople = departments.reduce((sum, department) => sum + department.memberCount, 0);
  const totalTeams = departments.reduce((sum, department) => sum + department.teams.length, 0);
  const unassigned = options.employees.length - totalPeople;

  return (
    <>
      <PageHeader
        title="Departments"
        description="Every department, its teams, and who belongs where."
        actions={
          canManage ? <DepartmentAdmin options={options} departments={departments} /> : undefined
        }
      />

      <StatGrid columns={4} className="mb-6">
        <StatCard label="Departments" value={departments.length} icon={<Building2 />} />
        <StatCard
          label="Teams"
          value={totalTeams}
          icon={<Users />}
          footnote="Across all departments"
        />
        <StatCard
          label="People assigned"
          value={totalPeople}
          icon={<Users />}
          footnote={unassigned > 0 ? `${unassigned} not yet assigned` : "Everyone has a department"}
        />
        <StatCard
          label="Reports (30d)"
          value={activity.reduce((sum, row) => sum + row.reports, 0)}
          footnote="Status reports filed"
        />
      </StatGrid>

      {departments.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Building2 className="size-5" />}
            title="No departments yet"
            description="Departments group people for reporting, filtering and analytics. Create the first one to get started."
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {departments.map((department) => {
            const stats = activityById.get(department.id);

            return (
              <Card key={department.id}>
                <CardHeader
                  actions={
                    stats ? (
                      <div className="flex flex-wrap items-center gap-3 text-[11.5px] text-fg-muted">
                        <span>
                          <span className="font-semibold text-fg tabular-nums">
                            {stats.reports}
                          </span>{" "}
                          reports
                        </span>
                        <span>
                          <span className="font-semibold text-fg tabular-nums">
                            {formatHours(stats.hours)}
                          </span>{" "}
                          logged
                        </span>
                        <Badge
                          tone={
                            stats.completionRate >= 80
                              ? "success"
                              : stats.completionRate >= 50
                                ? "warning"
                                : "danger"
                          }
                          size="sm"
                        >
                          {formatPercent(stats.completionRate)} completion
                        </Badge>
                      </div>
                    ) : null
                  }
                >
                  <CardTitle>
                    <Link
                      href={`/departments/${department.slug}`}
                      className="group flex items-center gap-2 rounded outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                    >
                      <span
                        aria-hidden="true"
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: `var(--cat-${department.color})` }}
                      />
                      <span className="group-hover:underline">{department.name}</span>
                      <span className="text-[12px] font-normal text-fg-subtle tabular-nums">
                        {pluralize(department.memberCount, "person", "people")}
                      </span>
                      <ArrowRight
                        className="size-3.5 -translate-x-1 text-fg-subtle opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
                        aria-hidden="true"
                      />
                    </Link>
                  </CardTitle>
                  {department.description ? (
                    <p className="text-[13px] text-fg-muted">{department.description}</p>
                  ) : null}
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    {department.head ? (
                      <div>
                        <p className="mb-1 text-[10.5px] font-semibold tracking-wide text-fg-subtle uppercase">
                          Department head
                        </p>
                        <Link href={`/employees/${department.head.id}`} className="hover:underline">
                          <PersonCell
                            name={department.head.name}
                            seed={department.head.id}
                            src={department.head.avatarUrl}
                            size="sm"
                          />
                        </Link>
                      </div>
                    ) : null}

                    {department.teams.length > 0 ? (
                      <div>
                        <p className="mb-1.5 text-[10.5px] font-semibold tracking-wide text-fg-subtle uppercase">
                          Teams
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {department.teams.map((team) => (
                            <Badge key={team.id} tone="neutral" variant="outline">
                              {team.name}
                              <span className="text-fg-subtle tabular-nums">{team.memberCount}</span>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {department.members.length === 0 ? (
                    <p className="text-[12.5px] text-fg-subtle italic">
                      Nobody is assigned to this department yet.
                    </p>
                  ) : (
                    <div>
                      <div className="mb-2.5 flex items-center justify-between gap-3">
                        <p className="text-[10.5px] font-semibold tracking-wide text-fg-subtle uppercase">
                          Members
                        </p>
                        <AvatarStack
                          people={department.members.map((member) => ({
                            id: member.id,
                            name: member.name,
                            avatarUrl: member.avatarUrl,
                          }))}
                          max={8}
                        />
                      </div>

                      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {department.members.map((member) => (
                          <li key={member.id}>
                            <Link
                              href={`/employees/${member.id}`}
                              className="row-hover flex items-center gap-2.5 rounded-lg border border-border bg-surface-inset px-2.5 py-2"
                            >
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
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
