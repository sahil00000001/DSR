import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Actor } from "@/lib/auth/rbac";
import { listDsrForExport, resolveDateRange, getCompletionByEmployee } from "@/lib/services/dsr";
import { getAttendanceBoard } from "@/lib/services/attendance";
import { listLeaveRequests } from "@/lib/services/leave";
import { listEmployees } from "@/lib/services/people";
import { markdownToText } from "@/lib/utils/markdown";
import {
  ATTENDANCE_STATUS_LABEL,
  DSR_STATUS_LABEL,
  LEAVE_STATUS_LABEL,
  LEAVE_TYPE_LABEL,
  ROLE_LABEL,
  USER_STATUS_LABEL,
} from "@/lib/constants/enums";
import { endOfMonth, startOfMonth, toDayKey, today } from "@/lib/utils/date";
import type { DsrFilterInput } from "@/lib/validation/schemas";

/**
 * Export datasets.
 *
 * Each entry returns rows plus a column definition, so CSV and XLSX are generated
 * from the *same* description — there's no way for the two formats to drift out of
 * sync, and adding a column is a one-line change.
 *
 * Column values are flat scalars on purpose: a spreadsheet is a grid, and nested
 * objects or Markdown belong flattened before they get here.
 */

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number | boolean | Date | null | undefined;
  width?: number;
}

export interface Dataset<T = unknown> {
  filename: string;
  sheetName: string;
  rows: readonly T[];
  columns: Array<ExportColumn<T>>;
}

export type ExportKind =
  | "dsr"
  | "attendance"
  | "leave"
  | "employees"
  | "departments"
  | "dsr-completion";

/** Reads a `?month=YYYY-MM` param, defaulting to the current month. */
function monthRange(monthParam: string | null) {
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const start = new Date(
      Date.UTC(Number(monthParam.slice(0, 4)), Number(monthParam.slice(5, 7)) - 1, 1),
    );
    return { start: startOfMonth(start), end: endOfMonth(start) };
  }
  const now = today();
  return { start: startOfMonth(now), end: endOfMonth(now) };
}

