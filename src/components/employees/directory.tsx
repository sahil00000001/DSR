"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2,
  LayoutGrid,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  Rows3,
  Send,
  ShieldCheck,
  UserPlus,
  UserX,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, PersonCell } from "@/components/ui/avatar";
import { DataTable, type Column } from "@/components/ui/data-table";
import { SearchInput } from "@/components/ui/input";
import { FilterBar, FilterSelect } from "@/components/ui/filter-select";
import { SegmentedControl } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { DropdownMenu, MenuItem, MenuLink, MenuSeparator } from "@/components/ui/dropdown-menu";
import { usePopover } from "@/components/ui/popover";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { useDebouncedCallback } from "@/hooks/use-debounced-value";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { EmployeeFormDialog } from "@/components/employees/employee-form";
import {
  resendInviteAction,
  setEmployeeStatusAction,
} from "@/server/actions/employees";
import {
  ROLES,
  ROLE_LABEL,
  USER_STATUSES,
  USER_STATUS_LABEL,
} from "@/lib/constants/enums";
import { formatDay } from "@/lib/utils/date";
import { pluralize } from "@/lib/utils/format";
import type { EmployeeDto, OrgOptions } from "@/types/org";

/**
 * People directory.
 *
 * Two presentations of the same data: a card grid (good for putting names to
 * faces) and a table (good for scanning attributes). The choice is remembered per
 * device in localStorage, because it's a personal preference rather than
 * something worth putting in a URL people share.
 */
