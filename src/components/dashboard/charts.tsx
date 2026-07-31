"use client";

import { useMemo } from "react";
import { ChartFrame } from "@/components/charts/chart-frame";
import { TrendChart } from "@/components/charts/trend-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { CompositionBar } from "@/components/charts/donut-chart";
import { seriesColorFor, slotColor, STATUS_COLOR } from "@/lib/charts/palette";
import { formatDayShort, parseDayKey } from "@/lib/utils/date";
import { formatHours, formatPercent, percentage } from "@/lib/utils/format";

/**
 * Dashboard charts.
 *
 * Client components because Recharts needs the DOM; each receives already-shaped,
 * serialisable data from the server so nothing is computed twice. Every chart is
 * wrapped in `ChartFrame`, which supplies the legend and the table view — the
 * relief required by our light-mode amber contrast warning.
 */

export function CompletionTrendChart({
  data,
}: {
  data: Array<{ date: string; submitted: number; expected: number; hours: number }>;
}) {
  const shaped = useMemo(
    () =>
      data.map((point) => ({
        label: formatDayShort(parseDayKey(point.date)),
        Submitted: point.submitted,
        Expected: point.expected,
      })),
    [data],
  );

  const submittedTotal = data.reduce((sum, point) => sum + point.submitted, 0);
  const expectedTotal = data.reduce((sum, point) => sum + point.expected, 0);

  return (
    <ChartFrame
      title="Report completion"
      description={`${formatPercent(percentage(submittedTotal, expectedTotal))} of expected reports filed over the last ${data.length} working days`}
      height={210}
      legend={[
        { label: "Submitted", color: slotColor("indigo") },
        { label: "Expected", color: "var(--fg-subtle)" },
      ]}
      table={{
        columns: ["Day", "Submitted", "Expected"],
        rows: data.map((point) => [
          formatDayShort(parseDayKey(point.date)),
          point.submitted,
          point.expected,
        ]),
      }}
    >
      <TrendChart
        data={shaped}
        xKey="label"
        series={[
          { key: "Submitted", label: "Submitted", color: slotColor("indigo") },
          // The expectation line is a reference, so it gets no fill — the story
          // is the gap between the two, not the area under the ceiling.
          { key: "Expected", label: "Expected", color: "var(--fg-subtle)", fill: false },
        ]}
      />
    </ChartFrame>
  );
}

export function HoursTrendChart({
  data,
}: {
  data: Array<{ date: string; submitted: number; expected: number; hours: number }>;
}) {
  const shaped = useMemo(
    () =>
      data.map((point) => ({
        label: formatDayShort(parseDayKey(point.date)),
        Hours: point.hours,
      })),
    [data],
  );

  const total = data.reduce((sum, point) => sum + point.hours, 0);

  return (
    <ChartFrame
      title="Hours logged"
      description={`${formatHours(total)} across the period · ${formatHours(
        data.length ? total / data.length : 0,
      )} per working day`}
      height={210}
      // Single series: the title says what's plotted, so a one-swatch legend box
      // would just restate it.
      table={{
        columns: ["Day", "Hours"],
        rows: data.map((point) => [formatDayShort(parseDayKey(point.date)), point.hours]),
      }}
    >
      <TrendChart
        data={shaped}
        xKey="label"
        unit="h"
        series={[{ key: "Hours", label: "Hours", color: slotColor("emerald") }]}
      />
    </ChartFrame>
  );
}

