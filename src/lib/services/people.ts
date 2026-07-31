import "server-only";
import type { Prisma } from "@prisma/client";
import { containsInsensitive, prisma } from "@/lib/db/prisma";
import { asRole, asUserStatus } from "@/lib/constants/enums";
import { isManagerOrAdmin, type Actor } from "@/lib/auth/rbac";
import { lastNDays, today } from "@/lib/utils/date";
import type {
  DepartmentDto,
  EmployeeDto,
  OrgOptions as OrgOptionsDto,
} from "@/types/org";

/**
 * People directory and organisation structure.
 *
 * Field visibility is enforced here rather than in the UI: `listEmployees`
 * returns the directory-safe projection for everyone, while contact details
 * (phone, date of birth) are only included when the caller may see them. A
 * component can't leak a field it was never given.
 */

/** Shapes are declared in `@/types/org` so client components can import them. */
export type {
  DepartmentDto as DepartmentDetail,
  EmployeeDto as EmployeeListItem,
  OrgOptions,
} from "@/types/org";

// Re-exports don't create local bindings; alias the imported names for the
// signatures below.
type EmployeeListItem = EmployeeDto;
type DepartmentDetail = DepartmentDto;
type OrgOptions = OrgOptionsDto;

export interface EmployeeFilters {
  q?: string;
  department?: string[];
  team?: string[];
  location?: string[];
  role?: string[];
  status?: string[];
  sort?: "name-asc" | "name-desc" | "joined-desc" | "joined-asc" | "department";
}

const ORDER_BY: Record<
  NonNullable<EmployeeFilters["sort"]>,
  Prisma.UserOrderByWithRelationInput[]
> = {
  "name-asc": [{ name: "asc" }],
  "name-desc": [{ name: "desc" }],
  "joined-desc": [{ joinedAt: "desc" }],
  "joined-asc": [{ joinedAt: "asc" }],
  department: [{ department: { name: "asc" } }, { name: "asc" }],
};

export async function listEmployees(
  filters: EmployeeFilters,
  actor: Actor,
): Promise<EmployeeListItem[]> {
  const search = filters.q?.trim();
  const canSeeContactDetails = isManagerOrAdmin(actor);

  const where: Prisma.UserWhereInput = {
    ...(filters.department?.length ? { departmentId: { in: filters.department } } : {}),
    ...(filters.team?.length ? { teamId: { in: filters.team } } : {}),
    ...(filters.location?.length ? { locationId: { in: filters.location } } : {}),
    ...(filters.role?.length ? { role: { in: filters.role } } : {}),
    // Disabled accounts are admin-only noise; hide them unless asked for.
    ...(filters.status?.length
      ? { status: { in: filters.status } }
      : actor.role === "ADMIN"
        ? {}
        : { status: { not: "DISABLED" } }),
    ...(search
      ? {
          OR: [
            { name: containsInsensitive(search) },
            { email: containsInsensitive(search) },
            { employeeCode: containsInsensitive(search) },
            { designation: containsInsensitive(search) },
          ],
        }
      : {}),
  };

  const rows = await prisma.user.findMany({
    where,
    orderBy: ORDER_BY[filters.sort ?? "name-asc"],
    select: {
      id: true,
      employeeCode: true,
      name: true,
      email: true,
      role: true,
      status: true,
      designation: true,
      avatarUrl: true,
      joinedAt: true,
      phone: canSeeContactDetails,
      department: { select: { id: true, name: true, color: true } },
      team: { select: { id: true, name: true } },
      location: { select: { id: true, name: true, city: true } },
      manager: { select: { id: true, name: true, avatarUrl: true } },
      _count: { select: { reports: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    employeeCode: row.employeeCode,
    name: row.name,
    email: row.email,
    role: asRole(row.role),
    status: asUserStatus(row.status),
    designation: row.designation,
    avatarUrl: row.avatarUrl,
    joinedAt: row.joinedAt,
    phone: canSeeContactDetails ? (row.phone ?? null) : null,
    department: row.department,
    team: row.team,
    location: row.location,
    manager: row.manager,
    reportCount: row._count.reports,
  }));
}

export interface EmployeeProfile extends EmployeeListItem {
  bio: string | null;
  dateOfBirth: Date | null;
  lastLoginAt: Date | null;
  emailVerified: boolean;
  directReports: Array<{
    id: string;
    name: string;
    avatarUrl: string | null;
    designation: string | null;
  }>;
}

export async function getEmployeeProfile(
  id: string,
  actor: Actor,
): Promise<EmployeeProfile | null> {
  const canSeePrivate = isManagerOrAdmin(actor) || actor.id === id;

  const row = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      employeeCode: true,
      name: true,
      email: true,
      role: true,
      status: true,
      designation: true,
      avatarUrl: true,
      joinedAt: true,
      bio: true,
      phone: canSeePrivate,
      dateOfBirth: canSeePrivate,
      lastLoginAt: canSeePrivate,
      emailVerifiedAt: true,
      department: { select: { id: true, name: true, color: true } },
      team: { select: { id: true, name: true } },
      location: { select: { id: true, name: true, city: true } },
      manager: { select: { id: true, name: true, avatarUrl: true } },
      reports: {
        where: { status: { not: "DISABLED" } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, avatarUrl: true, designation: true },
      },
      _count: { select: { reports: true } },
    },
  });

  if (!row) return null;

  return {
    id: row.id,
    employeeCode: row.employeeCode,
    name: row.name,
    email: row.email,
    role: asRole(row.role),
    status: asUserStatus(row.status),
    designation: row.designation,
    avatarUrl: row.avatarUrl,
    joinedAt: row.joinedAt,
    bio: row.bio,
    phone: canSeePrivate ? (row.phone ?? null) : null,
    dateOfBirth: canSeePrivate ? (row.dateOfBirth ?? null) : null,
    lastLoginAt: canSeePrivate ? (row.lastLoginAt ?? null) : null,
    emailVerified: Boolean(row.emailVerifiedAt),
    department: row.department,
    team: row.team,
    location: row.location,
    manager: row.manager,
    directReports: row.reports,
    reportCount: row._count.reports,
  };
}

