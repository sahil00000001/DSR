"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { formatNumber } from "@/lib/utils/format";

export const PAGE_SIZES = [10, 25, 50, 100] as const;

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  className?: string;
  /** Noun for the summary line: "12 of 240 reports". */
  itemLabel?: string;
}

/**
 * Builds a page list with ellipses, always showing the first, last, current and
 * its immediate neighbours: `1 … 4 [5] 6 … 20`.
 */
function pageWindow(current: number, totalPages: number): Array<number | "gap"> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

  const pages = new Set<number>([1, totalPages, current, current - 1, current + 1]);
  // Keep the window a stable width at the ends so the control doesn't resize.
  if (current <= 3) [2, 3, 4].forEach((p) => pages.add(p));
  if (current >= totalPages - 2)
    [totalPages - 3, totalPages - 2, totalPages - 1].forEach((p) => pages.add(p));

  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  const result: Array<number | "gap"> = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1]! > 1) result.push("gap");
    result.push(page);
  });
  return result;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  className,
  itemLabel = "items",
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex flex-wrap items-center justify-between gap-3", className)}
    >
      <p className="text-[12.5px] text-fg-muted" aria-live="polite">
        {total === 0 ? (
          `No ${itemLabel}`
        ) : (
          <>
            <span className="font-medium text-fg tabular-nums">
              {formatNumber(from)}–{formatNumber(to)}
            </span>{" "}
            of <span className="tabular-nums">{formatNumber(total)}</span> {itemLabel}
          </>
        )}
      </p>

      <div className="flex items-center gap-3">
        {onPageSizeChange ? (
          <label className="flex items-center gap-1.5 text-[12.5px] text-fg-muted">
            <span className="hidden sm:inline">Rows</span>
            <Select
              selectSize="sm"
              value={String(pageSize)}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              options={PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) }))}
              className="w-[4.5rem]"
              aria-label="Rows per page"
            />
          </label>
        ) : null}

        {totalPages > 1 ? (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </Button>

            <div className="hidden items-center gap-0.5 sm:flex">
              {pageWindow(page, totalPages).map((entry, index) =>
                entry === "gap" ? (
                  <span
                    key={`gap-${index}`}
                    className="px-1 text-fg-subtle select-none"
                    aria-hidden="true"
                  >
                    …
                  </span>
                ) : (
                  <button
                    key={entry}
                    type="button"
                    onClick={() => onPageChange(entry)}
                    aria-current={entry === page ? "page" : undefined}
                    aria-label={`Page ${entry}`}
                    className={cn(
                      "grid size-8 place-items-center rounded-md text-[12.5px] font-medium tabular-nums transition-colors",
                      "outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]",
                      entry === page
                        ? "bg-accent text-accent-fg"
                        : "text-fg-muted hover:bg-surface-hover hover:text-fg",
                    )}
                  >
                    {entry}
                  </button>
                ),
              )}
            </div>

            <span className="px-1 text-[12.5px] text-fg-muted tabular-nums sm:hidden">
              {page} / {totalPages}
            </span>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        ) : null}
      </div>
    </nav>
  );
}

/** Slices an array for the current page — keeps client tables honest. */
export function paginate<T>(items: readonly T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
