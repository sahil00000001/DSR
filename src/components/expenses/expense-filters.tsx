"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, CalendarRange, Tag, Users, Wallet } from "lucide-react";
import { SearchInput } from "@/components/ui/input";
import { Input } from "@/components/ui/input";
import { FilterBar, FilterSelect } from "@/components/ui/filter-select";
import { useDebouncedCallback } from "@/hooks/use-debounced-value";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABEL,
  EXPENSE_STATUSES,
  EXPENSE_STATUS_LABEL,
} from "@/lib/constants/enums";
import type { OrgOptions } from "@/types/org";

/**
 * Filters for the claim list.
 *
 * State lives in the URL for the same reasons as the DSR board: a filtered view is
 * shareable, survives a refresh and behaves correctly with the back button. The
 * server does the filtering, so this stays fast however many claims exist.
 */
export function ExpenseFilters({
  basePath,
  options,
  showPeople,
}: {
  basePath: string;
  options: OrgOptions;
  /** Employees see only their own claims, so person/department pickers are noise. */
  showPeople: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchDraft, setSearchDraft] = useState(searchParams.get("q") ?? "");

  const setParams = useCallback(
    (updates: Record<string, string | string[] | null>) => {
      const next = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(updates)) {
        next.delete(key);
        if (value === null || (Array.isArray(value) && value.length === 0)) continue;
        if (Array.isArray(value)) next.set(key, value.join(","));
        else if (value !== "") next.set(key, value);
      }

      // Any change to the result set invalidates the page number.
      next.delete("page");

      startTransition(() => {
        router.replace(`${basePath}?${next.toString()}`, { scroll: false });
      });
    },
    [basePath, router, searchParams],
  );

  const pushSearch = useDebouncedCallback((value: string) => {
    setParams({ q: value || null });
  }, 300);

  const list = (key: string) => searchParams.get(key)?.split(",").filter(Boolean) ?? [];

  const activeCount = ["q", "status", "category", "department", "employee", "from", "to"].filter(
    (key) => searchParams.get(key),
  ).length;

  return (
    <FilterBar
      activeCount={activeCount}
      onClear={() => {
        setSearchDraft("");
        setParams({
          q: null,
          status: null,
          category: null,
          department: null,
          employee: null,
          from: null,
          to: null,
        });
      }}
      className={isPending ? "opacity-70 transition-opacity" : undefined}
    >
      <SearchInput
        value={searchDraft}
        onValueChange={(value) => {
          setSearchDraft(value);
          pushSearch(value);
        }}
        placeholder="Search title, vendor, bill no…"
        inputSize="sm"
        className="w-full sm:w-56"
        aria-label="Search claims"
      />

      <FilterSelect
        label="Status"
        icon={<Wallet />}
        size="sm"
        options={EXPENSE_STATUSES.map((status) => ({
          value: status,
          label: EXPENSE_STATUS_LABEL[status],
        }))}
        selected={list("status")}
        onChange={(selected) => setParams({ status: selected })}
      />

      <FilterSelect
        label="Category"
        icon={<Tag />}
        size="sm"
        searchable
        options={EXPENSE_CATEGORIES.map((category) => ({
          value: category,
          label: EXPENSE_CATEGORY_LABEL[category],
        }))}
        selected={list("category")}
        onChange={(selected) => setParams({ category: selected })}
      />

      {showPeople ? (
        <>
          <FilterSelect
            label="Department"
            icon={<Building2 />}
            size="sm"
            options={options.departments.map((department) => ({
              value: department.id,
              label: department.name,
              color: department.color,
              meta: `${department.memberCount}`,
            }))}
            selected={list("department")}
            onChange={(selected) => setParams({ department: selected })}
          />

          <FilterSelect
            label="Person"
            icon={<Users />}
            size="sm"
            searchable
            options={options.employees.map((employee) => ({
              value: employee.id,
              label: employee.name,
              meta: employee.department ?? undefined,
            }))}
            selected={list("employee")}
            onChange={(selected) => setParams({ employee: selected })}
          />
        </>
      ) : null}

      <span className="flex items-center gap-1.5">
        <CalendarRange className="size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
        <Input
          type="date"
          inputSize="sm"
          aria-label="Spent on or after"
          value={searchParams.get("from") ?? ""}
          onChange={(event) => setParams({ from: event.target.value || null })}
          className="w-[8.5rem]"
        />
        <span className="text-[12px] text-fg-subtle">to</span>
        <Input
          type="date"
          inputSize="sm"
          aria-label="Spent on or before"
          value={searchParams.get("to") ?? ""}
          onChange={(event) => setParams({ to: event.target.value || null })}
          className="w-[8.5rem]"
        />
      </span>
    </FilterBar>
  );
}
