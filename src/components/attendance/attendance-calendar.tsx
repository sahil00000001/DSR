"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import {
  ATTENDANCE_STATUS_LABEL,
  ATTENDANCE_STATUS_SHORT,
  type AttendanceStatus,
} from "@/lib/constants/enums";
import { STATUS_COLOR } from "@/lib/charts/palette";
import {
  addMonths,
  formatDayLong,
  formatMonthLong,
  monthGrid,
  startOfMonth,
  toDayKey,
  today,
} from "@/lib/utils/date";
import { formatDuration } from "@/lib/utils/format";

export interface CalendarDay {
  key: string;
  status: AttendanceStatus;
  workedMinutes: number;
  note: string | null;
  inferred: boolean;
}

/**
 * Monthly attendance calendar.
 *
 * Always renders six week rows so the grid never changes height between months —
 * a layout that jumps as you page through is disorienting and pushes the content
 * below it around.
 *
 * Status is carried by colour *and* a letter (P / W / ½ / L / A), so the grid is
 * readable without relying on hue.
 */
export function AttendanceCalendar({
  days,
  monthKey,
  onMonthChange,
}: {
  days: CalendarDay[];
  monthKey: string;
  onMonthChange: (monthKey: string) => void;
}) {
  const month = useMemo(() => startOfMonth(new Date(`${monthKey}-01T00:00:00Z`)), [monthKey]);
  const grid = useMemo(() => monthGrid(month), [month]);
  const byKey = useMemo(() => new Map(days.map((day) => [day.key, day])), [days]);
  const [focused, setFocused] = useState<string | null>(null);

  const todayKey = toDayKey(today());
  const currentMonth = month.getUTCMonth();

  const shift = (amount: number) => {
    const next = addMonths(month, amount);
    onMonthChange(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`);
  };

  const isFuture = startOfMonth(today()) <= month;

  return (
    <Card>
      <CardHeader
        actions={
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon-sm" onClick={() => shift(-1)} aria-label="Previous month">
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => shift(1)}
              disabled={isFuture}
              aria-label="Next month"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        }
      >
        <CardTitle>{formatMonthLong(month)}</CardTitle>
      </CardHeader>

      <CardContent>
        <div role="grid" aria-label={`Attendance for ${formatMonthLong(month)}`}>
          <div role="row" className="mb-1.5 grid grid-cols-7 gap-1.5">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
              <div
                key={label}
                role="columnheader"
                className="text-center text-[10.5px] font-semibold tracking-wide text-fg-subtle uppercase"
              >
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{label[0]}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {grid.map((day) => {
              const key = toDayKey(day);
              const record = byKey.get(key);
              const outsideMonth = day.getUTCMonth() !== currentMonth;
              const isToday = key === todayKey;

              const color = record ? STATUS_COLOR[record.status] : undefined;
              const isNonWorking =
                !record || record.status === "WEEKEND" || record.status === "HOLIDAY";

              return (
                <Tooltip
                  key={key}
                  disabled={outsideMonth || !record}
                  content={
                    record ? (
                      <span className="block">
                        <span className="block font-semibold">{formatDayLong(day)}</span>
                        <span className="block">{ATTENDANCE_STATUS_LABEL[record.status]}</span>
                        {record.workedMinutes > 0 ? (
                          <span className="block opacity-80">
                            {formatDuration(record.workedMinutes)} worked
                          </span>
                        ) : null}
                        {record.note ? (
                          <span className="mt-1 block opacity-80">{record.note}</span>
                        ) : null}
                      </span>
                    ) : null
                  }
                >
                  <div
                    role="gridcell"
                    tabIndex={outsideMonth ? -1 : 0}
                    aria-label={
                      record
                        ? `${formatDayLong(day)}: ${ATTENDANCE_STATUS_LABEL[record.status]}`
                        : formatDayLong(day)
                    }
                    onFocus={() => setFocused(key)}
                    onBlur={() => setFocused(null)}
                    className={cn(
                      "relative flex aspect-square flex-col items-center justify-center rounded-lg border text-center transition-all duration-150 outline-none",
                      outsideMonth
                        ? "border-transparent opacity-25"
                        : isNonWorking
                          ? "border-border bg-surface-inset"
                          : "border-transparent",
                      focused === key && "ring-2 ring-[var(--accent-ring)]",
                      isToday && "ring-2 ring-accent ring-offset-1 ring-offset-surface",
                    )}
                    style={
                      record && !isNonWorking
                        ? {
                            // 18% tint keeps the number legible while the hue still
                            // reads at a glance across the whole month.
                            backgroundColor: `color-mix(in oklab, ${color} 18%, var(--surface))`,
                            borderColor: `color-mix(in oklab, ${color} 40%, transparent)`,
                          }
                        : undefined
                    }
                  >
                    <span
                      className={cn(
                        "text-[12.5px] leading-none font-semibold tabular-nums",
                        outsideMonth ? "text-fg-subtle" : "text-fg",
                      )}
                    >
                      {day.getUTCDate()}
                    </span>

                    {record && !outsideMonth && record.status !== "WEEKEND" ? (
                      <span
                        className="mt-1 text-[9.5px] leading-none font-bold"
                        style={{ color }}
                        aria-hidden="true"
                      >
                        {ATTENDANCE_STATUS_SHORT[record.status]}
                      </span>
                    ) : null}
                  </div>
                </Tooltip>
              );
            })}
          </div>
        </div>

        <ul className="mt-4 flex flex-wrap gap-x-3.5 gap-y-1.5 border-t border-border pt-3.5">
          {(["PRESENT", "WFH", "HALF_DAY", "LEAVE", "ABSENT", "HOLIDAY"] as AttendanceStatus[]).map(
            (status) => (
              <li key={status} className="flex items-center gap-1.5 text-[11.5px] text-fg-muted">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-[3px]"
                  style={{ backgroundColor: STATUS_COLOR[status] }}
                />
                {ATTENDANCE_STATUS_LABEL[status]}
              </li>
            ),
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