export async function buildDataset(
  kind: ExportKind,
  actor: Actor,
  params: URLSearchParams,
  filters: DsrFilterInput,
): Promise<Dataset> {
  switch (kind) {
    case "dsr": {
      const rows = await listDsrForExport(filters, actor);
      return {
        filename: "status-reports",
        sheetName: "Status reports",
        rows,
        columns: [
          { header: "Date", value: (row) => row.date, width: 12 },
          { header: "Employee", value: (row) => row.author.name, width: 22 },
          { header: "Employee ID", value: (row) => row.author.employeeCode, width: 12 },
          { header: "Designation", value: (row) => row.author.designation ?? "", width: 22 },
          { header: "Department", value: (row) => row.author.department?.name ?? "", width: 18 },
          { header: "Team", value: (row) => row.author.team?.name ?? "", width: 16 },
          { header: "Location", value: (row) => row.author.location?.name ?? "", width: 16 },
          { header: "Manager", value: (row) => row.author.manager?.name ?? "", width: 20 },
          { header: "Status", value: (row) => DSR_STATUS_LABEL[row.status], width: 14 },
          { header: "Hours", value: (row) => row.hoursWorked, width: 8 },
          // Markdown is flattened to prose: a spreadsheet cell can't render it.
          { header: "Completed", value: (row) => markdownToText(row.tasksCompleted), width: 64 },
          { header: "Blockers", value: (row) => (row.blockers ? markdownToText(row.blockers) : ""), width: 40 },
          { header: "Next steps", value: (row) => (row.nextSteps ? markdownToText(row.nextSteps) : ""), width: 40 },
          { header: "Notes", value: (row) => (row.notes ? markdownToText(row.notes) : ""), width: 32 },
          { header: "Submitted at", value: (row) => row.submittedAt, width: 18 },
          { header: "Reviewed by", value: (row) => row.reviewedBy?.name ?? "", width: 20 },
          { header: "Review note", value: (row) => row.reviewComment ?? "", width: 32 },
        ] satisfies Array<ExportColumn<(typeof rows)[number]>>,
      } as Dataset;
    }

    case "attendance": {
      const range = monthRange(params.get("month"));
      const board = await getAttendanceBoard(range, actor, {
        department: params.get("department")?.split(",").filter(Boolean),
        location: params.get("location")?.split(",").filter(Boolean),
        q: params.get("q") ?? undefined,
      });

      // One row per person per day — the shape that pivots usefully in Excel.
      const rows = board.people.flatMap((person) =>
        person.days.map((day) => ({
          person: person.name,
          code: person.employeeCode,
          department: person.department ?? "",
          date: day.date,
          status: ATTENDANCE_STATUS_LABEL[day.status],
          minutes: day.workedMinutes,
          note: day.note ?? "",
          recorded: !day.inferred,
        })),
      );

      return {
        filename: `attendance-${toDayKey(range.start).slice(0, 7)}`,
        sheetName: "Attendance",
        rows,
        columns: [
          { header: "Date", value: (row) => row.date, width: 12 },
          { header: "Employee", value: (row) => row.person, width: 22 },
          { header: "Employee ID", value: (row) => row.code, width: 12 },
          { header: "Department", value: (row) => row.department, width: 18 },
          { header: "Status", value: (row) => row.status, width: 16 },
          { header: "Minutes worked", value: (row) => row.minutes, width: 14 },
          { header: "Explicitly recorded", value: (row) => row.recorded, width: 18 },
          { header: "Note", value: (row) => row.note, width: 36 },
        ] satisfies Array<ExportColumn<(typeof rows)[number]>>,
      } as Dataset;
    }

    case "leave": {
      const { rows } = await listLeaveRequests(
        actor,
        {
          status: params.get("status")?.split(",").filter(Boolean),
          type: params.get("type")?.split(",").filter(Boolean),
          department: params.get("department")?.split(",").filter(Boolean),
          q: params.get("q") ?? undefined,
        },
        { pageSize: 2000 },
      );

      return {
        filename: "leave-requests",
        sheetName: "Leave",
        rows,
        columns: [
          { header: "Employee", value: (row) => row.user.name, width: 22 },
          { header: "Employee ID", value: (row) => row.user.employeeCode, width: 12 },
          { header: "Department", value: (row) => row.user.department?.name ?? "", width: 18 },
          { header: "Type", value: (row) => LEAVE_TYPE_LABEL[row.type], width: 14 },
          { header: "From", value: (row) => row.startDate, width: 12 },
          { header: "To", value: (row) => row.endDate, width: 12 },
          { header: "Days", value: (row) => row.days, width: 8 },
          { header: "Half day", value: (row) => row.halfDay, width: 10 },
          { header: "Status", value: (row) => LEAVE_STATUS_LABEL[row.status], width: 12 },
          { header: "Reason", value: (row) => row.reason, width: 48 },
          { header: "Decided by", value: (row) => row.decidedBy?.name ?? "", width: 20 },
          { header: "Decided at", value: (row) => row.decidedAt, width: 18 },
          { header: "Decision note", value: (row) => row.decisionNote ?? "", width: 36 },
          { header: "Requested at", value: (row) => row.createdAt, width: 18 },
        ] satisfies Array<ExportColumn<(typeof rows)[number]>>,
      } as Dataset;
    }

    case "employees": {
      const rows = await listEmployees(
        {
          q: params.get("q") ?? undefined,
          department: params.get("department")?.split(",").filter(Boolean),
          status: params.get("status")?.split(",").filter(Boolean),
        },
        actor,
      );

      return {
        filename: "employees",
        sheetName: "People",
        rows,
        columns: [
          { header: "Employee ID", value: (row) => row.employeeCode, width: 12 },
          { header: "Name", value: (row) => row.name, width: 24 },
          { header: "Email", value: (row) => row.email, width: 30 },
          { header: "Phone", value: (row) => row.phone ?? "", width: 18 },
          { header: "Designation", value: (row) => row.designation ?? "", width: 24 },
          { header: "Department", value: (row) => row.department?.name ?? "", width: 18 },
          { header: "Team", value: (row) => row.team?.name ?? "", width: 16 },
          { header: "Location", value: (row) => row.location?.name ?? "", width: 16 },
          { header: "Manager", value: (row) => row.manager?.name ?? "", width: 22 },
          { header: "Role", value: (row) => ROLE_LABEL[row.role], width: 12 },
          { header: "Status", value: (row) => USER_STATUS_LABEL[row.status], width: 12 },
          { header: "Joined", value: (row) => row.joinedAt, width: 12 },
          { header: "Direct reports", value: (row) => row.reportCount, width: 14 },
        ] satisfies Array<ExportColumn<(typeof rows)[number]>>,
      } as Dataset;
    }

    case "departments": {
      const rows = await prisma.department.findMany({
        orderBy: { name: "asc" },
        select: {
          name: true,
          description: true,
          head: { select: { name: true } },
          _count: { select: { members: true, teams: true } },
          teams: { select: { name: true } },
        },
      });

      return {
        filename: "departments",
        sheetName: "Departments",
        rows,
        columns: [
          { header: "Department", value: (row) => row.name, width: 24 },
          { header: "Head", value: (row) => row.head?.name ?? "", width: 22 },
          { header: "People", value: (row) => row._count.members, width: 10 },
          { header: "Teams", value: (row) => row._count.teams, width: 10 },
          { header: "Team names", value: (row) => row.teams.map((team) => team.name).join(", "), width: 40 },
          { header: "Description", value: (row) => row.description ?? "", width: 48 },
        ] satisfies Array<ExportColumn<(typeof rows)[number]>>,
      } as Dataset;
    }

    case "dsr-completion": {
      const range = resolveDateRange(filters);
      const rows = await getCompletionByEmployee(range, actor);

      return {
        filename: "report-completion",
        sheetName: "Completion",
        rows,
        columns: [
          { header: "Employee", value: (row) => row.user.name, width: 24 },
          { header: "Department", value: (row) => row.user.department ?? "", width: 18 },
          { header: "Expected reports", value: (row) => row.expected, width: 16 },
          { header: "Submitted", value: (row) => row.submitted, width: 12 },
          { header: "Completion %", value: (row) => row.rate, width: 14 },
          { header: "Total hours", value: (row) => row.totalHours, width: 12 },
          { header: "Last submitted", value: (row) => row.lastSubmittedAt, width: 18 },
        ] satisfies Array<ExportColumn<(typeof rows)[number]>>,
      } as Dataset;
    }

    default: {
      // Exhaustiveness guard: adding a kind without a case fails to compile.
      const exhaustive: never = kind;
      throw new Error(`Unsupported export kind: ${String(exhaustive)}`);
    }
  }
}
