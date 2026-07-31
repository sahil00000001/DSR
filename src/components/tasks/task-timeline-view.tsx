import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { AvatarStack } from "@/components/ui/avatar";
import { TASK_PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/constants/enums";
import {
  addDays,
  differenceInDays,
  formatDayShort,
  isSameDay,
  isWeekend,
  toDayKey,
  today,
} from "@/lib/utils/date";
import { truncate } from "@/lib/utils/format";
import { PriorityBadge, StatusBadge } from "@/components/tasks/task-bits";
import type { TaskDto } from "@/lib/services/tasks";

/**
 * Timeline view — one row per task, laid out against a day axis.
 *
 * ## Why the bar starts where it does
 *
 * A task has a due date but rarely a start date, so a Gantt chart's central premise
 * is missing. Rather than invent a start, the bar runs from whichever is known —
 * `startedAt` if work has begun, otherwise the creation date — to the due date. That
 * is an honest reading of "how long has this been open, and when is it wanted", which
 * is the question a timeline is actually opened to answer.
 *
 * ## Window
 *
 * Fixed at 28 days around today rather than fitted to the data, so the column widths
 * mean the same thing every time you look. Tasks outside the window are still listed,
 * with their bar clamped to the edge and an arrow marking that it continues.
 */

const WINDOW_DAYS = 28;
const DAYS_BEFORE = 7;

export function TaskTimelineView({ tasks }: { tasks: TaskDto[] }) {
  const now = today();
  const windowStart = addDays(now, -DAYS_BEFORE);
  const windowEnd = addDays(windowStart, WINDOW_DAYS - 1);

  const days = Array.from({ length: WINDOW_DAYS }, (_, index) => addDays(windowStart, index));

  // Only rows that intersect the window, ordered by when they are wanted.
  const rows = tasks
    .filter((task) => {
      const from = task.startedAt ?? task.createdAt;
      const to = task.dueOn ?? task.completedAt ?? now;
      return to >= windowStart && from <= windowEnd;
    })
    .sort((a, b) => {
      const left = a.dueOn?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const right = b.dueOn?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return left - right;
    });

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<CalendarRange className="size-5" />}
        title="Nothing falls in this window"
        description={`No task overlaps ${formatDayShort(windowStart)} to ${formatDayShort(
          windowEnd,
        )}. Try the list or calendar view, or widen the filters.`}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="overflow-x-auto">
        <div className="min-w-[52rem]">
          {/* Day axis */}
          <div className="sticky top-0 z-1 flex border-b border-border bg-surface-inset">
            <div className="w-[16rem] shrink-0 border-r border-border px-3 py-2 text-[10.5px] font-semibold tracking-wide text-fg-subtle uppercase">
              Task
            </div>
            <div className="flex flex-1">
              {days.map((day) => (
                <div
                  key={toDayKey(day)}
                  className={cn(
                    "flex-1 border-r border-border/60 px-0.5 py-1 text-center last:border-r-0",
                    isWeekend(day) && "bg-surface-muted/40",
                    isSameDay(day, now) && "bg-accent-soft",
                  )}
                >
                  <div
                    className={cn(
                      "text-[9px] tracking-wide uppercase",
                      isSameDay(day, now) ? "font-semibold text-accent" : "text-fg-subtle",
                    )}
                  >
                    {day.toLocaleDateString("en-GB", { weekday: "narrow", timeZone: "UTC" })}
                  </div>
                  <div
                    className={cn(
                      "text-[10.5px] tabular-nums",
                      isSameDay(day, now) ? "font-semibold text-accent" : "text-fg-muted",
                    )}
                  >
                    {day.getUTCDate()}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="divide-y divide-border">
            {rows.map((task) => {
              const from = task.startedAt ?? task.createdAt;
              const to = task.dueOn ?? task.completedAt ?? now;

              // Clamp to the window and remember whether we cut anything off.
              const startIndex = Math.max(0, differenceInDays(from, windowStart));
              const endIndex = Math.min(WINDOW_DAYS - 1, differenceInDays(to, windowStart));
              const clippedStart = from < windowStart;
              const clippedEnd = to > windowEnd;

              const span = Math.max(1, endIndex - startIndex + 1);
              const overdue =
                task.dueOn !== null &&
                task.status !== "COMPLETED" &&
                differenceInDays(task.dueOn, now) < 0;

              return (
                <div key={task.id} className="flex items-stretch hover:bg-surface-hover/40">
                  <div className="w-[16rem] shrink-0 border-r border-border px-3 py-2">
                    <Link
                      href={`/tasks/${task.id}`}
                      className="block truncate text-[12.5px] font-medium text-fg underline-offset-2 hover:underline"
                      title={task.title}
                    >
                      {truncate(task.title, 34)}
                    </Link>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="font-mono text-[10px] tabular-nums text-fg-subtle">
                        {task.taskNumber}
                      </span>
                      {task.assignees.length > 0 ? (
                        <AvatarStack
                          people={task.assignees.map((person) => ({
                            id: person.id,
                            name: person.name,
                            avatarUrl: person.avatarUrl,
                          }))}
                          size="xs"
                          max={2}
                        />
                      ) : null}
                    </div>
                  </div>

                  <div className="relative flex flex-1 items-center py-2">
                    {/* Day gridlines, so a bar can be read against the axis. */}
                    <div aria-hidden="true" className="absolute inset-0 flex">
                      {days.map((day) => (
                        <div
                          key={toDayKey(day)}
                          className={cn(
                            "flex-1 border-r border-border/40 last:border-r-0",
                            isWeekend(day) && "bg-surface-muted/30",
                            isSameDay(day, now) && "bg-accent-soft/50",
                          )}
                        />
                      ))}
                    </div>

                    <div
                      className="relative flex items-center px-0.5"
                      style={{
                        marginLeft: `${(startIndex / WINDOW_DAYS) * 100}%`,
                        width: `${(span / WINDOW_DAYS) * 100}%`,
                      }}
                    >
                      <div
                        title={`${task.taskNumber} · ${TASK_PRIORITY_LABEL[task.priority]} · ${
                          TASK_STATUS_LABEL[task.status]
                        } · ${task.progressPercent}%`}
                        className={cn(
                          "relative h-5 w-full overflow-hidden rounded",
                          clippedStart && "rounded-l-none",
                          clippedEnd && "rounded-r-none",
                          task.status === "COMPLETED"
                            ? "bg-success/25"
                            : overdue
                              ? "bg-danger/25"
                              : task.status === "BLOCKED"
                                ? "bg-danger/20"
                                : "bg-info/20",
                        )}
                      >
                        {/* Progress fill inside the bar — one mark, two facts. */}
                        <div
                          className={cn(
                            "absolute inset-y-0 left-0 rounded",
                            task.status === "COMPLETED"
                              ? "bg-success"
                              : overdue
                                ? "bg-danger"
                                : task.status === "BLOCKED"
                                  ? "bg-danger/60"
                                  : "bg-info",
                          )}
                          style={{ width: `${Math.max(2, task.progressPercent)}%` }}
                        />
                        <span className="absolute inset-0 flex items-center px-1.5 text-[9.5px] font-medium text-fg mix-blend-luminosity">
                          {span > 3 ? `${task.progressPercent}%` : ""}
                        </span>
                      </div>

                      {clippedEnd ? (
                        <span
                          aria-hidden="true"
                          className="absolute top-1/2 -right-1 -translate-y-1/2 text-[10px] text-fg-subtle"
                          title="Continues past this window"
                        >
                          ›
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex w-[8.5rem] shrink-0 items-center gap-1.5 border-l border-border px-2">
                    <StatusBadge status={task.status} />
                    <PriorityBadge priority={task.priority} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="border-t border-border bg-surface-inset px-3 py-2 text-[11px] text-fg-subtle">
        {formatDayShort(windowStart)} – {formatDayShort(windowEnd)} · bars run from when work
        started (or the task was created) to when it is due; the fill is progress.
      </p>
    </div>
  );
}
