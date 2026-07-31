import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";
import { TASK_PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/constants/enums";
import {
  addMonths,
  formatMonthLong,
  isSameDay,
  isWeekend,
  monthGrid,
  startOfMonth,
  toDayKey,
  today,
} from "@/lib/utils/date";
import { truncate } from "@/lib/utils/format";
import type { TaskDto } from "@/lib/services/tasks";

/**
 * Month calendar of due dates.
 *
 * A Server Component: it renders a static grid from data the page already has, and
 * month navigation is a link rather than state — which makes a given month
 * shareable and back-button correct, the same reasoning as the filters.
 *
 * Undated tasks are listed beneath rather than hidden. A calendar that silently drops
 * a third of the work is worse than one that admits it.
 */
export function TaskCalendar({
  tasks,
  month,
  basePath,
  searchParams,
}: {
  tasks: TaskDto[];
  /** `YYYY-MM`, or undefined for the current month. */
  month: string | undefined;
  basePath: string;
  /** Current query, so month links preserve every other filter. */
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const now = today();
  const anchor =
    month && /^\d{4}-\d{2}$/.test(month)
      ? new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1))
      : startOfMonth(now);

  const days = monthGrid(anchor);
  const monthIndex = anchor.getUTCMonth();

  const byDay = new Map<string, TaskDto[]>();
  for (const task of tasks) {
    if (!task.dueOn) continue;
    const key = toDayKey(task.dueOn);
    byDay.set(key, [...(byDay.get(key) ?? []), task]);
  }

  const undated = tasks.filter((task) => !task.dueOn);

  const monthLink = (offset: number) => {
    const target = addMonths(anchor, offset);
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (key === "month" || value === undefined) continue;
      next.set(key, Array.isArray(value) ? value.join(",") : value);
    }
    next.set("view", "calendar");
    next.set("month", toDayKey(target).slice(0, 7));
    return `${basePath}?${next.toString()}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[14px] font-semibold text-fg">{formatMonthLong(anchor)}</h3>
        <div className="flex items-center gap-1">
          <Link
            href={monthLink(-1)}
            aria-label="Previous month"
            className="grid size-7 place-items-center rounded-md border border-border text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Link>
          <Link
            href={monthLink(0)}
            className="rounded-md border border-border px-2.5 py-1 text-[12px] font-medium text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
          >
            Today
          </Link>
          <Link
            href={monthLink(1)}
            aria-label="Next month"
            className="grid size-7 place-items-center rounded-md border border-border text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-7 border-b border-border bg-surface-inset">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
            <div
              key={label}
              className="px-2 py-1.5 text-center text-[10.5px] font-semibold tracking-wide text-fg-subtle uppercase"
            >
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{label[0]}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = toDayKey(day);
            const dayTasks = byDay.get(key) ?? [];
            const outside = day.getUTCMonth() !== monthIndex;
            const isToday = isSameDay(day, now);

            return (
              <div
                key={key}
                className={cn(
                  "min-h-[5.5rem] border-r border-b border-border p-1.5 last:border-r-0",
                  outside && "bg-surface-inset/50",
                  isWeekend(day) && !outside && "bg-surface-inset/30",
                )}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={cn(
                      "grid size-5 place-items-center rounded-full text-[11px] tabular-nums",
                      isToday
                        ? "bg-accent font-semibold text-accent-fg"
                        : outside
                          ? "text-fg-subtle"
                          : "text-fg-muted",
                    )}
                  >
                    {day.getUTCDate()}
                  </span>
                  {dayTasks.length > 2 ? (
                    <span className="text-[9.5px] text-fg-subtle">{dayTasks.length}</span>
                  ) : null}
                </div>

                <div className="space-y-1">
                  {dayTasks.slice(0, 3).map((task) => (
                    <Link
                      key={task.id}
                      href={`/tasks/${task.id}`}
                      title={`${task.taskNumber} · ${task.title} · ${
                        TASK_PRIORITY_LABEL[task.priority]
                      } · ${TASK_STATUS_LABEL[task.status]}`}
                      className={cn(
                        "flex items-center gap-1 rounded border-l-2 bg-surface px-1 py-0.5 text-[10.5px] leading-tight transition-colors hover:bg-surface-hover",
                        task.status === "COMPLETED"
                          ? "border-success text-fg-subtle line-through"
                          : task.priority === "CRITICAL"
                            ? "border-danger text-fg"
                            : task.priority === "HIGH"
                              ? "border-warning text-fg"
                              : "border-info text-fg-muted",
                      )}
                    >
                      <span className="truncate">{truncate(task.title, 26)}</span>
                    </Link>
                  ))}
                  {dayTasks.length > 3 ? (
                    <span className="block px-1 text-[9.5px] text-fg-subtle">
                      +{dayTasks.length - 3} more
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {undated.length > 0 ? (
        <div className="rounded-xl border border-border p-3">
          <p className="mb-2 flex items-center gap-2 text-[12.5px] font-medium text-fg">
            No due date
            <Badge tone="neutral" variant="outline" size="sm">
              {undated.length}
            </Badge>
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {undated.slice(0, 20).map((task) => (
              <li key={task.id}>
                <Link
                  href={`/tasks/${task.id}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-[11.5px] text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
                >
                  <span className="font-mono text-[10px] tabular-nums text-fg-subtle">
                    {task.taskNumber}
                  </span>
                  {truncate(task.title, 40)}
                </Link>
              </li>
            ))}
            {undated.length > 20 ? (
              <li className="self-center text-[11px] text-fg-subtle">
                +{undated.length - 20} more
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
