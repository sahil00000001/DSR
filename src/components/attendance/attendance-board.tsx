"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, ChevronLeft, ChevronRight, Download, MapPin, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Select, optionsFrom } from "@/components/ui/select";
import { Textarea, SearchInput } from "@/components/ui/input";
import { FilterBar, FilterSelect } from "@/components/ui/filter-select";
import { EmptyState } from "@/components/ui/empty-state";
import { HeatGrid, type HeatCell, type HeatRow } from "@/components/charts/heat-grid";
import { PrintButton } from "@/components/ui/print-button";
import { useToast } from "@/components/ui/toast";
import { useDebouncedCallback } from "@/hooks/use-debounced-value";
import { overrideAttendanceAction } from "@/server/actions/attendance";
import { IDLE } from "@/server/actions/form-state";
import { STATUS_COLOR } from "@/lib/charts/palette";
import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUS_LABEL,
  type AttendanceStatus,
} from "@/lib/constants/enums";
import { formatMonthLong, parseDayKey, formatDayLong } from "@/lib/utils/date";
import { pluralize } from "@/lib/utils/format";
import type { OrgOptions } from "@/types/org";

export interface BoardPersonDto {
  id: string;
  name: string;
  employeeCode: string;
  department: string | null;
  days: Array<{
    key: string;
    status: AttendanceStatus;
    inferred: boolean;
    note: string | null;
  }>;
  summary: { worked: number; absent: number; leave: number };
}

/**
 * Team attendance board.
 *
 * A heat grid rather than 20 calendars: the question a manager actually asks is
 * "who was missing, and when", and that's a matrix. Clicking a cell opens an
 * admin correction dialog — the same action the API enforces, so the UI can't
 * offer an edit the server would reject.
 */
