"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2,
  CalendarRange,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Download,
  Flag,
  FileSpreadsheet,
  MapPin,
  Rows3,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, CountBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchInput } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FilterBar, FilterSelect } from "@/components/ui/filter-select";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { useDebouncedCallback } from "@/hooks/use-debounced-value";
import { DsrCard } from "@/components/dsr/dsr-card";
import { PrintButton } from "@/components/ui/print-button";
import { bulkReviewDsrAction } from "@/server/actions/dsr";
import {
  DSR_STATUSES,
  DSR_STATUS_LABEL,
  DSR_STATUS_TONE,
  type DsrStatus,
} from "@/lib/constants/enums";
import { formatDayShort, formatDayFriendly, toDayKey } from "@/lib/utils/date";
import { formatHours, pluralize, truncate } from "@/lib/utils/format";
import { markdownToText } from "@/lib/utils/markdown";
import type { DsrDto } from "@/types/dsr";
import type { OrgOptions } from "@/types/org";

/**
 * Bulk DSR review board.
 *
 * ## Filter state lives in the URL
 *
 * Every filter, the grouping, the sort and the page are query parameters. That
 * makes a filtered view shareable ("here's what I'm looking at"), survivable
 * across a refresh, and back-button correct — none of which is true of component
 * state. The server does the filtering, so the page stays fast at any data volume.
 *
 * ## Grouping is client-side
 *
 * Grouping only rearranges the current page, so it doesn't need a round trip.
 * Sorting and filtering *do* go to the server, because they change which rows are
 * on the page at all.
 */

const RANGE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "This week" },
  { value: "last-week", label: "Last week" },
  { value: "month", label: "This month" },
  { value: "last-30", label: "Last 30 days" },
] as const;

const SORT_OPTIONS = [
  { value: "date-desc", label: "Newest first" },
  { value: "date-asc", label: "Oldest first" },
  { value: "name-asc", label: "Name A–Z" },
  { value: "hours-desc", label: "Most hours" },
] as const;

const GROUP_OPTIONS = [
  { value: "none", label: "Flat" },
  { value: "employee", label: "Person" },
  { value: "date", label: "Day" },
  { value: "department", label: "Department" },
  { value: "status", label: "Status" },
] as const;

type GroupKey = (typeof GROUP_OPTIONS)[number]["value"];

interface ReviewBoardProps {
  reports: DsrDto[];
  total: number;
  page: number;
  pageSize: number;
  summary: { totalHours: number; byStatus: Record<DsrStatus, number>; contributors: number };
  rangeLabel: string;
  options: OrgOptions;
  canReview: boolean;
  currentUserId: string;
}

