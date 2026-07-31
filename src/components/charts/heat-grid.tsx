"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { SEQUENTIAL_STEPS } from "@/lib/charts/palette";

export interface HeatCell {
  key: string;
  /** Explicit colour (status encoding) — takes precedence over `intensity`. */
  color?: string;
  /** 0–1 magnitude, mapped onto the sequential ramp. */
  intensity?: number;
  label: string;
  /** Tooltip / accessible description. */
  title: string;
  href?: string;
}

export interface HeatRow {
  key: string;
  label: React.ReactNode;
  /** Secondary label under the row name. */
  meta?: string;
  cells: HeatCell[];
}

interface HeatGridProps {
  rows: HeatRow[];
  /** Column headers, aligned with each row's `cells` array. */
  columns: string[];
  /** Legend for the encoding used — required, since colour carries meaning. */
  legend: Array<{ label: string; color: string }>;
  className?: string;
  cellSize?: number;
  rowLabelWidth?: number;
  onCellClick?: (row: HeatRow, cell: HeatCell) => void;
}

/**
 * Matrix view — employees down, days across.
 *
 * The right form when the question is "who, on which day": a heat grid shows
 * ~20 × 30 values in one screen where 20 line series would be unreadable.
 * Hover/focus reveals the detail; the cell's `title` keeps every value reachable
 * without colour, and the legend names the encoding.
 */
export function HeatGrid({
  rows,
  columns,
  legend,
  className,
  cellSize = 18,
  rowLabelWidth = 148,
  onCellClick,
}: HeatGridProps) {
  const [hovered, setHovered] = useState<{ row: string; cell: string } | null>(null);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="overflow-x-auto pb-1">
        <table
          className="border-separate"
          style={{ borderSpacing: 2 }}
          // 2px border-spacing *is* the surface gap between cells.
        >
          <caption className="sr-only">
            Grid of {rows.length} rows by {columns.length} columns. Each cell is described by its
            title attribute.
          </caption>

          <thead>
            <tr>
              <th
                scope="col"
                style={{ width: rowLabelWidth, minWidth: rowLabelWidth }}
                className="sticky left-0 z-10 bg-surface text-left"
              >
                <span className="sr-only">Name</span>
              </th>
              {columns.map((column, index) => (
                <th
                  key={`${column}-${index}`}
                  scope="col"
                  style={{ width: cellSize, minWidth: cellSize }}
                  className="pb-1 text-center text-[9.5px] font-medium text-fg-subtle"
                >
                  {/* Only every other label, so a 30-day axis stays legible. */}
                  {index % 2 === 0 ? column : <span className="sr-only">{column}</span>}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="group">
                <th
                  scope="row"
                  style={{ width: rowLabelWidth, minWidth: rowLabelWidth }}
                  className="sticky left-0 z-10 bg-surface pr-3 text-left align-middle"
                >
                  <span className="block truncate text-[12.5px] font-medium text-fg">
                    {row.label}
                  </span>
                  {row.meta ? (
                    <span className="block truncate text-[10.5px] text-fg-subtle">{row.meta}</span>
                  ) : null}
                </th>

                {row.cells.map((cell) => {
                  const isActive = hovered?.row === row.key && hovered?.cell === cell.key;
                  const background =
                    cell.color ??
                    (cell.intensity === undefined || cell.intensity <= 0
                      ? "var(--surface-muted)"
                      : SEQUENTIAL_STEPS[
                          Math.min(
                            SEQUENTIAL_STEPS.length - 1,
                            Math.floor(cell.intensity * SEQUENTIAL_STEPS.length),
                          )
                        ]);

                  return (
                    <td key={cell.key} style={{ width: cellSize, height: cellSize }}>
                      <button
                        type="button"
                        title={cell.title}
                        aria-label={cell.title}
                        onMouseEnter={() => setHovered({ row: row.key, cell: cell.key })}
                        onMouseLeave={() => setHovered(null)}
                        onFocus={() => setHovered({ row: row.key, cell: cell.key })}
                        onBlur={() => setHovered(null)}
                        onClick={onCellClick ? () => onCellClick(row, cell) : undefined}
                        // Hit target is the full cell, not the visual dot.
                        className={cn(
                          "block size-full rounded-[3px] outline-none transition-[transform,box-shadow] duration-100",
                          "focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]",
                          isActive && "scale-[1.35] shadow-md",
                          onCellClick ? "cursor-pointer" : "cursor-default",
                        )}
                        style={{ backgroundColor: background, width: cellSize, height: cellSize }}
                      >
                        <span className="sr-only">{cell.label}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
        {legend.map((entry) => (
          <span key={entry.label} className="flex items-center gap-1.5 text-[11.5px] text-fg-muted">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: entry.color }}
            />
            {entry.label}
          </span>
        ))}
      </div>
    </div>
  );
}
