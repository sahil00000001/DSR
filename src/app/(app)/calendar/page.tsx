import type { Metadata } from "next";
import { Award, Cake, PartyPopper, Plane } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/session";
import { getCalendarMonth, getNextHoliday, getUpcoming } from "@/lib/services/calendar";
import {
  formatDayFriendly,
  formatMonthLong,
  monthGrid,
  parseDayKey,
  startOfMonth,
  toDayKey,
  today,
  isWeekend,
} from "@/lib/utils/date";
import { LEAVE_COLOR } from "@/lib/charts/palette";
import { HOLIDAY_TYPE_LABEL } from "@/lib/constants/enums";
import { MonthNav } from "@/components/calendar/month-nav";
import type { CalendarEvent, CalendarEventKind } from "@/lib/services/calendar";

export const metadata: Metadata = {
  title: "Calendar",
  description: "Holidays, leave, birthdays and anniversaries.",
};

const KIND_STYLE: Record<CalendarEventKind, { icon: typeof Cake; className: string }> = {
  HOLIDAY: { icon: PartyPopper, className: "bg-cat-amber/15 text-[var(--cat-amber)]" },
  LEAVE: { icon: Plane, className: "bg-accent-soft text-accent" },
  BIRTHDAY: { icon: Cake, className: "bg-cat-rose/15 text-[var(--cat-rose)]" },
  ANNIVERSARY: { icon: Award, className: "bg-cat-emerald/15 text-[var(--cat-emerald)]" },
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireUser();
  const { month: monthParam } = await searchParams;

  const month =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam)
      ? new Date(Date.UTC(Number(monthParam.slice(0, 4)), Number(monthParam.slice(5, 7)) - 1, 1))
      : startOfMonth(today());

  const monthKey = `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`;

  const [{ events }, upcoming, nextHoliday] = await Promise.all([
    getCalendarMonth(month),
    getUpcoming(30),
    getNextHoliday(),
  ]);

  const grid = monthGrid(month);
  const todayKey = toDayKey(today());
  const currentMonth = month.getUTCMonth();

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Who's off, what's closed, and whose birthday is coming up."
        actions={<MonthNav monthKey={monthKey} basePath="/calendar" />}
        meta={
          nextHoliday ? (
            <Badge tone="warning" dot>
              Next holiday: {nextHoliday.name} · {formatDayFriendly(nextHoliday.date)}
            </Badge>
          ) : undefined
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader>
            <CardTitle>{formatMonthLong(month)}</CardTitle>
          </CardHeader>

          <CardContent>
            <div role="grid" aria-label={`Calendar for ${formatMonthLong(month)}`}>
              <div role="row" className="mb-1.5 grid grid-cols-7 gap-1.5">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
                  <div
                    key={label}
                    role="columnheader"
                    className="text-center text-[10.5px] font-semibold tracking-wide text-fg-subtle uppercase"
                  >
                    <span className="hidden sm:inline">{label}</span>
                    <span className="sm:hidden">{label[0]}</span>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1.5">
                {grid.map((day) => {
                  const key = toDayKey(day);
                  const dayEvents = events.get(key) ?? [];
                  const outside = day.getUTCMonth() !== currentMonth;
                  const weekend = isWeekend(day);
                  const isToday = key === todayKey;

                  return (
                    <div
                      key={key}
                      role="gridcell"
                      aria-label={`${formatDayFriendly(day)}${
                        dayEvents.length > 0 ? `: ${dayEvents.map((e) => e.title).join(", ")}` : ""
                      }`}
                      className={cn(
                        "flex min-h-[5.5rem] flex-col rounded-lg border p-1.5",
                        outside
                          ? "border-transparent opacity-40"
                          : weekend
                            ? "border-border bg-surface-inset"
                            : "border-border bg-surface",
                        isToday && "ring-2 ring-accent",
                      )}
                    >
                      <span
                        className={cn(
                          "mb-1 text-[11.5px] leading-none font-semibold tabular-nums",
                          isToday ? "text-accent" : outside ? "text-fg-subtle" : "text-fg",
                        )}
                      >
                        {day.getUTCDate()}
                      </span>

                      <div className="min-h-0 flex-1 space-y-1 overflow-hidden">
                        {dayEvents.slice(0, 3).map((event) => (
                          <EventChip key={event.id} event={event} />
                        ))}
                        {dayEvents.length > 3 ? (
                          <p className="px-1 text-[9.5px] text-fg-subtle">
                            +{dayEvents.length - 3} more
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border pt-3.5">
              {(
                [
                  ["HOLIDAY", "Holiday"],
                  ["LEAVE", "On leave"],
                  ["BIRTHDAY", "Birthday"],
                  ["ANNIVERSARY", "Work anniversary"],
                ] as Array<[CalendarEventKind, string]>
              ).map(([kind, label]) => {
                const Icon = KIND_STYLE[kind].icon;
                return (
                  <li key={kind} className="flex items-center gap-1.5 text-[11.5px] text-fg-muted">
                    <span
                      className={cn(
                        "grid size-4 place-items-center rounded",
                        KIND_STYLE[kind].className,
                      )}
                      aria-hidden="true"
                    >
                      <Icon className="size-2.5" />
                    </span>
                    {label}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        <aside>
          <Card>
            <CardHeader>
              <CardTitle>Next 30 days</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {upcoming.length === 0 ? (
                <EmptyState
                  size="sm"
                  title="Nothing scheduled"
                  description="Holidays, approved leave and milestones will appear here."
                />
              ) : (
                <ul className="space-y-2.5">
                  {upcoming.map((event) => {
                    const Icon = KIND_STYLE[event.kind].icon;
                    return (
                      <li key={`${event.id}-${event.dayKey}`} className="flex items-center gap-2.5">
                        {event.person ? (
                          <Avatar
                            name={event.person.name}
                            seed={event.person.id}
                            src={event.person.avatarUrl}
                            size="sm"
                          />
                        ) : (
                          <span
                            className={cn(
                              "grid size-6 shrink-0 place-items-center rounded-md",
                              KIND_STYLE[event.kind].className,
                            )}
                            aria-hidden="true"
                          >
                            <Icon className="size-3" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-medium text-fg">
                            {event.title}
                          </span>
                          <span className="block text-[11px] text-fg-subtle">
                            {formatDayFriendly(parseDayKey(event.dayKey))}
                            {event.holidayType ? ` · ${HOLIDAY_TYPE_LABEL[event.holidayType]}` : ""}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}

function EventChip({ event }: { event: CalendarEvent }) {
  const Icon = KIND_STYLE[event.kind].icon;

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded px-1 py-0.5",
        event.kind === "LEAVE" ? "" : KIND_STYLE[event.kind].className,
      )}
      style={
        event.kind === "LEAVE" && event.leaveType
          ? {
              backgroundColor: `color-mix(in oklab, ${LEAVE_COLOR[event.leaveType]} 16%, transparent)`,
              color: LEAVE_COLOR[event.leaveType],
            }
          : undefined
      }
      title={event.title}
    >
      <Icon className="size-2.5 shrink-0" aria-hidden="true" />
      <span className="truncate text-[9.5px] leading-tight font-medium">
        {event.person ? event.person.name.split(" ")[0] : event.title}
      </span>
    </div>
  );
}