export function ReviewBoard({
  reports,
  total,
  page,
  pageSize,
  summary,
  rangeLabel,
  options,
  canReview,
  currentUserId,
}: ReviewBoardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [searchDraft, setSearchDraft] = useState(searchParams.get("q") ?? "");

  /** Writes params and resets to page 1 whenever the result set changes. */
  const setParams = useCallback(
    (updates: Record<string, string | string[] | null>, keepPage = false) => {
      const next = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(updates)) {
        next.delete(key);
        if (value === null || (Array.isArray(value) && value.length === 0)) continue;
        if (Array.isArray(value)) next.set(key, value.join(","));
        else if (value !== "") next.set(key, value);
      }

      if (!keepPage) next.delete("page");

      startTransition(() => {
        // `scroll: false` keeps the viewport where it is — jumping to the top on
        // every filter change makes a long board unusable.
        router.replace(`/dsr/review?${next.toString()}`, { scroll: false });
      });
    },
    [router, searchParams],
  );

  const pushSearch = useDebouncedCallback((value: string) => {
    setParams({ q: value || null });
  }, 350);

  const readList = (key: string): string[] => {
    const raw = searchParams.get(key);
    return raw ? raw.split(",").filter(Boolean) : [];
  };

  const group = (searchParams.get("group") ?? "employee") as GroupKey;
  const sort = searchParams.get("sort") ?? "date-desc";
  const range = searchParams.get("range") ?? "last-30";

  const activeFilterCount =
    ["employee", "department", "team", "location", "manager", "status"].filter(
      (key) => readList(key).length > 0,
    ).length + (searchParams.get("q") ? 1 : 0);

  // --- Grouping ------------------------------------------------------------

  const groups = useMemo(() => {
    if (group === "none") {
      return [{ key: "all", label: `All reports`, meta: null, reports }];
    }

    const buckets = new Map<string, { label: string; meta: string | null; reports: DsrDto[] }>();

    for (const report of reports) {
      let key: string;
      let label: string;
      let meta: string | null = null;

      switch (group) {
        case "employee":
          key = report.author.id;
          label = report.author.name;
          meta = report.author.department?.name ?? report.author.designation ?? null;
          break;
        case "date":
          key = toDayKey(report.date);
          label = formatDayFriendly(report.date);
          meta = formatDayShort(report.date);
          break;
        case "department":
          key = report.author.department?.id ?? "none";
          label = report.author.department?.name ?? "No department";
          break;
        case "status":
        default:
          key = report.status;
          label = DSR_STATUS_LABEL[report.status];
          break;
      }

      const bucket = buckets.get(key) ?? { label, meta, reports: [] };
      bucket.reports.push(report);
      buckets.set(key, bucket);
    }

    return [...buckets.entries()].map(([key, value]) => ({ key, ...value }));
  }, [reports, group]);

  const allIds = useMemo(() => reports.map((report) => report.id), [reports]);
  // Never offer to review your own report — the server refuses it anyway.
  const reviewableIds = useMemo(
    () => reports.filter((report) => report.author.id !== currentUserId && report.status !== "DRAFT"),
    [reports, currentUserId],
  );

  const toggleGroup = (key: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectedReviewable = reviewableIds.filter((report) => selected.has(report.id));

  const runBulk = async (status: "REVIEWED" | "FLAGGED") => {
    if (selectedReviewable.length === 0) return;

    const result = await confirm({
      title:
        status === "REVIEWED"
          ? `Mark ${pluralize(selectedReviewable.length, "report")} as reviewed?`
          : `Flag ${pluralize(selectedReviewable.length, "report")} for attention?`,
      description:
        status === "REVIEWED"
          ? "Each author is notified that you've read their report."
          : "Each author is notified and asked to revisit their report.",
      confirmLabel: status === "REVIEWED" ? "Mark reviewed" : "Flag reports",
      tone: status === "FLAGGED" ? "danger" : "default",
      prompt: {
        label: status === "FLAGGED" ? "What needs attention?" : "Note (optional)",
        placeholder:
          status === "FLAGGED"
            ? "Please add ticket references to your entries."
            : "Thanks — clear and useful this week.",
        required: status === "FLAGGED",
      },
    });

    if (!result.confirmed) return;

    startTransition(async () => {
      const response = await bulkReviewDsrAction({
        ids: selectedReviewable.map((report) => report.id),
        status,
        comment: result.note,
      });

      if (response.ok) {
        toast.success(response.message ?? "Reports updated");
        setSelected(new Set());
        router.refresh();
      } else {
        toast.error("Couldn't update the reports", response.message);
      }
    });
  };

  const exportHref = (format: "csv" | "xlsx") => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("format", format);
    return `/api/export/dsr?${params.toString()}`;
  };

  return (
    <div className={cn("space-y-4", isPending && "opacity-70 transition-opacity")}>
      {/* Filters */}
      <FilterBar activeCount={activeFilterCount} onClear={() => router.replace("/dsr/review")}>
        <SearchInput
          value={searchDraft}
          onValueChange={(value) => {
            setSearchDraft(value);
            pushSearch(value);
          }}
          placeholder="Search report text or names…"
          inputSize="sm"
          className="w-full sm:w-64"
        />

        <FilterSelect
          label="Range"
          icon={<CalendarRange />}
          multiple={false}
          searchable={false}
          selected={[range]}
          onChange={(values) => setParams({ range: values[0] ?? "last-30" })}
          options={RANGE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        />

        <FilterSelect
          label="People"
          icon={<Users />}
          selected={readList("employee")}
          onChange={(values) => setParams({ employee: values })}
          options={options.employees.map((person) => ({
            value: person.id,
            label: person.name,
            meta: person.department ?? person.employeeCode,
          }))}
        />

        <FilterSelect
          label="Department"
          icon={<Building2 />}
          selected={readList("department")}
          onChange={(values) => setParams({ department: values })}
          options={options.departments.map((department) => ({
            value: department.id,
            label: department.name,
            meta: pluralize(department.memberCount, "person", "people"),
            color: department.color,
          }))}
        />

        <FilterSelect
          label="Team"
          selected={readList("team")}
          onChange={(values) => setParams({ team: values })}
          options={options.teams.map((team) => ({
            value: team.id,
            label: team.name,
            meta: team.departmentName,
          }))}
        />

        <FilterSelect
          label="Location"
          icon={<MapPin />}
          selected={readList("location")}
          onChange={(values) => setParams({ location: values })}
          options={options.locations.map((location) => ({
            value: location.id,
            label: location.name,
            meta: location.city,
          }))}
        />

        <FilterSelect
          label="Manager"
          selected={readList("manager")}
          onChange={(values) => setParams({ manager: values })}
          options={options.managers.map((manager) => ({
            value: manager.id,
            label: manager.name,
            meta: manager.designation ?? undefined,
          }))}
        />

        <FilterSelect
          label="Status"
          searchable={false}
          selected={readList("status")}
          onChange={(values) => setParams({ status: values })}
          options={DSR_STATUSES.map((status) => ({
            value: status,
            label: DSR_STATUS_LABEL[status],
          }))}
        />
      </FilterBar>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {canReview ? (
            <Checkbox
              checked={selected.size > 0 && selected.size === allIds.length}
              indeterminate={selected.size > 0 && selected.size < allIds.length}
              onChange={(event) =>
                setSelected(event.target.checked ? new Set(allIds) : new Set<string>())
              }
              label={
                selected.size > 0 ? `${selected.size} selected` : `Select all ${allIds.length}`
              }
              className="mr-1"
            />
          ) : null}

          <SegmentedControl
            label="Group by"
            size="sm"
            value={group}
            onChange={(value) => setParams({ group: value }, true)}
            options={GROUP_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
          />

          <Select
            selectSize="sm"
            value={sort}
            onChange={(event) => setParams({ sort: event.target.value })}
            options={SORT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            aria-label="Sort order"
            className="w-[9.5rem]"
          />
        </div>

        <div data-print="hide" className="flex flex-wrap items-center gap-1.5">
          <Tooltip content={expanded.size > 0 ? "Collapse all groups" : "Expand all groups"}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setExpanded(
                  expanded.size > 0 ? new Set() : new Set(groups.map((entry) => entry.key)),
                )
              }
            >
              <Rows3 className="size-3.5" />
              {expanded.size > 0 ? "Collapse" : "Expand"} all
            </Button>
          </Tooltip>

          <a
            href={exportHref("csv")}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-[12.5px] font-medium text-fg shadow-xs transition-colors hover:bg-surface-hover"
          >
            <Download className="size-3.5" />
            CSV
          </a>
          <a
            href={exportHref("xlsx")}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-[12.5px] font-medium text-fg shadow-xs transition-colors hover:bg-surface-hover"
          >
            <FileSpreadsheet className="size-3.5" />
            Excel
          </a>
          <PrintButton label="Print / PDF" variant="secondary" size="sm" />
        </div>
      </div>

      {/* Summary strip */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border bg-surface-inset px-4 py-2.5 text-[12.5px]">
        <span className="text-fg-muted">
          <span className="font-semibold text-fg tabular-nums">{total}</span> reports
        </span>
        <span className="text-fg-muted">
          <span className="font-semibold text-fg tabular-nums">{summary.contributors}</span> people
        </span>
        <span className="text-fg-muted">
          <span className="font-semibold text-fg tabular-nums">
            {formatHours(summary.totalHours)}
          </span>{" "}
          logged
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {DSR_STATUSES.filter((status) => summary.byStatus[status] > 0).map((status) => (
            <Badge key={status} tone={DSR_STATUS_TONE[status]} size="sm" dot>
              {DSR_STATUS_LABEL[status]} {summary.byStatus[status]}
            </Badge>
          ))}
        </span>
      </div>

      {/* Results */}
      {reports.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList className="size-5" />}
            title="No reports match these filters"
            description={`Nothing was filed in ${rangeLabel.toLowerCase()} matching what you've selected. Try widening the date range or clearing a filter.`}
            action={
              activeFilterCount > 0 ? (
                <Button variant="secondary" size="sm" onClick={() => router.replace("/dsr/review")}>
                  <X className="size-4" />
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map((entry) => {
            const isOpen = group === "none" || expanded.has(entry.key);
            const groupHours = entry.reports.reduce((sum, report) => sum + report.hoursWorked, 0);
            const first = entry.reports[0];

            return (
              <Card key={entry.key} variant="flat" className="overflow-hidden">
                {group !== "none" ? (
                  <div className="flex items-center gap-2 border-b border-border bg-surface-inset px-3 py-2">
                    {canReview ? (
                      <Checkbox
                        checked={entry.reports.every((report) => selected.has(report.id))}
                        indeterminate={
                          entry.reports.some((report) => selected.has(report.id)) &&
                          !entry.reports.every((report) => selected.has(report.id))
                        }
                        onChange={(event) => {
                          const next = new Set(selected);
                          for (const report of entry.reports) {
                            if (event.target.checked) next.add(report.id);
                            else next.delete(report.id);
                          }
                          setSelected(next);
                        }}
                        aria-label={`Select all reports in ${entry.label}`}
                      />
                    ) : null}

                    <button
                      type="button"
                      onClick={() => toggleGroup(entry.key)}
                      aria-expanded={isOpen}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-0.5 text-left"
                    >
                      {isOpen ? (
                        <ChevronDown className="size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
                      ) : (
                        <ChevronRight className="size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
                      )}

                      {group === "employee" && first ? (
                        <Avatar
                          name={first.author.name}
                          seed={first.author.id}
                          src={first.author.avatarUrl}
                          size="sm"
                        />
                      ) : null}

                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg">
                        {entry.label}
                      </span>

                      {entry.meta ? (
                        <span className="hidden shrink-0 text-[11.5px] text-fg-subtle sm:inline">
                          {entry.meta}
                        </span>
                      ) : null}

                      <CountBadge count={entry.reports.length} />
                      <span className="shrink-0 text-[11.5px] text-fg-muted tabular-nums">
                        {formatHours(groupHours)}
                      </span>
                    </button>
                  </div>
                ) : null}

                {isOpen ? (
                  <div
                    // Print always shows the content, whatever the screen state is.
                    data-print="expand"
                    className="divide-y divide-border"
                  >
                    {entry.reports.map((report) => (
                      <div key={report.id} className="flex gap-3 p-3">
                        {canReview ? (
                          <div className="pt-1.5">
                            <Checkbox
                              checked={selected.has(report.id)}
                              disabled={report.author.id === currentUserId}
                              onChange={(event) => {
                                const next = new Set(selected);
                                if (event.target.checked) next.add(report.id);
                                else next.delete(report.id);
                                setSelected(next);
                              }}
                              aria-label={`Select ${report.author.name}'s report for ${formatDayShort(report.date)}`}
                            />
                          </div>
                        ) : null}

                        <div className="min-w-0 flex-1">
                          <DsrCard
                            report={report}
                            showAuthor={group !== "employee"}
                            compact
                            className="border-0 bg-transparent p-0"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  // Collapsed: one-line excerpts, so the group is still scannable.
                  <ul className="divide-y divide-border">
                    {entry.reports.slice(0, 3).map((report) => (
                      <li
                        key={report.id}
                        className="flex items-center gap-2.5 px-3 py-2 text-[12.5px]"
                      >
                        <span className="shrink-0 text-fg-subtle tabular-nums">
                          {formatDayShort(report.date)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-fg-muted">
                          {truncate(markdownToText(report.tasksCompleted), 120)}
                        </span>
                        <Badge tone={DSR_STATUS_TONE[report.status]} size="sm">
                          {DSR_STATUS_LABEL[report.status]}
                        </Badge>
                      </li>
                    ))}
                    {entry.reports.length > 3 ? (
                      <li className="px-3 py-1.5 text-[11.5px] text-fg-subtle">
                        + {entry.reports.length - 3} more — expand to read
                      </li>
                    ) : null}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        itemLabel="reports"
        onPageChange={(next) => setParams({ page: String(next) }, true)}
        onPageSizeChange={(size) => setParams({ size: String(size) })}
      />

      {/* Bulk action bar — appears only when there's a selection to act on. */}
      {canReview && selectedReviewable.length > 0 ? (
        <div
          data-print="hide"
          className="fixed inset-x-3 bottom-24 z-30 mx-auto max-w-lg lg:bottom-6"
        >
          <div className="glass animate-fade-up flex items-center gap-3 rounded-xl border p-2.5 shadow-pop">
            <span className="pl-1.5 text-[12.5px] font-medium text-fg">
              {selectedReviewable.length} selected
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => runBulk("FLAGGED")}
                loading={isPending}
              >
                <Flag className="size-3.5" />
                Flag
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => runBulk("REVIEWED")}
                loading={isPending}
              >
                <CheckCheck className="size-3.5" />
                Mark reviewed
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
