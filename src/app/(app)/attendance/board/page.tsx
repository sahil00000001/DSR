import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertTriangle, CalendarCheck, House, UserX } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { NavTabs } from "@/components/ui/tabs";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { getAttendanceBoard } from "@/lib/services/attendance";
import { getOrgOptions } from "@/lib/services/people";
import { attendanceFilterSchema, parseSearchParams } from "@/lib/validation/schemas";
import { endOfMonth, startOfMonth, toDayKey, today } from "@/lib/utils/date";
import { formatPercent, percentage } from "@/lib/utils/format";
import { AttendanceBoard } from "@/components/attendance/attendance-board";

export const metadata: Metadata = {
  title: "Attendance board",
  description: "Who was in, remote, on leave or unrecorded — a month at a time.",
};

export default async function AttendanceBoardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can.viewAttendanceBoard(user)) redirect("/forbidden");

  const raw = await searchParams;
  const filters = parseSearchParams(attendanceFilterSchema, raw);

  const monthParam = typeof raw.month === "string" && /^\d{4}-\d{2}$/.test(raw.month) ? raw.month : null;
  const month = monthParam
    ? new Date(Date.UTC(Number(monthParam.slice(0, 4)), Number(monthParam.slice(5, 7)) - 1, 1))
    : startOfMonth(today());

  const range = { start: startOfMonth(month), end: endOfMonth(month) };
  const monthKey = `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`;

  const [board, options] = await Promise.all([
    getAttendanceBoard(range, user, {
      department: filters.department,
      location: filters.location,
      q: filters.q,
    }),
    getOrgOptions(),
  ]);

  const totals = board.people.reduce(
    (accumulator, person) => {
      accumulator.worked += person.summary.worked;
      accumulator.absent += person.summary.absent;
      accumulator.leave += person.summary.leave;
      return accumulator;
    },
    { worked: 0, absent: 0, leave: 0 },
  );

  const remoteDays = board.people.reduce(
    (sum, person) => sum + person.days.filter((day) => day.status === "WFH").length,
    0,
  );

  const expected = totals.worked + totals.absent;

  return (
    <>
      <PageHeader
        title="Attendance board"
        description="The whole team, day by day. Click any cell to correct it."
        tabs={
          <NavTabs
            items={[
              { href: "/attendance", label: "Mine", exact: true },
              { href: "/attendance/board", label: "Team board" },
            ]}
          />
        }
      />

      <StatGrid className="mb-6">
        <StatCard
          label="Days worked"
          value={totals.worked}
          icon={<CalendarCheck />}
          footnote={`${board.people.length} people this month`}
        />
        <StatCard
          label="Attendance rate"
          value={formatPercent(percentage(totals.worked, Math.max(1, expected)))}
          icon={<AlertTriangle />}
          footnote="Worked days as a share of expected"
        />
        <StatCard
          label="Remote days"
          value={remoteDays}
          icon={<House />}
          footnote={`${totals.leave} leave days taken`}
        />
        <StatCard
          label="Unrecorded"
          value={totals.absent}
          icon={<UserX />}
          delta={undefined}
          footnote={
            totals.absent === 0
              ? "Everything accounted for"
              : "Working days with no record and no leave"
          }
        />
      </StatGrid>

      <AttendanceBoard
        monthKey={monthKey}
        dayKeys={board.days.map(toDayKey)}
        canOverride={can.overrideAttendance(user)}
        options={options}
        people={board.people.map((person) => ({
          id: person.id,
          name: person.name,
          employeeCode: person.employeeCode,
          department: person.department,
          summary: person.summary,
          days: person.days.map((day) => ({
            key: day.key,
            status: day.status,
            inferred: day.inferred,
            note: day.note,
          })),
        }))}
      />
    </>
  );
}
