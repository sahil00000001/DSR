import type { Metadata } from "next";
import { Building2, CalendarPlus, ShieldCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import {
  getHeadcountStats,
  getOrgOptions,
  listEmployees,
  nextEmployeeCode,
} from "@/lib/services/people";
import { employeeFilterSchema, parseSearchParams } from "@/lib/validation/schemas";
import { Directory } from "@/components/employees/directory";

export const metadata: Metadata = {
  title: "People",
  description: "The team directory.",
};

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const filters = parseSearchParams(employeeFilterSchema, await searchParams);
  const canManage = can.manageEmployees(user);

  const [employees, options, stats, suggestedCode] = await Promise.all([
    listEmployees(filters, user),
    getOrgOptions(),
    getHeadcountStats(),
    canManage ? nextEmployeeCode() : Promise.resolve(""),
  ]);

  return (
    <>
      <PageHeader
        title="People"
        description={
          canManage
            ? "Add, edit and organise everyone in the workspace."
            : "Find a colleague, their team, and how to reach them."
        }
      />

      <StatGrid className="mb-6">
        <StatCard
          label="Active people"
          value={stats.active}
          icon={<Users />}
          footnote={stats.disabled > 0 ? `${stats.disabled} disabled` : "Everyone has access"}
        />
        <StatCard
          label="Departments"
          value={options.departments.length}
          icon={<Building2 />}
          footnote={`${options.teams.length} teams`}
        />
        <StatCard
          label="Managers"
          value={stats.byRole.MANAGER ?? 0}
          icon={<ShieldCheck />}
          footnote={`${stats.byRole.ADMIN ?? 0} admins`}
        />
        <StatCard
          label="Joined this year"
          value={stats.joinedThisYear}
          icon={<CalendarPlus />}
          footnote={`${options.locations.length} office locations`}
        />
      </StatGrid>

      <Directory
        employees={employees}
        options={options}
        canManage={canManage}
        suggestedCode={suggestedCode}
      />
    </>
  );
}
