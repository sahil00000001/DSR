import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  Building2,
  CalendarCheck,
  FileSpreadsheet,
  FileText,
  Plane,
  Receipt,
  TrendingUp,
  Users,
} from "lucide-react";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { lastNDays, startOfMonth, toDayKey, today } from "@/lib/utils/date";
import { formatNumber } from "@/lib/utils/format";
import { ReportCard } from "@/components/reports/report-card";
import { PrintButton } from "@/components/ui/print-button";

export const metadata: Metadata = {
  title: "Reports",
  description: "Download attendance, leave, DSR and people data.",
};

/**
 * Report centre.
 *
 * Each card is a dataset with its own range control and both formats. The counts
 * shown are live, so nobody downloads an empty file and wonders whether the export
 * is broken — a real failure mode of "download" buttons that show nothing until
 * you open the file.
 */
export default async function ReportsPage() {
  const user = await requireUser();
  if (!can.viewReports(user)) redirect("/forbidden");

  const now = today();
  const monthKey = toDayKey(startOfMonth(now)).slice(0, 7);
  const trailing30 = lastNDays(30, now);

  const [dsrCount, attendanceCount, leaveCount, employeeCount, departmentCount, expenseCount] =
    await Promise.all([
      prisma.dailyStatusReport.count({
        where: { date: { gte: trailing30.start, lte: trailing30.end } },
      }),
      prisma.attendance.count({ where: { date: { gte: startOfMonth(now) } } }),
      prisma.leaveRequest.count(),
      prisma.user.count({ where: { status: { not: "DISABLED" } } }),
      prisma.department.count(),
      prisma.expenseClaim.count({ where: { status: { not: "DRAFT" } } }),
    ]);

  return (
    <>
      <PageHeader
        title="Reports"
        description="Every dataset, as CSV for tooling or Excel for sharing. Print any screen to PDF."
        actions={<PrintButton label="Print this page" />}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-inset px-4 py-3">
        <FileSpreadsheet className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
        <p className="text-[12.5px] text-fg-muted">
          Exports respect your access: a manager&apos;s download contains their reporting line, an
          admin&apos;s contains the whole organisation. Every download is recorded in the audit log.
        </p>
      </div>

      <SectionHeader
        title="Operational data"
        description="The day-to-day records, filtered to the period you choose."
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <ReportCard
          kind="dsr"
          icon={<FileText />}
          title="Status reports"
          description="Every report with its author, hours, blockers and review state. Markdown is flattened to plain prose."
          meta={`${formatNumber(dsrCount)} in the last 30 days`}
          rangeControl
        />

        <ReportCard
          kind="attendance"
          icon={<CalendarCheck />}
          title="Attendance register"
          description="One row per person per day, including inferred absences and admin corrections."
          meta={`${formatNumber(attendanceCount)} records this month`}
          monthControl
          defaultMonth={monthKey}
        />

        <ReportCard
          kind="leave"
          icon={<Plane />}
          title="Leave requests"
          description="All requests with dates, working-day counts, decisions and decision notes."
          meta={`${formatNumber(leaveCount)} requests on record`}
        />

        <ReportCard
          kind="dsr-completion"
          icon={<TrendingUp />}
          title="Report completion"
          description="Expected versus filed per person, adjusted for holidays and approved leave."
          meta="Derived — recomputed at download"
          rangeControl
        />

        <ReportCard
          kind="expenses"
          icon={<Receipt />}
          title="Expense claims"
          description="Every claim with its amount in rupees, category, decision and reimbursement date. Drafts are included only for their owner."
          meta={`${formatNumber(expenseCount)} claims filed`}
        />

        <ReportCard
          kind="employees"
          icon={<Users />}
          title="People directory"
          description="Full directory with department, team, location, manager, role and tenure."
          meta={`${formatNumber(employeeCount)} active people`}
        />

        <ReportCard
          kind="departments"
          icon={<Building2 />}
          title="Departments & teams"
          description="Structure with headcount, teams and department heads."
          meta={`${formatNumber(departmentCount)} departments`}
        />
      </div>

      <SectionHeader
        title="PDF and printing"
        description="Anything on screen can be saved as a PDF."
      />

      <Card>
        <CardContent className="pt-4">
          <p className="text-[13px] leading-6 text-fg-muted">
            Every screen carries a print stylesheet that drops the navigation, expands collapsed
            groups, and keeps cards from splitting across page breaks. Use{" "}
            <Badge tone="neutral" variant="outline" size="sm">
              Print / PDF
            </Badge>{" "}
            on the review board for a full team digest, or on any employee profile for a single
            person&apos;s record.
          </p>
          <p className="mt-3 text-[12.5px] text-fg-subtle">
            PDF generation goes through the browser rather than a server-side renderer — the output
            honours your theme and page size, and it keeps a headless Chromium (roughly 50 MB) out of
            the deployment.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