export function AttendanceBoard({
  people,
  monthKey,
  dayKeys,
  options,
  canOverride,
}: {
  people: BoardPersonDto[];
  monthKey: string;
  dayKeys: string[];
  options: OrgOptions;
  canOverride: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  const [searchDraft, setSearchDraft] = useState(searchParams.get("q") ?? "");
  const [editing, setEditing] = useState<{ person: BoardPersonDto; dayKey: string } | null>(null);

  const setParams = (updates: Record<string, string | string[] | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      next.delete(key);
      if (value === null || (Array.isArray(value) && value.length === 0)) continue;
      next.set(key, Array.isArray(value) ? value.join(",") : value);
    }
    startTransition(() => router.replace(`/attendance/board?${next.toString()}`, { scroll: false }));
  };

  const pushSearch = useDebouncedCallback((value: string) => setParams({ q: value || null }), 300);

  const readList = (key: string) => {
    const raw = searchParams.get(key);
    return raw ? raw.split(",").filter(Boolean) : [];
  };

  const shiftMonth = (amount: number) => {
    const [year, month] = monthKey.split("-").map(Number);
    const next = new Date(Date.UTC(year!, month! - 1 + amount, 1));
    setParams({
      month: `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`,
    });
  };

  const month = parseDayKey(`${monthKey}-01`);
  const activeFilters =
    readList("department").length + readList("location").length + (searchParams.get("q") ? 1 : 0);

  const rows: HeatRow[] = people.map((person) => ({
    key: person.id,
    label: person.name,
    meta: person.department ?? person.employeeCode,
    cells: person.days.map<HeatCell>((day) => ({
      key: day.key,
      color: STATUS_COLOR[day.status],
      label: ATTENDANCE_STATUS_LABEL[day.status],
      title: `${person.name} — ${formatDayLong(parseDayKey(day.key))}: ${
        ATTENDANCE_STATUS_LABEL[day.status]
      }${day.note ? ` (${day.note})` : ""}`,
    })),
  }));

  const exportHref = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("format", "csv");
    params.set("month", monthKey);
    return `/api/export/attendance?${params.toString()}`;
  };

  return (
    <div className="space-y-4">
      <FilterBar
        activeCount={activeFilters}
        onClear={() => router.replace(`/attendance/board?month=${monthKey}`)}
      >
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-0.5">
          <Button variant="ghost" size="icon-sm" onClick={() => shiftMonth(-1)} aria-label="Previous month">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[8.5rem] px-1 text-center text-[12.5px] font-medium text-fg">
            {formatMonthLong(month)}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={() => shiftMonth(1)} aria-label="Next month">
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <SearchInput
          value={searchDraft}
          onValueChange={(value) => {
            setSearchDraft(value);
            pushSearch(value);
          }}
          placeholder="Find a person…"
          inputSize="sm"
          className="w-full sm:w-52"
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

        <div className="ml-auto flex items-center gap-1.5">
          <a
            href={exportHref()}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-[12.5px] font-medium text-fg shadow-xs transition-colors hover:bg-surface-hover"
          >
            <Download className="size-3.5" />
            CSV
          </a>
          <PrintButton label="Print" size="sm" />
        </div>
      </FilterBar>

      <Card className={isPending ? "opacity-70 transition-opacity" : undefined}>
        <CardContent className="pt-4">
          {people.length === 0 ? (
            <EmptyState
              size="sm"
              title="Nobody matches these filters"
              description="Try clearing a filter or widening the search."
            />
          ) : (
            <HeatGrid
              rows={rows}
              columns={dayKeys.map((key) => String(parseDayKey(key).getUTCDate()))}
              legend={(
                ["PRESENT", "WFH", "HALF_DAY", "LEAVE", "ABSENT", "HOLIDAY", "WEEKEND"] as AttendanceStatus[]
              ).map((status) => ({
                label: ATTENDANCE_STATUS_LABEL[status],
                color: STATUS_COLOR[status],
              }))}
              onCellClick={
                canOverride
                  ? (row, cell) => {
                      const person = people.find((candidate) => candidate.id === row.key);
                      if (person) setEditing({ person, dayKey: cell.key });
                    }
                  : undefined
              }
            />
          )}
        </CardContent>
      </Card>

      {/* Per-person totals — the numbers behind the grid, always readable. */}
      {people.length > 0 ? (
        <Card>
          <CardContent className="pt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12.5px]">
                <caption className="sr-only">Attendance totals for {formatMonthLong(month)}</caption>
                <thead>
                  <tr className="border-b border-border text-fg-muted">
                    <th scope="col" className="pb-2 font-medium">Person</th>
                    <th scope="col" className="pb-2 text-right font-medium">Worked</th>
                    <th scope="col" className="pb-2 text-right font-medium">Leave</th>
                    <th scope="col" className="pb-2 text-right font-medium">Unrecorded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {people.map((person) => (
                    <tr key={person.id}>
                      <td className="py-1.5 text-fg">{person.name}</td>
                      <td className="py-1.5 text-right font-medium tabular-nums">
                        {person.summary.worked}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-fg-muted">
                        {person.summary.leave}
                      </td>
                      <td
                        className={
                          person.summary.absent > 0
                            ? "py-1.5 text-right font-medium text-danger-text tabular-nums"
                            : "py-1.5 text-right tabular-nums text-fg-muted"
                        }
                      >
                        {person.summary.absent}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {editing ? (
        <OverrideDialog
          person={editing.person}
          dayKey={editing.dayKey}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
          notify={toast}
        />
      ) : null}
    </div>
  );
}

/** Admin correction of a single cell. */
function OverrideDialog({
  person,
  dayKey,
  onClose,
  onSaved,
  notify,
}: {
  person: BoardPersonDto;
  dayKey: string;
  onClose: () => void;
  onSaved: () => void;
  notify: ReturnType<typeof useToast>;
}) {
  const [state, action, pending] = useActionState(overrideAttendanceAction, IDLE);
  const existing = person.days.find((day) => day.key === dayKey);

  useEffect(() => {
    if (state.ok === true) {
      notify.success(state.message ?? "Attendance updated");
      onSaved();
    } else if (state.ok === false && state.message) {
      notify.error("Couldn't update attendance", state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Correct ${person.name}'s attendance`}
      description={formatDayLong(parseDayKey(dayKey))}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="override-form" variant="primary" loading={pending}>
            <Save className="size-4" />
            Save correction
          </Button>
        </>
      }
    >
      <form id="override-form" action={action} className="space-y-4">
        <input type="hidden" name="userId" value={person.id} />
        <input type="hidden" name="date" value={dayKey} />

        <Field
          label="Status"
          error={state.fieldErrors?.status}
          hint="Setting weekend or holiday clears the record — those are derived, not stored."
        >
          <Select
            name="status"
            defaultValue={existing?.status ?? "PRESENT"}
            options={optionsFrom(ATTENDANCE_STATUSES, ATTENDANCE_STATUS_LABEL)}
          />
        </Field>

        <Field label="Reason" optional error={state.fieldErrors?.note}>
          <Textarea
            name="note"
            rows={2}
            autosize
            defaultValue={existing?.note ?? ""}
            placeholder="Was at the client site — confirmed by their manager."
          />
        </Field>

        <p className="text-[11.5px] text-fg-subtle">
          Corrections are attributed to you in the audit log.
        </p>
      </form>
    </Dialog>
  );
}
