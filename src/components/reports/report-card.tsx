"use client";

import { useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { todayKey } from "@/lib/utils/date";

const RANGE_OPTIONS = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "last-30", label: "Last 30 days" },
  { value: "last-week", label: "Last week" },
  { value: "custom", label: "All time" },
] as const;

/**
 * One downloadable dataset.
 *
 * Downloads are plain `<a href>` links, not fetch calls: the browser's own
 * download machinery handles the streaming, the filename from
 * `Content-Disposition`, and the progress UI — all of which would have to be
 * reimplemented (badly) with a blob and a synthetic click.
 */
export function ReportCard({
  kind,
  icon,
  title,
  description,
  meta,
  rangeControl = false,
  monthControl = false,
  defaultMonth,
}: {
  kind: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  meta: string;
  rangeControl?: boolean;
  monthControl?: boolean;
  defaultMonth?: string;
}) {
  const [range, setRange] = useState<string>("last-30");
  const [month, setMonth] = useState<string>(defaultMonth ?? todayKey().slice(0, 7));

  const href = (format: "csv" | "xlsx") => {
    const params = new URLSearchParams({ format });
    if (rangeControl) params.set("range", range);
    if (monthControl) params.set("month", month);
    return `/api/export/${kind}?${params.toString()}`;
  };

  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col pt-5">
        <div className="flex items-start gap-3">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent [&>svg]:size-4"
            aria-hidden="true"
          >
            {icon}
          </span>
          <div className="min-w-0">
            <h3 className="text-[13.5px] font-semibold text-fg">{title}</h3>
            <p className="mt-0.5 text-[11.5px] text-fg-subtle">{meta}</p>
          </div>
        </div>

        <p className="mt-3 flex-1 text-[12.5px] leading-5 text-fg-muted">{description}</p>

        {rangeControl ? (
          <label className="mt-4 block">
            <span className="mb-1 block text-[11px] font-medium text-fg-muted">Period</span>
            <Select
              selectSize="sm"
              value={range}
              onChange={(event) => setRange(event.target.value)}
              options={RANGE_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
            />
          </label>
        ) : null}

        {monthControl ? (
          <label className="mt-4 block">
            <span className="mb-1 block text-[11px] font-medium text-fg-muted">Month</span>
            <Input
              type="month"
              inputSize="sm"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </label>
        ) : null}

        <div className="mt-4 flex gap-2 border-t border-border pt-3.5">
          <a
            href={href("csv")}
            className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface text-[12.5px] font-medium text-fg shadow-xs transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] outline-none"
          >
            <Download className="size-3.5" />
            CSV
          </a>
          <a
            href={href("xlsx")}
            className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent text-[12.5px] font-medium text-accent-fg shadow-xs transition-colors hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] outline-none"
          >
            <FileSpreadsheet className="size-3.5" />
            Excel
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