export function Directory({
  employees,
  options,
  canManage,
  suggestedCode,
}: {
  employees: EmployeeDto[];
  options: OrgOptions;
  canManage: boolean;
  suggestedCode: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const view = usePersistentState<"grid" | "table">("pmpl:directory-view", "grid");
  const [searchDraft, setSearchDraft] = useState(searchParams.get("q") ?? "");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EmployeeDto | null>(null);

  const setParams = (updates: Record<string, string | string[] | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      next.delete(key);
      if (value === null || (Array.isArray(value) && value.length === 0)) continue;
      next.set(key, Array.isArray(value) ? value.join(",") : value);
    }
    startTransition(() => router.replace(`/employees?${next.toString()}`, { scroll: false }));
  };

  const pushSearch = useDebouncedCallback((value: string) => setParams({ q: value || null }), 300);

  const readList = (key: string) => {
    const raw = searchParams.get(key);
    return raw ? raw.split(",").filter(Boolean) : [];
  };

  const activeFilters =
    ["department", "team", "location", "role", "status"].filter((key) => readList(key).length > 0)
      .length + (searchParams.get("q") ? 1 : 0);

  const grouped = useMemo(() => {
    const map = new Map<string, EmployeeDto[]>();
    for (const employee of employees) {
      const key = employee.department?.name ?? "No department";
      map.set(key, [...(map.get(key) ?? []), employee]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [employees]);

  return (
    <div className={cn("space-y-4", isPending && "opacity-70 transition-opacity")}>
      <FilterBar activeCount={activeFilters} onClear={() => router.replace("/employees")}>
        <SearchInput
          value={searchDraft}
          onValueChange={(value) => {
            setSearchDraft(value);
            pushSearch(value);
          }}
          placeholder="Search name, email, ID or title…"
          inputSize="sm"
          className="w-full sm:w-64"
        />

        <FilterSelect
          label="Department"
          icon={<Building2 />}
          selected={readList("department")}
          onChange={(values) => setParams({ department: values })}
          options={options.departments.map((department) => ({
            value: department.id,
            label: department.name,
            meta: pluralize(department.memberCount, "person", "people"),
            color: department.color,
          }))}
        />

        <FilterSelect
          label="Team"
          selected={readList("team")}
          onChange={(values) => setParams({ team: values })}
          options={options.teams.map((team) => ({
            value: team.id,
            label: team.name,
            meta: team.departmentName,
          }))}
        />

        <FilterSelect
          label="Location"
          icon={<MapPin />}
          selected={readList("location")}
          onChange={(values) => setParams({ location: values })}
          options={options.locations.map((location) => ({
            value: location.id,
            label: location.name,
            meta: location.city,
          }))}
        />

        <FilterSelect
          label="Role"
          icon={<ShieldCheck />}
          searchable={false}
          selected={readList("role")}
          onChange={(values) => setParams({ role: values })}
          options={ROLES.map((role) => ({ value: role, label: ROLE_LABEL[role] }))}
        />

        {canManage ? (
          <FilterSelect
            label="Status"
            searchable={false}
            selected={readList("status")}
            onChange={(values) => setParams({ status: values })}
            options={USER_STATUSES.map((status) => ({
              value: status,
              label: USER_STATUS_LABEL[status],
            }))}
          />
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <SegmentedControl
            label="View"
            size="sm"
            value={view.value}
            onChange={view.setValue}
            options={[
              { value: "grid", label: "", icon: <LayoutGrid />, title: "Card view" },
              { value: "table", label: "", icon: <Rows3 />, title: "Table view" },
            ]}
          />
          {canManage ? (
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              <UserPlus className="size-4" />
              Add
            </Button>
          ) : null}
        </div>
      </FilterBar>

      {employees.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="size-5" />}
            title="Nobody matches these filters"
            description="Try clearing a filter, or search for a different name."
            action={
              activeFilters > 0 ? (
                <Button variant="secondary" size="sm" onClick={() => router.replace("/employees")}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : view.value === "grid" ? (
        <div className="space-y-6">
          {grouped.map(([department, members]) => (
            <section key={department}>
              <h2 className="mb-2.5 flex items-center gap-2 text-[12.5px] font-semibold text-fg">
                {department}
                <span className="font-normal text-fg-subtle tabular-nums">{members.length}</span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {members.map((employee) => (
                  <EmployeeCard
                    key={employee.id}
                    employee={employee}
                    canManage={canManage}
                    onEdit={() => setEditing(employee)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <EmployeeTable
          employees={employees}
          canManage={canManage}
          onEdit={setEditing}
          onNavigate={(id) => router.push(`/employees/${id}`)}
        />
      )}

      {canManage ? (
        <>
          <EmployeeFormDialog
            open={creating}
            onClose={() => setCreating(false)}
            options={options}
            suggestedCode={suggestedCode}
          />
          <EmployeeFormDialog
            open={editing !== null}
            onClose={() => setEditing(null)}
            employee={editing}
            options={options}
            suggestedCode={suggestedCode}
          />
        </>
      ) : null}
    </div>
  );
}

function EmployeeCard({
  employee,
  canManage,
  onEdit,
}: {
  employee: EmployeeDto;
  canManage: boolean;
  onEdit: () => void;
}) {
  return (
    <Card interactive className="group relative flex flex-col p-4">
      {canManage ? (
        <div className="absolute top-3 right-3 z-10">
          <RowMenu employee={employee} onEdit={onEdit} />
        </div>
      ) : null}

      <Link href={`/employees/${employee.id}`} className="flex flex-col items-start">
        <Avatar name={employee.name} seed={employee.id} src={employee.avatarUrl} size="xl" />

        <h3 className="mt-3 text-[13.5px] font-semibold text-fg group-hover:underline">
          {employee.name}
        </h3>
        <p className="mt-0.5 text-[12px] text-fg-muted">
          {employee.designation ?? employee.employeeCode}
        </p>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {employee.role !== "EMPLOYEE" ? (
            <Badge tone={employee.role === "ADMIN" ? "accent" : "info"} size="sm">
              {ROLE_LABEL[employee.role]}
            </Badge>
          ) : null}
          {employee.status !== "ACTIVE" ? (
            <Badge tone={employee.status === "DISABLED" ? "danger" : "warning"} size="sm">
              {USER_STATUS_LABEL[employee.status]}
            </Badge>
          ) : null}
          {employee.team ? (
            <Badge tone="neutral" size="sm" variant="outline">
              {employee.team.name}
            </Badge>
          ) : null}
        </div>
      </Link>

      <div className="mt-3 space-y-1 border-t border-border pt-3 text-[11.5px] text-fg-subtle">
        <a
          href={`mailto:${employee.email}`}
          className="flex items-center gap-1.5 truncate transition-colors hover:text-accent"
        >
          <Mail className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{employee.email}</span>
        </a>
        {employee.phone ? (
          <a
            href={`tel:${employee.phone}`}
            className="flex items-center gap-1.5 transition-colors hover:text-accent"
          >
            <Phone className="size-3 shrink-0" aria-hidden="true" />
            {employee.phone}
          </a>
        ) : null}
        {employee.location ? (
          <p className="flex items-center gap-1.5">
            <MapPin className="size-3 shrink-0" aria-hidden="true" />
            {employee.location.city}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function EmployeeTable({
  employees,
  canManage,
  onEdit,
  onNavigate,
}: {
  employees: EmployeeDto[];
  canManage: boolean;
  onEdit: (employee: EmployeeDto) => void;
  onNavigate: (id: string) => void;
}) {
  const columns: Array<Column<EmployeeDto>> = [
    {
      id: "name",
      header: "Person",
      sortable: true,
      sortValue: (row) => row.name,
      cell: (row) => (
        <PersonCell
          name={row.name}
          seed={row.id}
          src={row.avatarUrl}
          meta={row.designation ?? row.employeeCode}
        />
      ),
    },
    {
      id: "department",
      header: "Department",
      hideBelow: "sm",
      sortable: true,
      sortValue: (row) => row.department?.name ?? "",
      cell: (row) =>
        row.department ? (
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: `var(--cat-${row.department.color})` }}
            />
            {row.department.name}
          </span>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    {
      id: "team",
      header: "Team",
      hideBelow: "lg",
      cell: (row) => row.team?.name ?? <span className="text-fg-subtle">—</span>,
    },
    {
      id: "location",
      header: "Location",
      hideBelow: "lg",
      cell: (row) => row.location?.name ?? <span className="text-fg-subtle">—</span>,
    },
    {
      id: "manager",
      header: "Manager",
      hideBelow: "xl",
      cell: (row) => row.manager?.name ?? <span className="text-fg-subtle">—</span>,
    },
    {
      id: "role",
      header: "Role",
      width: "1%",
      sortable: true,
      sortValue: (row) => row.role,
      cell: (row) => (
        <Badge
          tone={row.role === "ADMIN" ? "accent" : row.role === "MANAGER" ? "info" : "neutral"}
          size="sm"
        >
          {ROLE_LABEL[row.role]}
        </Badge>
      ),
    },
    {
      id: "joined",
      header: "Joined",
      hideBelow: "xl",
      sortable: true,
      sortValue: (row) => row.joinedAt,
      cell: (row) => <span className="whitespace-nowrap">{formatDay(row.joinedAt)}</span>,
    },
    ...(canManage
      ? [
          {
            id: "actions",
            header: "",
            align: "right" as const,
            width: "1%",
            cell: (row: EmployeeDto) => (
              <div onClick={(event) => event.stopPropagation()}>
                <RowMenu employee={row} onEdit={() => onEdit(row)} />
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <DataTable
      data={employees}
      columns={columns}
      rowKey={(row) => row.id}
      caption="Employee directory"
      onRowClick={(row) => onNavigate(row.id)}
      defaultSort={{ id: "name", direction: "asc" }}
      empty={<EmptyState title="No people found" size="sm" />}
    />
  );
}

/** Per-row admin actions. */
function RowMenu({ employee, onEdit }: { employee: EmployeeDto; onEdit: () => void }) {
  const { triggerProps, panelProps, close } = usePopover({ role: "menu" });
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();

  const toggleStatus = async () => {
    close();
    const disabling = employee.status !== "DISABLED";

    const result = await confirm({
      title: disabling ? `Disable ${employee.name}?` : `Re-enable ${employee.name}?`,
      description: disabling
        ? "They'll be signed out of every device immediately and won't be able to sign in. All their reports, attendance and leave history are kept."
        : "They'll be able to sign in again with their existing password.",
      confirmLabel: disabling ? "Disable account" : "Re-enable",
      tone: disabling ? "danger" : "default",
    });
    if (!result.confirmed) return;

    startTransition(async () => {
      const response = await setEmployeeStatusAction(
        employee.id,
        disabling ? "DISABLED" : "ACTIVE",
      );
      if (response.ok) {
        toast.success(response.message ?? "Updated");
        router.refresh();
      } else {
        toast.error("Couldn't update the account", response.message);
      }
    });
  };

  const resend = () => {
    close();
    startTransition(async () => {
      const response = await resendInviteAction(employee.id);
      if (response.ok) toast.success("Invitation sent", response.message);
      else toast.error("Couldn't send the invitation", response.message);
    });
  };

  return (
    <>
      <button
        type="button"
        {...triggerProps}
        aria-label={`Actions for ${employee.name}`}
        className="grid size-7 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
      >
        <MoreHorizontal className="size-4" />
      </button>

      <DropdownMenu {...panelProps} align="end">
        <MenuLink href={`/employees/${employee.id}`}>View profile</MenuLink>
        <MenuItem onClick={() => { close(); onEdit(); }}>Edit details</MenuItem>

        {employee.status === "INVITED" ? (
          <MenuItem onClick={resend} disabled={isPending}>
            <Send />
            Resend invitation
          </MenuItem>
        ) : null}

        <MenuSeparator />

        <MenuItem
          tone={employee.status === "DISABLED" ? "default" : "danger"}
          onClick={toggleStatus}
          disabled={isPending}
        >
          <UserX />
          {employee.status === "DISABLED" ? "Re-enable account" : "Disable account"}
        </MenuItem>
      </DropdownMenu>
    </>
  );
}
