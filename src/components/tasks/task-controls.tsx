"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Minus, Plus, Square, SquareCheckBig } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import {
  changeTaskStatusAction,
  setTaskProgressAction,
  toggleChecklistItemAction,
} from "@/server/actions/tasks";
import {
  TASK_BOARD_ORDER,
  TASK_STATUS_LABEL,
  TASK_STATUS_MEANING,
  type TaskStatus,
} from "@/lib/constants/enums";
import { formatRelative } from "@/lib/utils/date";
import { TaskProgress } from "@/components/tasks/task-bits";

/**
 * The controls on a task detail page: status, progress and the checklist.
 *
 * All three are optimistic. These are the interactions someone performs while standing
 * at a machine with a phone in one hand, and a spinner between tapping and seeing the
 * change is exactly where an internal tool starts to feel like paperwork.
 */

export function StatusControl({
  taskId,
  taskNumber,
  status,
  disabled,
}: {
  taskId: string;
  taskNumber: string;
  status: TaskStatus;
  disabled?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(status, (_current, next: TaskStatus) => next);

  async function move(to: TaskStatus) {
    if (to === shown) return;

    let reason: string | undefined;
    if (to === "BLOCKED") {
      const result = await confirm({
        title: `Mark ${taskNumber} as blocked?`,
        description: "Everyone on the task is told, so say what is holding it up.",
        confirmLabel: "Mark blocked",
        tone: "danger",
        prompt: {
          label: "What is blocking it?",
          placeholder: "Bearing lot rejected by QA — waiting on replacement stock.",
          required: true,
          hint: "Shown on the task and in the notification.",
        },
      });
      if (!result.confirmed) return;
      reason = result.note;
    }

    startTransition(async () => {
      setShown(to);

      const formData = new FormData();
      formData.set("taskId", taskId);
      formData.set("status", to);
      if (reason) formData.set("blockedReason", reason);

      const response = await changeTaskStatusAction({ ok: null }, formData);
      if (response.ok) toast.success(response.message ?? "Status updated");
      else toast.error("Couldn't change the status", response.message);
      router.refresh();
    });
  }

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Task status"
        className="grid grid-cols-2 gap-1.5 sm:grid-cols-3"
      >
        {TASK_BOARD_ORDER.map((option) => {
          const active = shown === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => void move(option)}
              className={cn(
                "rounded-lg border px-2 py-2 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                active
                  ? option === "COMPLETED"
                    ? "border-success/40 bg-success-soft text-success-text"
                    : option === "BLOCKED"
                      ? "border-danger/40 bg-danger-soft text-danger-text"
                      : "border-accent/40 bg-accent-soft text-accent"
                  : "border-border text-fg-muted hover:bg-surface-hover hover:text-fg",
              )}
            >
              {TASK_STATUS_LABEL[option]}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11.5px] leading-[16px] text-fg-subtle">
        {TASK_STATUS_MEANING[shown]}
      </p>
    </div>
  );
}

/**
 * Progress control.
 *
 * Steps of 10 with a slider, rather than a free-text percentage: nobody meaningfully
 * distinguishes 63% from 65%, and a coarse control is faster to use on a phone. The
 * exact figure still shows, and the checklist overrides this when one exists.
 */
export function ProgressControl({
  taskId,
  percent,
  status,
  disabled,
  checklistDriven,
}: {
  taskId: string;
  percent: number;
  status: TaskStatus;
  disabled?: boolean;
  /** True when a checklist exists, in which case ticking items drives this. */
  checklistDriven: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(percent, (_current, next: number) => next);

  function commit(next: number) {
    const clamped = Math.max(0, Math.min(100, next));
    if (clamped === shown) return;

    startTransition(async () => {
      setShown(clamped);

      const formData = new FormData();
      formData.set("taskId", taskId);
      formData.set("progressPercent", String(clamped));

      const response = await setTaskProgressAction({ ok: null }, formData);
      if (response.ok) toast.success(response.message ?? "Progress saved");
      else toast.error("Couldn't save progress", response.message);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <TaskProgress percent={shown} status={status} />

      {checklistDriven ? (
        <p className="text-[11.5px] text-fg-subtle">
          Driven by the checklist below — tick items to move this.
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            onClick={() => commit(shown - 10)}
            disabled={disabled || shown === 0}
            aria-label="Decrease progress by 10%"
          >
            <Minus className="size-3.5" />
          </Button>

          <input
            type="range"
            min={0}
            max={100}
            step={10}
            value={shown}
            disabled={disabled}
            onChange={(event) => setShown(Number(event.target.value))}
            onPointerUp={(event) => commit(Number(event.currentTarget.value))}
            onKeyUp={(event) => commit(Number(event.currentTarget.value))}
            aria-label="Progress percent"
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-surface-muted accent-accent disabled:cursor-not-allowed"
          />

          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            onClick={() => commit(shown + 10)}
            disabled={disabled || shown === 100}
            aria-label="Increase progress by 10%"
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  doneAt: Date | null;
  doneBy: { id: string; name: string } | null;
}

export function TaskChecklist({
  taskId,
  items,
  disabled,
}: {
  taskId: string;
  items: ChecklistItem[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();

  /**
   * Optimistic overlay keyed by item id, not a replaced array — someone ticking three
   * items quickly must not have the first two snap back while the third is in flight.
   */
  const [ticks, applyTick] = useOptimistic(
    {} as Record<string, boolean>,
    (current, tick: { id: string; done: boolean }) => ({ ...current, [tick.id]: tick.done }),
  );

  const shown = items.map((item) =>
    item.id in ticks ? { ...item, done: ticks[item.id]! } : item,
  );
  const done = shown.filter((item) => item.done).length;

  function toggle(item: ChecklistItem, next: boolean) {
    startTransition(async () => {
      applyTick({ id: item.id, done: next });

      const formData = new FormData();
      formData.set("taskId", taskId);
      formData.set("itemId", item.id);
      formData.set("done", String(next));

      const response = await toggleChecklistItemAction({ ok: null }, formData);
      if (!response.ok) toast.error("Couldn't update the checklist", response.message);
      router.refresh();
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[12px] font-medium text-fg">
          <SquareCheckBig className="size-3.5 text-fg-subtle" aria-hidden="true" />
          Checklist
        </p>
        <p className="text-[11.5px] tabular-nums text-fg-subtle">
          {done} of {items.length}
        </p>
      </div>

      <TaskProgress
        percent={Math.round((done / items.length) * 100)}
        status={done === items.length ? "COMPLETED" : "IN_PROGRESS"}
        showLabel={false}
      />

      <ul className="space-y-0.5">
        {shown.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => toggle(item, !item.done)}
              className={cn(
                "flex w-full items-start gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors",
                disabled ? "cursor-not-allowed" : "hover:bg-surface-hover",
              )}
              aria-pressed={item.done}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "mt-px grid size-4 shrink-0 place-items-center rounded border transition-colors",
                  item.done
                    ? "border-success bg-success text-success-fg"
                    : "border-border-strong bg-surface",
                )}
              >
                {item.done ? <Check className="size-3" /> : <Square className="size-0" />}
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-[12.5px] leading-[18px]",
                    item.done ? "text-fg-subtle line-through" : "text-fg-muted",
                  )}
                >
                  {item.label}
                </span>
                {item.done && item.doneBy && item.doneAt ? (
                  <span className="block text-[10.5px] text-fg-subtle">
                    {item.doneBy.name.split(" ")[0]} · {formatRelative(item.doneAt)}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
