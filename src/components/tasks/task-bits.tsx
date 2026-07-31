import Link from "next/link";
import { AlarmClock, CalendarDays, CheckSquare, MessageSquare, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";
import { AvatarStack } from "@/components/ui/avatar";
import {
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_TONE,
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/constants/enums";
import { differenceInDays, formatDayShort, today } from "@/lib/utils/date";
import { truncate } from "@/lib/utils/format";
import type { TaskDto, TaskTagDto } from "@/lib/services/tasks";

/**
 * The small pieces every task view shares — badges, the due-date chip, the tag row,
 * the progress bar and the card itself.
 *
 * Server Components: none of these hold state, and keeping them off the client bundle
 * matters when a board renders two hundred of them.
 */

export function PriorityBadge({ priority, size = "sm" }: { priority: TaskPriority; size?: "sm" | "md" }) {
  return (
    <Badge tone={TASK_PRIORITY_TONE[priority]} size={size} variant="soft">
      {TASK_PRIORITY_LABEL[priority]}
    </Badge>
  );
}

export function StatusBadge({ status, size = "sm" }: { status: TaskStatus; size?: "sm" | "md" }) {
  return (
    <Badge tone={TASK_STATUS_TONE[status]} size={size} dot>
      {TASK_STATUS_LABEL[status]}
    </Badge>
  );
}

/**
 * How long is left, in the words a person would use.
 *
 * Colour carries urgency but never alone — the text says "3 days late" either way, so
 * this reads correctly in greyscale, in a screen reader, and for someone who cannot
 * distinguish the red from the grey.
 */
export function DueChip({
  dueOn,
  deadlineAt,
  status,
  className,
}: {
  dueOn: Date | null;
  deadlineAt?: Date | null;
  status: TaskStatus;
  className?: string;
}) {
  if (!dueOn) {
    return (
      <span className={cn("inline-flex items-center gap-1 text-[11.5px] text-fg-subtle", className)}>
        <CalendarDays className="size-3" aria-hidden="true" />
        No due date
      </span>
    );
  }

  const closed = status === "COMPLETED";
  const days = differenceInDays(dueOn, today());
  const late = !closed && days < 0;
  const soon = !closed && days >= 0 && days <= 1;

  const label = closed
    ? formatDayShort(dueOn)
    : days < 0
      ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} late`
      : days === 0
        ? "Due today"
        : days === 1
          ? "Due tomorrow"
          : `${days} days left`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11.5px] font-medium",
        late ? "text-danger-text" : soon ? "text-warning-text" : "text-fg-muted",
        className,
      )}
      // The exact date, for anyone who needs it rather than the relative reading.
      title={`Due ${formatDayShort(dueOn)}${
        deadlineAt
          ? ` at ${deadlineAt.toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Asia/Kolkata",
            })}`
          : ""
      }`}
    >
      {late || soon ? (
        <AlarmClock className="size-3 shrink-0" aria-hidden="true" />
      ) : (
        <CalendarDays className="size-3 shrink-0" aria-hidden="true" />
      )}
      {label}
    </span>
  );
}

export function TagRow({ tags, max = 3 }: { tags: TaskTagDto[]; max?: number }) {
  if (tags.length === 0) return null;
  const shown = tags.slice(0, max);
  const rest = tags.length - shown.length;

  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-1.5 py-px text-[10.5px] font-medium text-fg-muted"
        >
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full"
            style={{ backgroundColor: `var(--cat-${tag.color})` }}
          />
          {tag.name}
        </span>
      ))}
      {rest > 0 ? <span className="text-[10.5px] text-fg-subtle">+{rest}</span> : null}
    </span>
  );
}

/**
 * Progress bar.
 *
 * The number is always printed beside it. A bar alone is a shape; "60%" is the
 * information, and it survives being read aloud.
 */
export function TaskProgress({
  percent,
  status,
  showLabel = true,
  className,
}: {
  percent: number;
  status: TaskStatus;
  showLabel?: boolean;
  className?: string;
}) {
  const tone =
    status === "COMPLETED"
      ? "bg-success"
      : status === "BLOCKED"
        ? "bg-danger"
        : status === "REVIEW"
          ? "bg-accent"
          : "bg-info";

  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${percent}% complete`}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted"
      >
        <span
          className={cn("block h-full rounded-full transition-[width] duration-300", tone)}
          style={{ width: `${Math.max(percent === 0 ? 0 : 3, percent)}%` }}
        />
      </span>
      {showLabel ? (
        <span className="w-8 shrink-0 text-right text-[10.5px] tabular-nums text-fg-subtle">
          {percent}%
        </span>
      ) : null}
    </span>
  );
}

