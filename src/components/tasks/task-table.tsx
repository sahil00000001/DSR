"use client";

import Link from "next/link";
import { ListChecks } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { AvatarStack } from "@/components/ui/avatar";
import { TASK_PRIORITY_WEIGHT } from "@/lib/constants/enums";
import { formatDuration, truncate } from "@/lib/utils/format";
import {
  DueChip,
  PriorityBadge,
  StatusBadge,
  TagRow,
  TaskProgress,
} from "@/components/tasks/task-bits";
import type { TaskDto } from "@/lib/services/tasks";

/**
 * List view.
 *
 * Sorting is client-side here because it only rearranges the current page, matching
 * how the DSR review board behaves. Filtering goes to the server, because it changes
 * which rows are on the page at all.
 */
export function TaskTable({
  tasks,
  emptyAction,
}: {
  tasks: TaskDto[];
  emptyAction?: React.ReactNode;
}) {
  const columns: Array<Column<TaskDto>> = [
    {
      id: "task",
      header: "Task",
      sortable: true,
      sortValue: (task) => task.title,
      cell: (task) => (
        <span className="block min-w-0">
          <Link
            href={`/tasks/${task.id}`}
            className="block max-w-[26rem] truncate font-medium text-fg underline-offset-2 hover:underline"
            title={task.title}
          >
            {truncate(task.title, 80)}
          </Link>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-fg-subtle">
            <span className="font-mono tabular-nums">{task.taskNumber}</span>
            {task.category ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1">
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: `var(--cat-${task.category.color})` }}
                  />
                  {task.category.name}
                </span>
              </>
            ) : null}
            {task.tags.length > 0 ? <TagRow tags={task.tags} max={2} /> : null}
          </span>
        </span>
      ),
    },
    {
      id: "assignees",
      header: "Assigned to",
      width: "1%",
      cell: (task) =>
        task.assignees.length === 0 ? (
          <span className="text-[12px] text-fg-subtle">Nobody</span>
        ) : (
          <AvatarStack
            people={task.assignees.map((person) => ({
              id: person.id,
              name: person.name,
              avatarUrl: person.avatarUrl,
            }))}
            size="xs"
            max={3}
          />
        ),
    },
    {
      id: "priority",
      header: "Priority",
      width: "1%",
      sortable: true,
      sortValue: (task) => TASK_PRIORITY_WEIGHT[task.priority],
      cell: (task) => <PriorityBadge priority={task.priority} />,
    },
    {
      id: "due",
      header: "Due",
      width: "1%",
      sortable: true,
      // Undated tasks sort last rather than first, matching the server's ordering.
      sortValue: (task) => task.dueOn ?? new Date(8.64e15),
      cell: (task) => (
        <DueChip
          dueOn={task.dueOn}
          deadlineAt={task.deadlineAt}
          status={task.status}
          className="whitespace-nowrap"
        />
      ),
    },
    {
      id: "progress",
      header: "Progress",
      width: "9rem",
      sortable: true,
      sortValue: (task) => task.progressPercent,
      cell: (task) => (
        <span className="block w-[8rem]">
          <TaskProgress percent={task.progressPercent} status={task.status} />
          {task.counts.checklist > 0 ? (
            <span className="mt-1 block text-[10px] text-fg-subtle">
              {task.counts.checklistDone}/{task.counts.checklist} checklist
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: "estimate",
      header: "Estimate",
      align: "right",
      width: "1%",
      hideBelow: "lg",
      sortable: true,
      sortValue: (task) => task.estimateMinutes ?? 0,
      cell: (task) => (
        <span className="whitespace-nowrap tabular-nums text-fg-muted">
          {task.estimateMinutes ? formatDuration(task.estimateMinutes) : "—"}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      width: "1%",
      sortable: true,
      sortValue: (task) => task.status,
      cell: (task) => (
        <span className="flex flex-col items-start gap-1">
          <StatusBadge status={task.status} />
          {task.dependsOn.some((dep) => dep.status !== "COMPLETED") ? (
            <span className="text-[10px] whitespace-nowrap text-fg-subtle">
              waits on {task.dependsOn.filter((d) => d.status !== "COMPLETED")[0]!.taskNumber}
            </span>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      data={tasks}
      columns={columns}
      rowKey={(task) => task.id}
      caption="Tasks"
      defaultSort={{ id: "due", direction: "asc" }}
      empty={
        <EmptyState
          icon={<ListChecks className="size-5" />}
          title="No tasks here"
          description="Either nothing matches these filters, or nothing has been assigned yet."
          action={emptyAction}
        />
      }
    />
  );
}
