import type { Role, UserStatus } from "@/lib/constants/enums";

/**
 * Organisation and people DTOs, shared across the server/client boundary.
 * See the note in `@/types/dsr` on why these live outside `lib/services`.
 */

export interface OrgOptions {
  departments: Array<{ id: string; name: string; color: string; memberCount: number }>;
  teams: Array<{ id: string; name: string; departmentId: string; departmentName: string }>;
  locations: Array<{ id: string; name: string; code: string; city: string }>;
  managers: Array<{ id: string; name: string; designation: string | null }>;
  employees: Array<{
    id: string;
    name: string;
    employeeCode: string;
    department: string | null;
    avatarUrl: string | null;
  }>;
}

export interface EmployeeDto {
  id: string;
  employeeCode: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  designation: string | null;
  avatarUrl: string | null;
  joinedAt: Date;
  phone: string | null;
  department: { id: string; name: string; color: string } | null;
  team: { id: string; name: string } | null;
  location: { id: string; name: string; city: string } | null;
  manager: { id: string; name: string; avatarUrl: string | null } | null;
  reportCount: number;
}

export interface DepartmentDto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  color: string;
  head: { id: string; name: string; avatarUrl: string | null } | null;
  teams: Array<{ id: string; name: string; memberCount: number }>;
  members: Array<{
    id: string;
    name: string;
    employeeCode: string;
    avatarUrl: string | null;
    designation: string | null;
    role: Role;
    teamName: string | null;
  }>;
  memberCount: number;
}