/** Recent activity for a profile timeline. */
export async function getEmployeeActivity(userId: string, days = 30) {
  const range = lastNDays(days);

  const [reports, leave, attendanceSummary] = await Promise.all([
    prisma.dailyStatusReport.findMany({
      where: { userId, date: { gte: range.start, lte: range.end } },
      orderBy: { date: "desc" },
      take: 10,
      select: { id: true, date: true, status: true, hoursWorked: true, tasksCompleted: true },
    }),
    prisma.leaveRequest.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, type: true, status: true, startDate: true, endDate: true, days: true },
    }),
    prisma.attendance.groupBy({
      by: ["status"],
      where: { userId, date: { gte: range.start, lte: range.end } },
      _count: { _all: true },
    }),
  ]);

  return { reports, leave, attendanceSummary, range };
}

// ---------------------------------------------------------------------------
//  Organisation structure
// ---------------------------------------------------------------------------

/**
 * Everything the filter bars and form pickers need, in one round trip.
 *
 * Called by most management screens, so it's a single batched query rather than
 * four separate fetches per page.
 */
export async function getOrgOptions(): Promise<OrgOptions> {
  const [departments, teams, locations, people] = await Promise.all([
    prisma.department.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true, _count: { select: { members: true } } },
    }),
    prisma.team.findMany({
      orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
      select: { id: true, name: true, departmentId: true, department: { select: { name: true } } },
    }),
    prisma.location.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true, city: true },
    }),
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        employeeCode: true,
        role: true,
        designation: true,
        avatarUrl: true,
        department: { select: { name: true } },
        _count: { select: { reports: true } },
      },
    }),
  ]);

  return {
    departments: departments.map((department) => ({
      id: department.id,
      name: department.name,
      color: department.color,
      memberCount: department._count.members,
    })),
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      departmentId: team.departmentId,
      departmentName: team.department.name,
    })),
    locations,
    // "Manager" for filtering means anyone who actually has reports — a role of
    // MANAGER with nobody reporting to them is noise in the picker.
    managers: people
      .filter((person) => person._count.reports > 0 || person.role !== "EMPLOYEE")
      .map((person) => ({ id: person.id, name: person.name, designation: person.designation })),
    employees: people.map((person) => ({
      id: person.id,
      name: person.name,
      employeeCode: person.employeeCode,
      department: person.department?.name ?? null,
      avatarUrl: person.avatarUrl,
    })),
  };
}

export async function listDepartments(): Promise<DepartmentDetail[]> {
  const rows = await prisma.department.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      color: true,
      head: { select: { id: true, name: true, avatarUrl: true } },
      teams: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, _count: { select: { members: true } } },
      },
      members: {
        where: { status: { not: "DISABLED" } },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          employeeCode: true,
          avatarUrl: true,
          designation: true,
          role: true,
          team: { select: { name: true } },
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    color: row.color,
    head: row.head,
    teams: row.teams.map((team) => ({
      id: team.id,
      name: team.name,
      memberCount: team._count.members,
    })),
    members: row.members.map((member) => ({
      id: member.id,
      name: member.name,
      employeeCode: member.employeeCode,
      avatarUrl: member.avatarUrl,
      designation: member.designation,
      role: asRole(member.role),
      teamName: member.team?.name ?? null,
    })),
    memberCount: row.members.length,
  }));
}

export async function getDepartmentBySlug(slug: string): Promise<DepartmentDetail | null> {
  const all = await listDepartments();
  return all.find((department) => department.slug === slug) ?? null;
}

/** Next employee code in sequence, e.g. CAD-021. */
export async function nextEmployeeCode(prefix = "CAD"): Promise<string> {
  const latest = await prisma.user.findMany({
    where: { employeeCode: { startsWith: `${prefix}-` } },
    select: { employeeCode: true },
  });

  const highest = latest.reduce((max, user) => {
    const parsed = Number.parseInt(user.employeeCode.split("-")[1] ?? "0", 10);
    return Number.isFinite(parsed) && parsed > max ? parsed : max;
  }, 0);

  return `${prefix}-${String(highest + 1).padStart(3, "0")}`;
}

/** Headcount tiles for the directory header. */
export async function getHeadcountStats() {
  const now = today();
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

  const [total, active, disabled, joinedThisYear, byRole] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { status: "DISABLED" } }),
    prisma.user.count({ where: { joinedAt: { gte: startOfYear } } }),
    prisma.user.groupBy({ by: ["role"], where: { status: "ACTIVE" }, _count: { _all: true } }),
  ]);

  return {
    total,
    active,
    disabled,
    joinedThisYear,
    byRole: byRole.reduce<Record<string, number>>((accumulator, group) => {
      accumulator[group.role] = group._count._all;
      return accumulator;
    }, {}),
  };
}
