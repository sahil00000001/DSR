"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlarmClock,
  Building2,
  CalendarDays,
  CalendarRange,
  Columns3,
  Flag,
  FolderOpen,
  GanttChart,
  ListChecks,
  Rows3,
  Tag,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Input, SearchInput } from "@/components/ui/input";
import { FilterBar, FilterSelect } from "@/components/ui/filter-select";
import { Select } from "@/components/ui/select";
import { useDebouncedCallback } from "@/hooks/use-debounced-value";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
} from "@/lib/constants/enums";
import type { OrgOptions } from "@/types/org";

/**
 * Filters, the view switcher and the saved scopes.
 *
 * Everything lives in the URL — filters, sort, view and calendar month — for the same
 * reasons as the DSR board: a filtered view is shareable, survives a refresh, and the
 * back button does what it looks like it does. It also means switching from list to
 * board keeps your filters, which is the whole point of having four views over one
 * data set rather than four screens.
 */

const VIEWS = [
  { value: "list", label: "List", icon: Rows3 },
  { value: "board", label: "Board", icon: Columns3 },
  { value: "calendar", label: "Calendar", icon: CalendarDays },
  { value: "timeline", label: "Timeline", icon: GanttChart },
] as const;

/**
 * Named scopes — the "saved views" section 11 implies.
 *
 * These are the questions people actually arrive with, so they are one click rather
 * than three filter dropdowns.
 */
const SCOPES = [
  { value: "all", label: "Everything" },
  { value: "mine", label: "Mine" },
  { value: "overdue", label: "Overdue" },
  { value: "due-today", label: "Due today" },
  { value: "due-week", label: "This week" },
  { value: "mentioned", label: "Mentions me" },
] as const;

const SORTS = [
  { value: "due-asc", label: "Due soonest" },
  { value: "due-desc", label: "Due latest" },
  { value: "priority-desc", label: "Highest priority" },
  { value: "updated-desc", label: "Recently updated" },
  { value: "created-desc", label: "Newest" },
  { value: "title-asc", label: "Title A–Z" },
] as const;

