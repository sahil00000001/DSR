"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Checkbox } from "@/components/ui/checkbox";
import { SkeletonTable } from "@/components/ui/skeleton";

export type SortDirection = "asc" | "desc";

export interface Column<T> {
  id: string;
  header: React.ReactNode;
  cell: (row: T, index: number) => React.ReactNode;
  align?: "left" | "center" | "right";
  /** Any CSS width — use `1%` + whitespace-nowrap for shrink-to-fit columns. */
  width?: string;
  sortable?: boolean;
  /** Comparable value for sorting. Defaults to the cell's text when omitted. */
  sortValue?: (row: T) => string | number | Date | null | undefined;
  className?: string;
  headerClassName?: string;
  /** Drops the column below this breakpoint to keep mobile readable. */
  hideBelow?: "sm" | "md" | "lg" | "xl";
}

interface DataTableProps<T> {
  data: readonly T[];
  columns: Array<Column<T>>;
  rowKey: (row: T) => string;
  /** Accessible table caption — visually hidden but read by screen readers. */
  caption: string;
  loading?: boolean;
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
  /** Highlights a row, e.g. the signed-in user in a leaderboard. */
  isRowHighlighted?: (row: T) => boolean;
  selection?: {
    selected: ReadonlySet<string>;
    onChange: (selected: Set<string>) => void;
  };
  defaultSort?: { id: string; direction: SortDirection };
  /** Keeps the header visible while the body scrolls. */
  stickyHeader?: boolean;
  className?: string;
  /** Rendered under the last row — pagination, totals. */
  footer?: React.ReactNode;
}

const HIDE_BELOW: Record<NonNullable<Column<unknown>["hideBelow"]>, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
};

/**
 * Table with sorting, row selection and responsive column hiding.
 *
 * Sorting is internal by default (the common case: a page's worth of rows
 * already in memory) and can be driven from outside by passing `defaultSort`
 * plus pre-sorted data. Built on a real `<table>` so it stays navigable and
 * copy-pasteable into a spreadsheet.
 */
