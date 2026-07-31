import Link from "next/link";
import {
  AlarmClock,
  ArrowRight,
  Ban,
  CircleDot,
  ListChecks,
  Plus,
  SquareCheckBig,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PersonCell } from "@/components/ui/avatar";
import { DueChip, PriorityBadge, TaskProgress } from "@/components/tasks/task-bits";
import { formatPercent, truncate } from "@/lib/utils/format";
import type { AdminTaskSnapshot, TaskDto, UserTaskSnapshot } from "@/lib/services/tasks";

/**
 * Dashboard panels for tasks — sections 9 of the brief, split by role.
 *
 * Server Components. Both answer one question rather than listing everything: "what do
 * I need to do next" for a user, and "where is the work stuck" for an admin. A list
 * belongs on `/tasks`; the dashboard's job is to tell you whether to go there.
 */

export function MyTasksCard({
  snapshot,
  upcoming,
}: {
  snapshot: UserTaskSnapshot;
  upcoming: TaskDto[];
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="size-3.5 text-fg-subtle" aria-hidden="true" />
          Your tasks
          {snapshot.unseen > 0 ? (
            <Badge tone="accent" size="sm">
              {snapshot.unseen} new
            </Badge>
          ) : null}
        </CardTitle>
        <Link
          href="/tasks"
          className="inline-flex items-center gap-0.5 rounded-sm text-[11.5px] font-medium text-fg-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          All tasks
          <ArrowRight className="size-3" aria-hidden="true" />
        </Link>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Tile label="Open" value={snapshot.assigned} />
          <Tile label="Due today" value={snapshot.dueToday} tone={snapshot.dueToday > 0 ? "warning" : undefined} />
          <Tile label="Overdue" value={snapshot.overdue} tone={snapshot.overdue > 0 ? "danger" : undefined} />
        </div>

        {snapshot.assigned > 0 ? (
          <p className="text-[11.5px] text-fg-subtle">
            {formatPercent(snapshot.averageProgress)} average progress across your open work
            {snapshot.blocked > 0 ? ` · ${snapshot.blocked} blocked` : ""}
          </p>
        ) : null}

        {upcoming.length > 0 ? (
          <ul className="space-y-2 border-t border-border pt-3">
            {upcoming.map((task) => (
              <li key={task.id}>
                <Link
                  href={`/tasks/${task.id}`}
                  className="block rounded-md px-1.5 py-1 transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0 text-[12.5px] leading-[17px] font-medium text-fg">
                      {truncate(task.title, 52)}
                    </span>
                    <PriorityBadge priority={task.priority} />
                  </span>
                  <span className="mt-1 flex items-center justify-between gap-2">
                    <DueChip
                      dueOn={task.dueOn}
                      deadlineAt={task.deadlineAt}
                      status={task.status}
                    />
                    <span className="w-20">
                      <TaskProgress
                        percent={task.progressPercent}
                        status={task.status}
                        showLabel={false}
                      />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-3 py-3 text-center text-[12.5px] text-fg-muted">
            {snapshot.completedThisMonth > 0
              ? `Nothing open. You finished ${snapshot.completedThisMonth} task${
                  snapshot.completedThisMonth === 1 ? "" : "s"
                } this month.`
              : "Nothing assigned to you right now."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warning" | "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-2 py-2",
        tone === "danger"
          ? "border-danger/30 bg-danger-soft/40"
          : tone === "warning"
            ? "border-warning/30 bg-warning-soft/40"
            : "border-border bg-surface-inset",
      )}
    >
      <p
        className={cn(
          "text-lg leading-none font-semibold tabular-nums",
          tone === "danger" ? "text-danger-text" : tone === "warning" ? "text-warning-text" : "text-fg",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[10px] tracking-wide text-fg-subtle uppercase">{label}</p>
    </div>
  );
}

/**
 * Team workload — the admin half.
 *
 * Ordered by open count, because the reason to open this panel is spotting who is
 * buried. Overdue is called out per person rather than only in the total, since one
 * person three weeks behind and six people one day behind are different problems.
 */
export function TeamWorkloadCard({ snapshot }: { snapshot: AdminTaskSnapshot }) {
  const busiest = snapshot.workload.slice(0, 8);
  const maxOpen = Math.max(1, ...busiest.map((entry) => entry.open));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Users className="size-3.5 text-fg-subtle" aria-hidden="true" />
          Team workload
        </CardTitle>
        <Link
          href="/tasks?view=board"
          className="inline-flex items-center gap-0.5 rounded-sm text-[11.5px] font-medium text-fg-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          Board
          <ArrowRight className="size-3" aria-hidden="true" />
        </Link>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="Open" value={snapshot.open} />
          <Tile
            label="Overdue"
            value={snapshot.overdue}
            tone={snapshot.overdue > 0 ? "danger" : undefined}
          />
          <Tile
            label="In review"
            value={snapshot.inReview}
            tone={snapshot.inReview > 0 ? "warning" : undefined}
          />
          <Tile
            label="Blocked"
            value={snapshot.blocked}
            tone={snapshot.blocked > 0 ? "danger" : undefined}
          />
        </div>

        {busiest.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-3 text-center text-[12.5px] text-fg-muted">
            Nothing assigned to anybody yet.
          </p>
        ) : (
          <ul className="space-y-2 border-t border-border pt-3">
            {busiest.map((entry) => (
              <li key={entry.user.id} className="flex items-center gap-2.5">
                <Link
                  href={`/tasks?assignee=${entry.user.id}`}
                  className="min-w-0 flex-1 rounded-sm hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                >
                  <PersonCell
                    name={entry.user.name}
                    seed={entry.user.id}
                    src={entry.user.avatarUrl}
                    size="xs"
                    meta={entry.user.department ?? undefined}
                  />
                </Link>

                {/* Bar length is load; the red segment is the part that is late. */}
                <span
                  className="hidden h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-surface-muted sm:flex"
                  aria-hidden="true"
                >
                  <span
                    className="h-full bg-info"
                    style={{ width: `${((entry.open - entry.overdue) / maxOpen) * 100}%` }}
                  />
                  <span
                    className="h-full bg-danger"
                    style={{ width: `${(entry.overdue / maxOpen) * 100}%` }}
                  />
                </span>

                <span className="flex w-[5.5rem] shrink-0 items-center justify-end gap-1.5 text-[11px] tabular-nums">
                  <span className="text-fg" title={`${entry.open} open`}>
                    {entry.open}
                  </span>
                  {entry.overdue > 0 ? (
                    <span className="text-danger-text" title={`${entry.overdue} overdue`}>
                      +{entry.overdue} late
                    </span>
                  ) : (
                    <span className="text-fg-subtle">{entry.averageProgress}%</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {snapshot.unassigned > 0 ? (
          <Link
            href="/tasks?scope=unassigned"
            className="flex items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning-soft/50 px-3 py-2 text-[12.5px] font-medium text-warning-text transition-colors hover:bg-warning-soft"
          >
            <span>
              {snapshot.unassigned} task{snapshot.unassigned === 1 ? "" : "s"} with nobody
              assigned
            </span>
            <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Recent task activity across the org, for the admin rail. */
export function TaskActivityCard({
  activity,
}: {
  activity: Array<{
    id: string;
    kind: string;
    createdAt: Date;
    actor: { id: string; name: string; avatarUrl: string | null } | null;
    task: { id: string; taskNumber: string; title: string };
  }>;
}) {
  if (activity.length === 0) return null;

  const ICONS: Record<string, typeof CircleDot> = {
    completed: SquareCheckBig,
    blocked: Ban,
    created: Plus,
    status_changed: CircleDot,
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CircleDot className="size-3.5 text-fg-subtle" aria-hidden="true" />
          Task activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2.5">
          {activity.map((entry) => {
            const Icon = ICONS[entry.kind] ?? AlarmClock;
            return (
              <li key={entry.id} className="flex items-start gap-2">
                <Icon
                  className={cn(
                    "mt-0.5 size-3.5 shrink-0",
                    entry.kind === "completed"
                      ? "text-success"
                      : entry.kind === "blocked"
                        ? "text-danger"
                        : "text-fg-subtle",
                  )}
                  aria-hidden="true"
                />
                <p className="min-w-0 text-[12px] leading-[17px]">
                  <span className="font-medium text-fg">
                    {entry.actor?.name.split(" ")[0] ?? "System"}
                  </span>{" "}
                  <span className="text-fg-muted">{entry.kind.replace(/_/g, " ")}</span>{" "}
                  <Link
                    href={`/tasks/${entry.task.id}`}
                    className="text-accent underline-offset-2 hover:underline"
                  >
                    {entry.task.taskNumber}
                  </Link>
                </p>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