export function AttendanceTrendChart({
  data,
}: {
  data: Array<{
    date: string;
    present: number;
    wfh: number;
    halfDay: number;
    leave: number;
    absent: number;
  }>;
}) {
  const shaped = useMemo(
    () =>
      data.map((point) => ({
        label: formatDayShort(parseDayKey(point.date)),
        Office: point.present,
        Remote: point.wfh,
        "Half day": point.halfDay,
        Leave: point.leave,
        Absent: point.absent,
      })),
    [data],
  );

  return (
    <ChartFrame
      title="Attendance mix"
      description="Where the team worked, per working day"
      height={210}
      legend={[
        { label: "Office", color: STATUS_COLOR.PRESENT },
        { label: "Remote", color: STATUS_COLOR.WFH },
        { label: "Half day", color: STATUS_COLOR.HALF_DAY },
        { label: "Leave", color: STATUS_COLOR.LEAVE },
        { label: "Absent", color: STATUS_COLOR.ABSENT },
      ]}
      table={{
        columns: ["Day", "Office", "Remote", "Half day", "Leave", "Absent"],
        rows: data.map((point) => [
          formatDayShort(parseDayKey(point.date)),
          point.present,
          point.wfh,
          point.halfDay,
          point.leave,
          point.absent,
        ]),
      }}
    >
      {/* Grouped, not stacked: recharts can only separate stacked segments with a
          stroke around each mark, and a stroke adds ink that isn't data. Grouped
          bars get a real 2px surface gap from `barGap`. */}
      <BarChart
        data={shaped}
        xKey="label"
        series={[
          { key: "Office", label: "Office", color: STATUS_COLOR.PRESENT },
          { key: "Remote", label: "Remote", color: STATUS_COLOR.WFH },
          { key: "Half day", label: "Half day", color: STATUS_COLOR.HALF_DAY },
          { key: "Leave", label: "Leave", color: STATUS_COLOR.LEAVE },
          { key: "Absent", label: "Absent", color: STATUS_COLOR.ABSENT },
        ]}
      />
    </ChartFrame>
  );
}

export function DepartmentActivityChart({
  data,
}: {
  data: Array<{
    id: string;
    name: string;
    color: string;
    headcount: number;
    reports: number;
    hours: number;
    completionRate: number;
  }>;
}) {
  const shaped = useMemo(
    () => data.map((row) => ({ label: row.name, Reports: row.reports, id: row.id })),
    [data],
  );

  return (
    <ChartFrame
      title="Reports by department"
      description="Status reports filed over the last 30 days"
      height={Math.max(180, data.length * 34 + 40)}
      table={{
        columns: ["Department", "People", "Reports", "Hours", "Completion"],
        rows: data.map((row) => [
          row.name,
          row.headcount,
          row.reports,
          row.hours,
          `${row.completionRate}%`,
        ]),
      }}
    >
      <BarChart
        data={shaped}
        xKey="label"
        layout="horizontal"
        showValues
        // Colour follows the department, so filtering never repaints survivors.
        colorFor={(datum) => seriesColorFor(String(datum.id))}
        series={[{ key: "Reports", label: "Reports", color: slotColor("indigo") }]}
        categoryWidth={110}
      />
    </ChartFrame>
  );
}

/**
 * Today's roll-call.
 *
 * A composition bar rather than a donut: five states where two are usually zero
 * reads far better as one horizontal bar, and it costs no chart library.
 */
export function TodayMixBar({
  counts,
}: {
  counts: { PRESENT: number; WFH: number; HALF_DAY: number; LEAVE: number; ABSENT: number };
}) {
  const segments = [
    { label: "In office", value: counts.PRESENT, color: STATUS_COLOR.PRESENT },
    { label: "Remote", value: counts.WFH, color: STATUS_COLOR.WFH },
    { label: "Half day", value: counts.HALF_DAY, color: STATUS_COLOR.HALF_DAY },
    { label: "On leave", value: counts.LEAVE, color: STATUS_COLOR.LEAVE },
    { label: "Not marked", value: counts.ABSENT, color: STATUS_COLOR.ABSENT },
  ];

  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  return (
    <div>
      <CompositionBar segments={segments} height={10} />
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {segments
          .filter((segment) => segment.value > 0)
          .map((segment) => (
            <li key={segment.label} className="flex items-center gap-1.5 text-[12px]">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: segment.color }}
              />
              <span className="text-fg-muted">{segment.label}</span>
              <span className="font-semibold text-fg tabular-nums">{segment.value}</span>
              <span className="text-fg-subtle tabular-nums">
                ({percentage(segment.value, total)}%)
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
}