export function DataTable<T>({
  data,
  columns,
  rowKey,
  caption,
  loading = false,
  empty,
  onRowClick,
  isRowHighlighted,
  selection,
  defaultSort,
  stickyHeader = false,
  className,
  footer,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ id: string; direction: SortDirection } | null>(
    defaultSort ?? null,
  );

  const sorted = useMemo(() => {
    if (!sort) return data;
    const column = columns.find((c) => c.id === sort.id);
    if (!column?.sortable) return data;

    const accessor =
      column.sortValue ??
      ((row: T) => {
        const value = column.cell(row, 0);
        return typeof value === "string" || typeof value === "number" ? value : "";
      });

    const factor = sort.direction === "asc" ? 1 : -1;

    return [...data].sort((a, b) => {
      const left = accessor(a);
      const right = accessor(b);

      // Nulls always sort last, regardless of direction.
      if (left == null && right == null) return 0;
      if (left == null) return 1;
      if (right == null) return -1;

      if (left instanceof Date || right instanceof Date) {
        return (new Date(left as Date).getTime() - new Date(right as Date).getTime()) * factor;
      }
      if (typeof left === "number" && typeof right === "number") {
        return (left - right) * factor;
      }
      return String(left).localeCompare(String(right), undefined, { numeric: true }) * factor;
    });
  }, [data, sort, columns]);

  const toggleSort = (id: string) => {
    setSort((current) =>
      current?.id === id
        ? current.direction === "asc"
          ? { id, direction: "desc" }
          : null // Third click clears the sort and restores natural order.
        : { id, direction: "asc" },
    );
  };

  const allKeys = useMemo(() => sorted.map(rowKey), [sorted, rowKey]);
  const selectedCount = selection ? allKeys.filter((key) => selection.selected.has(key)).length : 0;
  const allSelected = selectedCount > 0 && selectedCount === allKeys.length;

  if (loading) return <SkeletonTable columns={columns.length} />;

  const columnCount = columns.length + (selection ? 1 : 0);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-surface",
        className,
      )}
    >
      {/* Horizontal scroll is contained here so the page never scrolls sideways. */}
      <div className={cn("w-full overflow-x-auto", stickyHeader && "max-h-[70vh] overflow-y-auto")}>
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">{caption}</caption>

          <thead
            className={cn(
              "bg-surface-inset text-fg-muted",
              stickyHeader && "sticky top-0 z-10 shadow-[0_1px_0_0_var(--border)]",
            )}
          >
            <tr>
              {selection ? (
                <th scope="col" className="w-[1%] py-2.5 pr-2 pl-4">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={selectedCount > 0 && !allSelected}
                    onChange={(event) =>
                      selection.onChange(
                        event.target.checked ? new Set(allKeys) : new Set<string>(),
                      )
                    }
                    aria-label={allSelected ? "Deselect all rows" : "Select all rows"}
                  />
                </th>
              ) : null}

              {columns.map((column) => {
                const isSorted = sort?.id === column.id;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    style={{ width: column.width }}
                    aria-sort={
                      isSorted
                        ? sort!.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : column.sortable
                          ? "none"
                          : undefined
                    }
                    className={cn(
                      "px-4 py-2.5 text-[11.5px] font-semibold tracking-wide whitespace-nowrap uppercase",
                      column.align === "right" && "text-right",
                      column.align === "center" && "text-center",
                      column.hideBelow && HIDE_BELOW[column.hideBelow],
                      column.headerClassName,
                    )}
                  >
                    {column.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.id)}
                        className={cn(
                          "-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-fg",
                          column.align === "right" && "flex-row-reverse",
                          isSorted && "text-fg",
                        )}
                      >
                        {column.header}
                        {isSorted ? (
                          sort!.direction === "asc" ? (
                            <ArrowUp className="size-3" aria-hidden="true" />
                          ) : (
                            <ArrowDown className="size-3" aria-hidden="true" />
                          )
                        ) : (
                          <ChevronsUpDown
                            className="size-3 opacity-0 transition-opacity group-hover:opacity-100"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-border">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={columnCount}>{empty}</td>
              </tr>
            ) : (
              sorted.map((row, index) => {
                const key = rowKey(row);
                const isSelected = selection?.selected.has(key) ?? false;

                return (
                  <tr
                    key={key}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    // Rows that navigate get keyboard access too.
                    tabIndex={onRowClick ? 0 : undefined}
                    onKeyDown={
                      onRowClick
                        ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onRowClick(row);
                            }
                          }
                        : undefined
                    }
                    data-selected={isSelected || undefined}
                    className={cn(
                      "transition-colors duration-100",
                      onRowClick && "cursor-pointer",
                      isSelected ? "bg-accent-soft/50" : "hover:bg-surface-hover",
                      isRowHighlighted?.(row) && "bg-accent-soft/30",
                    )}
                  >
                    {selection ? (
                      <td
                        className="w-[1%] py-3 pr-2 pl-4"
                        // Clicking the checkbox must not also trigger the row.
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Checkbox
                          checked={isSelected}
                          onChange={(event) => {
                            const next = new Set(selection.selected);
                            if (event.target.checked) next.add(key);
                            else next.delete(key);
                            selection.onChange(next);
                          }}
                          aria-label={`Select row ${index + 1}`}
                        />
                      </td>
                    ) : null}

                    {columns.map((column) => (
                      <td
                        key={column.id}
                        className={cn(
                          "px-4 py-3 align-middle text-[13px] text-fg",
                          column.align === "right" && "text-right",
                          column.align === "center" && "text-center",
                          column.hideBelow && HIDE_BELOW[column.hideBelow],
                          column.className,
                        )}
                      >
                        {column.cell(row, index)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {footer ? (
        <div className="border-t border-border bg-surface-inset px-4 py-2.5">{footer}</div>
      ) : null}
    </div>
  );
}