/**
 * The card used by the board and the calendar.
 *
 * Density is deliberate: a Kanban column shows six or seven of these at once, so
 * everything on it has to survive the "would I miss this at a glance?" test. Counts
 * are icon + number rather than words for the same reason.
 */
export function TaskCard({
  task,
  compact = false,
  className,
}: {
  task: TaskDto;
  compact?: boolean;
  className?: string;
}) {
  const overdue =
    task.dueOn !== null && task.status !== "COMPLETED" && differenceInDays(task.dueOn, today()) < 0;

  return (
    <article
      className={cn(
        "group rounded-lg border bg-surface p-2.5 shadow-xs transition-shadow hover:shadow-sm",
        overdue ? "border-danger/30" : "border-border",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/tasks/${task.id}`}
          className="min-w-0 flex-1 rounded-sm text-[13px] leading-[18px] font-medium text-fg underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          {compact ? truncate(task.title, 58) : task.title}
        </Link>
        <PriorityBadge priority={task.priority} />
      </div>

      <p className="mt-1 font-mono text-[10.5px] tabular-nums text-fg-subtle">{task.taskNumber}</p>

      {task.tags.length > 0 && !compact ? (
        <div className="mt-2">
          <TagRow tags={task.tags} max={3} />
        </div>
      ) : null}

      {task.status !== "TODO" ? (
        <TaskProgress percent={task.progressPercent} status={task.status} className="mt-2.5" />
      ) : null}

      {task.blockedReason ? (
        <p className="mt-2 rounded-md border-l-2 border-danger/40 bg-danger-soft/40 px-2 py-1 text-[11px] leading-[15px] text-danger-text">
          {truncate(task.blockedReason, 110)}
        </p>
      ) : null}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <DueChip dueOn={task.dueOn} deadlineAt={task.deadlineAt} status={task.status} />

        <span className="flex items-center gap-2 text-[10.5px] text-fg-subtle">
          {task.counts.checklist > 0 ? (
            <span
              className="inline-flex items-center gap-0.5"
              title={`${task.counts.checklistDone} of ${task.counts.checklist} checklist items done`}
            >
              <CheckSquare className="size-3" aria-hidden="true" />
              {task.counts.checklistDone}/{task.counts.checklist}
            </span>
          ) : null}
          {task.counts.updates > 0 ? (
            <span className="inline-flex items-center gap-0.5" title={`${task.counts.updates} updates`}>
              <MessageSquare className="size-3" aria-hidden="true" />
              {task.counts.updates}
            </span>
          ) : null}
          {task.counts.attachments > 0 ? (
            <span
              className="inline-flex items-center gap-0.5"
              title={`${task.counts.attachments} attachments`}
            >
              <Paperclip className="size-3" aria-hidden="true" />
              {task.counts.attachments}
            </span>
          ) : null}
        </span>
      </div>

      {task.assignees.length > 0 ? (
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
          <AvatarStack
            people={task.assignees.map((person) => ({
              id: person.id,
              name: person.name,
              avatarUrl: person.avatarUrl,
            }))}
            size="xs"
            max={4}
          />
          {task.category ? (
            <span className="inline-flex items-center gap-1 text-[10.5px] text-fg-subtle">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full"
                style={{ backgroundColor: `var(--cat-${task.category.color})` }}
              />
              {task.category.name}
            </span>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
