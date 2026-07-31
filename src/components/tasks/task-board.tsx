"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, GripVertical, MoveRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { DropdownMenu, MenuItem } from "@/components/ui/dropdown-menu";
import { usePopover } from "@/components/ui/popover";
import { changeTaskStatusAction } from "@/server/actions/tasks";
import {
  TASK_BOARD_ORDER,
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
  type TaskStatus,
} from "@/lib/constants/enums";
import { TaskCard } from "@/components/tasks/task-bits";
import type { TaskDto } from "@/lib/services/tasks";

/**
 * Kanban board.
 *
 * ## Drag-and-drop without a dependency
 *
 * Native HTML5 drag events, not dnd-kit. The interaction here is "pick up a card,
 * drop it in a column" — the one case native DnD handles well — and ~40 kB for that
 * is not a good trade in an app already carrying four views.
 *
 * ## Dragging is never the only way to move a card
 *
 * Native drag-and-drop is unreachable from a keyboard and awkward on a touchscreen,
 * and this board will be used on a phone on a shop floor. Every card therefore also
 * carries a "move to" menu that does exactly the same thing. The brief asks for
 * drag-and-drop *and* for accessibility; only one of those is satisfied by dragging.
 *
 * ## Moves are optimistic
 *
 * The card jumps columns immediately and the server confirms afterwards. A board that
 * pauses for a round trip on every drop feels broken, and the failure path here is
 * cheap: on error the optimistic state is dropped and the real one re-renders.
 */

export function TaskBoard({
  tasks,
  canMove,
  truncated,
}: {
  tasks: TaskDto[];
  /** Per-task permission, resolved server-side. */
  canMove: Record<string, boolean>;
  truncated: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [, startTransition] = useTransition();

  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);

  /**
   * Optimistic overlay of status changes, keyed by task id.
   *
   * A map rather than a rebuilt array: two people can move two cards before either
   * request lands, and replacing the whole list would lose the first move.
   */
  const [moves, applyMove] = useOptimistic(
    {} as Record<string, TaskStatus>,
    (current, move: { id: string; status: TaskStatus }) => ({ ...current, [move.id]: move.status }),
  );

  const shown = tasks.map((task) =>
    moves[task.id] ? { ...task, status: moves[task.id]! } : task,
  );

  const columns = TASK_BOARD_ORDER.map((status) => ({
    status,
    tasks: shown.filter((task) => task.status === status),
  }));

  async function move(task: TaskDto, to: TaskStatus) {
    if (task.status === to) return;
    if (!canMove[task.id]) {
      toast.error("You can't move that task", "Only the people assigned to it, or an admin, can.");
      return;
    }

    // Blocking needs a reason — the action enforces it, so ask before sending.
    let reason: string | undefined;
    if (to === "BLOCKED") {
      const result = await confirm({
        title: `Mark ${task.taskNumber} as blocked?`,
        description: "Everyone on the task is told, so say what is holding it up.",
        confirmLabel: "Mark blocked",
        tone: "danger",
        prompt: {
          label: "What is blocking it?",
          placeholder: "Bearing lot rejected by QA — waiting on replacement stock.",
          required: true,
        },
      });
      if (!result.confirmed) return;
      reason = result.note;
    }

    startTransition(async () => {
      applyMove({ id: task.id, status: to });

      const formData = new FormData();
      formData.set("taskId", task.id);
      formData.set("status", to);
      if (reason) formData.set("blockedReason", reason);

      const response = await changeTaskStatusAction({ ok: null }, formData);
      if (response.ok) {
        toast.success(response.message ?? "Moved");
        router.refresh();
      } else {
        toast.error("Couldn't move that task", response.message);
        // Drop the optimistic state by re-reading the server's truth.
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      {truncated ? (
        <p className="rounded-lg border border-warning/30 bg-warning-soft/40 px-3 py-2 text-[12.5px] text-warning-text">
          Showing the first 500 tasks. Narrow the filters to see the rest — a board is
          not useful past a few hundred cards.
        </p>
      ) : null}

      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
        {columns.map((column) => (
          <section
            key={column.status}
            onDragOver={(event) => {
              event.preventDefault();
              setOver(column.status);
            }}
            onDragLeave={() => setOver((current) => (current === column.status ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              setOver(null);
              const id = event.dataTransfer.getData("text/task-id") || dragging;
              const task = tasks.find((candidate) => candidate.id === id);
              if (task) void move(task, column.status);
              setDragging(null);
            }}
            aria-label={`${TASK_STATUS_LABEL[column.status]} — ${column.tasks.length} tasks`}
            className={cn(
              "flex w-[17.5rem] shrink-0 flex-col rounded-xl border bg-surface-inset/60 transition-colors",
              over === column.status ? "border-accent bg-accent-soft/40" : "border-border",
            )}
          >
            <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
              <h3 className="flex items-center gap-2 text-[12.5px] font-semibold text-fg">
                <Badge tone={TASK_STATUS_TONE[column.status]} size="sm" dot>
                  {TASK_STATUS_LABEL[column.status]}
                </Badge>
              </h3>
              <span className="text-[11px] tabular-nums text-fg-subtle">{column.tasks.length}</span>
            </header>

            <div className="flex min-h-[6rem] flex-1 flex-col gap-2 p-2">
              {column.tasks.length === 0 ? (
                <p className="px-1 py-4 text-center text-[11.5px] text-fg-subtle">
                  {over === column.status ? "Drop here" : "Nothing here"}
                </p>
              ) : (
                column.tasks.map((task) => (
                  <div
                    key={task.id}
                    draggable={canMove[task.id]}
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/task-id", task.id);
                      event.dataTransfer.effectAllowed = "move";
                      setDragging(task.id);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                    className={cn(
                      "relative",
                      canMove[task.id] && "cursor-grab active:cursor-grabbing",
                      dragging === task.id && "opacity-40",
                    )}
                  >
                    <TaskCard task={task} compact />

                    {canMove[task.id] ? (
                      <div className="absolute top-1.5 right-1.5 flex items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 has-[button:focus-visible]:opacity-100">
                        <span
                          aria-hidden="true"
                          className="grid size-5 place-items-center text-fg-subtle"
                          title="Drag to move"
                        >
                          <GripVertical className="size-3" />
                        </span>

                        {/* The keyboard and touch path to the same outcome. */}
                        <MoveMenu task={task} onMove={move} />
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </section>
        ))}
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          title="No tasks match these filters"
          description="Clear a filter, or create a task to get the board started."
        />
      ) : null}
    </div>
  );
}

/**
 * The accessible route to moving a card.
 *
 * Split into its own component because `usePopover` is a hook and the board renders
 * one of these per card — a hook cannot be called inside that loop from the parent.
 */
function MoveMenu({
  task,
  onMove,
}: {
  task: TaskDto;
  onMove: (task: TaskDto, to: TaskStatus) => Promise<void>;
}) {
  const { triggerProps, panelProps, close } = usePopover({ role: "menu" });

  return (
    <>
      <button
        type="button"
        {...triggerProps}
        aria-label={`Move ${task.taskNumber} to another column`}
        className="grid size-5 place-items-center rounded text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        <MoveRight className="size-3" aria-hidden="true" />
      </button>

      <DropdownMenu {...panelProps} align="end">
        {TASK_BOARD_ORDER.filter((status) => status !== task.status).map((status) => (
          <MenuItem
            key={status}
            onClick={() => {
              close();
              void onMove(task, status);
            }}
          >
            <ChevronRight />
            {TASK_STATUS_LABEL[status]}
          </MenuItem>
        ))}
      </DropdownMenu>
    </>
  );
}
