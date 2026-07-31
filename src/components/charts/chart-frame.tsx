"use client";

import { useState } from "react";
import { BarChart3, Table2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";

export interface LegendEntry {
  label: string;
  color: string;
  /** Optional value shown beside the label. */
  value?: string;
}

export interface TableView {
  columns: string[];
  rows: Array<Array<string | number>>;
}

interface ChartFrameProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Legend is required for two or more series; omit for a single series. */
  legend?: LegendEntry[];
  /**
   * The WCAG-clean twin of the chart. Required, not optional: it's what makes
   * every value reachable without relying on colour or a hover tooltip.
   */
  table: TableView;
  actions?: React.ReactNode;
  /** Height of the plot area *including* the x-axis band. */
  height?: number;
  className?: string;
  children: React.ReactNode;
  /** Dim rather than skeleton-flash while new data loads. */
  refreshing?: boolean;
}

/**
 * The shell every chart lives in: title, legend, a chart/table toggle, and a
 * fixed plot height that already accounts for the axis band (a chart card whose
 * height excludes its axis labels ends up with a nested scrollbar).
 */
export function ChartFrame({
  title,
  description,
  legend,
  table,
  actions,
  height = 240,
  className,
  children,
  refreshing = false,
}: ChartFrameProps) {
  const [view, setView] = useState<"chart" | "table">("chart");

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        actions={
          <>
            {actions}
            <Tooltip content={view === "chart" ? "Show data table" : "Show chart"}>
              <button
                type="button"
                data-print="hide"
                onClick={() => setView((v) => (v === "chart" ? "table" : "chart"))}
                aria-label={view === "chart" ? "Show data table" : "Show chart"}
                className="grid size-7 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
              >
                {view === "chart" ? (
                  <Table2 className="size-3.5" />
                ) : (
                  <BarChart3 className="size-3.5" />
                )}
              </button>
            </Tooltip>
          </>
        }
      >
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>

      {/* Legend sits above the plot, always present when there's more than one
          series — identity must never depend on colour matching alone. */}
      {legend && legend.length > 1 && view === "chart" ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 pb-3">
          {legend.map((entry) => (
            <span key={entry.label} className="flex items-center gap-1.5 text-[12px] text-fg-muted">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: entry.color }}
              />
              {entry.label}
              {entry.value ? (
                <span className="font-medium text-fg tabular-nums">{entry.value}</span>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}

      <div className="min-w-0 flex-1 px-2 pb-3">
        {view === "chart" ? (
          <div
            style={{ height }}
            className={cn(
              "w-full transition-opacity duration-200",
              refreshing && "opacity-50",
            )}
          >
            {children}
          </div>
        ) : (
          <div className="max-h-[19rem] overflow-auto px-3">
            <table className="w-full text-left text-[12.5px]">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-border">
                  {table.columns.map((column, index) => (
                    <th
                      key={column}
                      scope="col"
                      className={cn(
                        "py-1.5 font-medium text-fg-muted whitespace-nowrap",
                        index > 0 && "text-right",
                      )}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {table.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className={cn(
                          "py-1.5 whitespace-nowrap",
                          cellIndex === 0 ? "text-fg-muted" : "text-right font-medium text-fg tabular-nums",
                        )}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}
