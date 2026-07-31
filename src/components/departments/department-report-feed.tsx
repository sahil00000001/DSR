"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronDown, ChevronRight, Rows3, Users } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, CountBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { SegmentedControl } from "@/components/ui/tabs";
import { DsrCard } from "@/components/dsr/dsr-card";
import { DSR_STATUSES, DSR_STATUS_LABEL, DSR_STATUS_TONE, type DsrStatus } from "@/lib/constants/enums";
import { formatDayFriendly, formatDayShort, toDayKey } from "@/lib/utils/date";
import { formatHours, pluralize, truncate } from "@/lib/utils/format";
import { markdownToText } from "@/lib/utils/markdown";
import type { DsrDto } from "@/types/dsr";

/**
 * A department's status reports, grouped so it reads as a digest rather than a feed.
 *
 * Grouping is client-side and purely presentational — the server already scoped and
 * ordered the rows. Defaults to grouping by person, because the question this page
 * answers is "what has each of my people been doing", not "what happened on Tuesday".
 *
 * Read-only by design. Reviewing and flagging live on /dsr/review, which owns the
 * bulk-action machinery; duplicating it here would mean two code paths for the same
 * decision.
 */

const GROUP_OPTIONS = [
  { value: "employee", label: "By person" },
  { value: "date", label: "By day" },
  { value: "none", label: "Flat" },
] as const;

type GroupKey = (typeof GROUP_OPTIONS)[number]["value"];

export function DepartmentReportFeed({
  reports,
  total,
  summary,
  departmentName,
  rangeLabel,
  currentUserId,
}: {
  reports: DsrDto[];
  total: number;
  summary: { totalHours: number; byStatus: Record<DsrStatus, number>; contributors: number };
  departmentName: string;
  rangeLabel: string;
  currentUserId: string;
}) {
  const [group, setGroup] = useState<GroupKey>("employee");
  // Person groups start closed so twenty people fit on one screen; day groups open,
  // since a single day is short enough to read at a glance.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    if (group === "none") {
      return [{ key: "all", label: `All reports`, meta: rangeLabel, reports }];
    }

    const buckets = new Map<
      string,
      { label: string; meta: string | null; reports: DsrDto[]; avatar?: DsrDto["author"] }
    >();

    for (const report of reports) {
      const key = group === "employee" ? report.author.id : toDayKey(report.date);
      const label = group === "employee" ? report.author.name : formatDayFriendly(report.date);
      const meta =
        group === "employee"
          ? (report.author.designation ?? report.author.team?.name ?? null)
          : formatDayShort(report.date);

      const bucket =
        buckets.get(key) ??
        { label, meta, reports: [], avatar: group === "employee" ? report.author : undefined };
      bucket.reports.push(report);
      buckets.set(key, bucket);
    }

    return [...buckets.entries()].map(([key, value]) => ({ key, ...value }));
  }, [reports, group, rangeLabel]);

  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const allExpanded = expanded.size >= groups.length && groups.length > 0;

  return (
    <div className="space-y-3">
      {/* Digest header — the numbers a manager scans before reading anything. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-inset px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px]">
          <span className="flex items-center gap-1.5 text-fg-muted">
            <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
            {rangeLabel}
          </span>
          <span className="text-fg-muted">
            <span className="font-semibold text-fg tabular-nums">{total}</span> reports
          </span>
          <span className="flex items-center gap-1.5 text-fg-muted">
            <Users className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="font-semibold text-fg tabular-nums">{summary.contributors}</span>{" "}
            contributors
          </span>
          <span className="text-fg-muted">
            <span className="font-semibold text-fg tabular-nums">
              {formatHours(summary.totalHours)}
            </span>{" "}
            logged
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {DSR_STATUSES.filter((status) => summary.byStatus[status] > 0).map((status) => (
            <Badge key={status} tone={DSR_STATUS_TONE[status]} size="sm" dot>
              {DSR_STATUS_LABEL[status]} {summary.byStatus[status]}
            </Badge>
          ))}
        </div>
      </div>

      <div data-print="hide" className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          label="Group reports by"
          size="sm"
          value={group}
          onChange={setGroup}
          options={GROUP_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        />

        {group !== "none" ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setExpanded(allExpanded ? new Set() : new Set(groups.map((entry) => entry.key)))
            }
          >
            <Rows3 className="size-3.5" />
            {allExpanded ? "Collapse all" : "Expand all"}
          </Button>
        ) : null}
      </div>

      {groups.map((entry) => {
        const isOpen = group === "none" || expanded.has(entry.key);
        const groupHours = entry.reports.reduce((sum, report) => sum + report.hoursWorked, 0);

        return (
          <Card key={entry.key} variant="flat" className="overflow-hidden">
            {group !== "none" ? (
              <button
                type="button"
                onClick={() => toggle(entry.key)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-2.5 border-b border-border bg-surface-inset px-3 py-2.5 text-left transition-colors hover:bg-surface-hover"
              >
                {isOpen ? (
                  <ChevronDown className="size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
                ) : (
                  <ChevronRight className="size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
                )}

                {entry.avatar ? (
                  <Avatar
                    name={entry.avatar.name}
                    seed={entry.avatar.id}
                    src={entry.avatar.avatarUrl}
                    size="sm"
                  />
                ) : null}

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-fg">
                    {entry.label}
                    {entry.avatar?.id === currentUserId ? (
                      <span className="ml-1.5 font-normal text-fg-subtle">(you)</span>
                    ) : null}
                  </span>
                  {entry.meta ? (
                    <span className="block truncate text-[11.5px] text-fg-subtle">{entry.meta}</span>
                  ) : null}
                </span>

                <CountBadge count={entry.reports.length} />
                <span className="shrink-0 text-[11.5px] text-fg-muted tabular-nums">
                  {formatHours(groupHours)}
                </span>
              </button>
            ) : null}

            {isOpen ? (
              // Print always expands, whatever the screen state is.
              <div data-print="expand" className="divide-y divide-border">
                {entry.reports.map((report) => (
                  <div key={report.id} className="p-3">
                    <DsrCard
                      report={report}
                      showAuthor={group !== "employee"}
                      compact
                      className="border-0 bg-transparent p-0"
                    />
                  </div>
                ))}
              </div>
            ) : (
              // Collapsed: one line each, so the group is still scannable.
              <ul className="divide-y divide-border">
                {entry.reports.slice(0, 3).map((report) => (
                  <li key={report.id} className="flex items-center gap-2.5 px-3 py-2 text-[12.5px]">
                    <span className="shrink-0 text-fg-subtle tabular-nums">
                      {formatDayShort(report.date)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-fg-muted">
                      {truncate(markdownToText(report.tasksCompleted), 110)}
                    </span>
                    <Badge tone={DSR_STATUS_TONE[report.status]} size="sm">
                      {DSR_STATUS_LABEL[report.status]}
                    </Badge>
                  </li>
                ))}
                {entry.reports.length > 3 ? (
                  <li className="px-3 py-1.5 text-[11.5px] text-fg-subtle">
                    + {pluralize(entry.reports.length - 3, "more report")} — expand to read
                  </li>
                ) : null}
              </ul>
            )}
          </Card>
        );
      })}

      {total > reports.length ? (
        <p className={cn("pt-1 text-center text-[12.5px] text-fg-subtle")}>
          Showing {reports.length} of {total} reports from {departmentName}. Use the review queue for
          the full set and filters.
        </p>
      ) : null}
    </div>
  );
}