export function TaskFilters({
  basePath,
  options,
  categories,
  tags,
  showPeople,
  counts,
}: {
  basePath: string;
  options: OrgOptions;
  categories: Array<{ id: string; name: string; color: string; taskCount: number }>;
  tags: Array<{ id: string; name: string; color: string; useCount: number }>;
  /** Employees see only their own tasks, so person/department pickers are noise. */
  showPeople: boolean;
  counts: { overdue: number; dueToday: number; dueThisWeek: number };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchDraft, setSearchDraft] = useState(searchParams.get("q") ?? "");

  const view = searchParams.get("view") ?? "list";
  const scope = searchParams.get("scope") ?? "all";

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
        // `scroll: false` keeps the viewport put — jumping to the top on every
        // filter change makes a long board unusable.
        router.replace(`${basePath}?${next.toString()}`, { scroll: false });
      });
    },
    [basePath, router, searchParams],
  );

  const pushSearch = useDebouncedCallback((value: string) => {
    setParams({ q: value || null });
  }, 300);

  const list = (key: string) => searchParams.get(key)?.split(",").filter(Boolean) ?? [];

  const activeCount = [
    "q",
    "status",
    "priority",
    "assignee",
    "createdBy",
    "category",
    "tag",
    "department",
    "from",
    "to",
  ].filter((key) => searchParams.get(key)).length;

  /** A link that swaps one param and keeps the rest. */
  const withParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === null) next.delete(key);
    else next.set(key, value);
    next.delete("page");
    return `${basePath}?${next.toString()}`;
  };

  return (
    <div className={cn("space-y-3", isPending && "opacity-70 transition-opacity")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Scopes. Links rather than buttons, so they are shareable and
            middle-clickable like any other navigation. */}
        <nav aria-label="Task scope" className="flex flex-wrap items-center gap-1">
          {SCOPES.map((entry) => {
            const active = scope === entry.value || (entry.value === "all" && scope === "all");
            const badge =
              entry.value === "overdue"
                ? counts.overdue
                : entry.value === "due-today"
                  ? counts.dueToday
                  : entry.value === "due-week"
                    ? counts.dueThisWeek
                    : 0;

            return (
              <Link
                key={entry.value}
                href={withParam("scope", entry.value === "all" ? null : entry.value)}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
                  active
                    ? "bg-accent-soft text-accent"
                    : "text-fg-muted hover:bg-surface-hover hover:text-fg",
                )}
              >
                {entry.value === "overdue" ? (
                  <AlarmClock className="size-3.5" aria-hidden="true" />
                ) : null}
                {entry.label}
                {badge > 0 ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[10.5px] tabular-nums",
                      entry.value === "overdue"
                        ? "bg-danger text-danger-fg"
                        : active
                          ? "bg-accent text-accent-fg"
                          : "bg-surface-muted text-fg-muted",
                    )}
                  >
                    {badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div
          role="group"
          aria-label="View"
          className="flex items-center rounded-lg bg-surface-inset p-0.5"
        >
          {VIEWS.map((entry) => (
            <Link
              key={entry.value}
              href={withParam("view", entry.value === "list" ? null : entry.value)}
              scroll={false}
              aria-current={view === entry.value ? "page" : undefined}
              title={`${entry.label} view`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
                view === entry.value
                  ? "bg-surface text-fg shadow-xs"
                  : "text-fg-subtle hover:text-fg-muted",
              )}
            >
              <entry.icon className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">{entry.label}</span>
            </Link>
          ))}
        </div>
      </div>

      <FilterBar
        activeCount={activeCount}
        onClear={() => {
          setSearchDraft("");
          setParams({
            q: null,
            status: null,
            priority: null,
            assignee: null,
            createdBy: null,
            category: null,
            tag: null,
            department: null,
            from: null,
            to: null,
          });
        }}
      >
        <SearchInput
          value={searchDraft}
          onValueChange={(value) => {
            setSearchDraft(value);
            pushSearch(value);
          }}
          placeholder="Search titles, updates, files…"
          inputSize="sm"
          className="w-full sm:w-60"
          aria-label="Search tasks"
        />

        <FilterSelect
          label="Status"
          icon={<ListChecks />}
          size="sm"
          options={TASK_STATUSES.map((status) => ({
            value: status,
            label: TASK_STATUS_LABEL[status],
          }))}
          selected={list("status")}
          onChange={(selected) => setParams({ status: selected })}
        />

        <FilterSelect
          label="Priority"
          icon={<Flag />}
          size="sm"
          options={TASK_PRIORITIES.map((priority) => ({
            value: priority,
            label: TASK_PRIORITY_LABEL[priority],
          }))}
          selected={list("priority")}
          onChange={(selected) => setParams({ priority: selected })}
        />

        {categories.length > 0 ? (
          <FilterSelect
            label="Project"
            icon={<FolderOpen />}
            size="sm"
            searchable
            options={categories.map((category) => ({
              value: category.id,
              label: category.name,
              color: `var(--cat-${category.color})`,
              meta: `${category.taskCount}`,
            }))}
            selected={list("category")}
            onChange={(selected) => setParams({ category: selected })}
          />
        ) : null}

        {tags.length > 0 ? (
          <FilterSelect
            label="Tags"
            icon={<Tag />}
            size="sm"
            searchable
            options={tags.map((tag) => ({
              value: tag.id,
              label: tag.name,
              color: `var(--cat-${tag.color})`,
              meta: tag.useCount > 0 ? `${tag.useCount}` : undefined,
            }))}
            selected={list("tag")}
            onChange={(selected) => setParams({ tag: selected })}
          />
        ) : null}

        {showPeople ? (
          <>
            <FilterSelect
              label="Assignee"
              icon={<Users />}
              size="sm"
              searchable
              options={options.employees.map((employee) => ({
                value: employee.id,
                label: employee.name,
                meta: employee.department ?? undefined,
              }))}
              selected={list("assignee")}
              onChange={(selected) => setParams({ assignee: selected })}
            />

            <FilterSelect
              label="Department"
              icon={<Building2 />}
              size="sm"
              options={options.departments.map((department) => ({
                value: department.id,
                label: department.name,
                color: department.color,
              }))}
              selected={list("department")}
              onChange={(selected) => setParams({ department: selected })}
            />
          </>
        ) : null}

        <span className="flex items-center gap-1.5">
          <CalendarRange className="size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
          <Input
            type="date"
            inputSize="sm"
            aria-label="Due on or after"
            value={searchParams.get("from") ?? ""}
            onChange={(event) => setParams({ from: event.target.value || null })}
            className="w-[8.5rem]"
          />
          <span className="text-[12px] text-fg-subtle">to</span>
          <Input
            type="date"
            inputSize="sm"
            aria-label="Due on or before"
            value={searchParams.get("to") ?? ""}
            onChange={(event) => setParams({ to: event.target.value || null })}
            className="w-[8.5rem]"
          />
        </span>

        {/* Sorting only applies where rows are in a sequence. */}
        {view === "list" ? (
          <Select
            aria-label="Sort tasks"
            value={searchParams.get("sort") ?? "due-asc"}
            onChange={(event) => setParams({ sort: event.target.value })}
            selectSize="sm"
            className="w-[10.5rem]"
            options={SORTS}
          />
        ) : null}
      </FilterBar>
    </div>
  );
}
