import type { DsrStatus } from "@/lib/constants/enums";

/**
 * Data-transfer shapes shared between server and client.
 *
 * These live outside `lib/services` on purpose: that module is marked
 * `server-only`, and while `import type` is erased at compile time, keeping the
 * contract in a neutral file makes the boundary explicit rather than incidental —
 * a client component can read this and know exactly what it receives.
 *
 * `Date` values cross the server→client boundary intact (React's RSC serialiser
 * supports them), so there's no need for string timestamps and re-parsing.
 */

export interface DsrAuthorDto {
  id: string;
  name: string;
  employeeCode: string;
  avatarUrl: string | null;
  designation: string | null;
  department: { id: string; name: string; color: string } | null;
  team: { id: string; name: string } | null;
  location: { id: string; name: string } | null;
  manager: { id: string; name: string } | null;
}

export interface DsrDto {
  id: string;
  /** Calendar day, normalised to UTC midnight. */
  date: Date;
  status: DsrStatus;
  tasksCompleted: string;
  blockers: string | null;
  nextSteps: string | null;
  notes: string | null;
  hoursWorked: number;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  reviewComment: string | null;
  reviewedBy: { id: string; name: string } | null;
  author: DsrAuthorDto;
  createdAt: Date;
  updatedAt: Date;
}
