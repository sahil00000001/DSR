"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, GripVertical, Plus, Save, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { createOrderAction } from "@/server/actions/orders";
import { IDLE } from "@/server/actions/form-state";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  type TaskPriority,
} from "@/lib/constants/enums";
import { todayKey } from "@/lib/utils/date";

/**
 * Create an order.
 *
 * ## The feasibility warning is the point of this form
 *
 * As stages are added, the form adds up the allotted days and compares them to the
 * working days available before the promised date — live, as you type. If the plan does
 * not fit, it says so **before the order is created**, which is the earliest possible
 * moment to catch the problem the client described. Everything else here is data entry.
 *
 * The arithmetic is a deliberate approximation: weekends only, no holiday list, because
 * the client has none of that loaded in the browser. It is a warning, not the forecast —
 * the server recomputes properly with holidays the moment the order exists.
 */

interface StageDraft {
  key: string;
  name: string;
  assigneeId: string;
  days: string;
}

let stageCounter = 0;
const newStage = (): StageDraft => ({
  key: `stage-${(stageCounter += 1)}`,
  name: "",
  assigneeId: "",
  days: "1",
});

/** Working days from today to `target`, weekends excluded. See the note above. */
function workingDaysUntil(target: string): number {
  if (!target) return 0;
  const end = new Date(`${target}T00:00:00Z`);
  const start = new Date(`${todayKey()}T00:00:00Z`);
  if (Number.isNaN(end.getTime()) || end <= start) return 0;

  let count = 0;
  let cursor = start;
  let guard = 0;
  while (cursor < end && guard < 3650) {
    cursor = new Date(cursor.getTime() + 86_400_000);
    guard += 1;
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) count += 1;
  }
  return count;
}

export function OrderForm({
  people,
}: {
  people: Array<{ id: string; name: string; designation: string | null }>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, action, pending] = useActionState(createOrderAction, IDLE);

  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [promisedOn, setPromisedOn] = useState("");
  const [stages, setStages] = useState<StageDraft[]>([newStage()]);

  useEffect(() => {
    if (state.ok === true) {
      toast.success("Order created", state.message);
      const id = (state.data as { id?: string } | undefined)?.id;
      router.push(id ? `/orders/${id}` : "/orders");
    } else if (state.ok === false && state.message) {
      toast.error("Couldn't create the order", state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const totalAllotted = useMemo(
    () => stages.reduce((sum, stage) => sum + (Number(stage.days) || 0), 0),
    [stages],
  );

  const available = useMemo(() => workingDaysUntil(promisedOn), [promisedOn]);
  const overcommitted = promisedOn !== "" && totalAllotted > available;
  const slack = available - totalAllotted;

  const complete =
    stages.length > 0 &&
    stages.every(
      (stage) => stage.name.trim().length > 0 && stage.assigneeId !== "" && Number(stage.days) >= 1,
    );

  function update(key: string, patch: Partial<StageDraft>) {
    setStages((current) =>
      current.map((stage) => (stage.key === key ? { ...stage, ...patch } : stage)),
    );
  }

  const peopleOptions = people.map((person) => ({
    value: person.id,
    label: person.designation ? `${person.name} — ${person.designation}` : person.name,
  }));

  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="priority" value={priority} />

      <Card>
        <CardHeader>
          <CardTitle>What is the order?</CardTitle>
          <CardDescription>
            The customer, what they are getting, and the date they were given.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer or dealer" required error={state.fieldErrors?.customerName}>
              <Input
                name="customerName"
                required
                maxLength={140}
                placeholder="Ludhiana Sewing Centre"
                autoComplete="off"
              />
            </Field>
            <Field
              label="Their reference"
              optional
              hint="Their PO number, for matching paperwork."
              error={state.fieldErrors?.customerRef}
            >
              <Input name="customerRef" maxLength={80} placeholder="PO-2291" autoComplete="off" />
            </Field>
          </div>

          <Field label="Title" required error={state.fieldErrors?.title}>
            <Input
              name="title"
              required
              maxLength={180}
              placeholder="150 domestic straight-stitch machines"
              autoComplete="off"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Product" optional error={state.fieldErrors?.product}>
              <Input name="product" maxLength={140} placeholder="JK-2 domestic" autoComplete="off" />
            </Field>
            <Field label="Quantity" optional error={state.fieldErrors?.quantity}>
              <Input name="quantity" type="number" min={1} placeholder="150" />
            </Field>
            <Field label="Promised delivery" required error={state.fieldErrors?.promisedOn}>
              <Input
                name="promisedOn"
                type="date"
                required
                min={todayKey()}
                value={promisedOn}
                onChange={(event) => setPromisedOn(event.target.value)}
              />
            </Field>
          </div>

          <Field label="Priority" required>
            <div role="radiogroup" aria-label="Priority" className="grid grid-cols-4 gap-1.5">
              {TASK_PRIORITIES.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={priority === option}
                  onClick={() => setPriority(option)}
                  className={cn(
                    "rounded-lg border px-1.5 py-2 text-[11.5px] font-medium transition-colors",
                    priority === option
                      ? option === "CRITICAL"
                        ? "border-danger/40 bg-danger-soft text-danger-text"
                        : option === "HIGH"
                          ? "border-warning/40 bg-warning-soft text-warning-text"
                          : "border-accent/40 bg-accent-soft text-accent"
                      : "border-border text-fg-muted hover:bg-surface-hover",
                  )}
                >
                  {TASK_PRIORITY_LABEL[option]}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Notes" optional error={state.fieldErrors?.description}>
            <Textarea
              name="description"
              rows={2}
              autosize
              maxLength={4000}
              placeholder="Two-tier stacking, heavier boxes. Dealer godown closed Sundays."
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stages, in order</CardTitle>
          <CardDescription>
            Each stage goes to one person with a number of working days. That is what the
            forecast is built from — if somebody overruns, the slip shows up here the same
            day.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          <ol className="space-y-2">
            {stages.map((stage, index) => (
              <li key={stage.key} className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className="mt-2 grid size-6 shrink-0 place-items-center rounded-full bg-surface-muted text-[11px] font-semibold text-fg-muted"
                >
                  {index + 1}
                </span>

                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5.5rem]">
                  <Input
                    name="stageName"
                    value={stage.name}
                    onChange={(event) => update(stage.key, { name: event.target.value })}
                    placeholder={
                      index === 0 ? "Machine shop" : index === 1 ? "Assembly" : "Final testing"
                    }
                    maxLength={140}
                    inputSize="sm"
                    aria-label={`Stage ${index + 1} name`}
                  />
                  <Select
                    name="stageAssignee"
                    value={stage.assigneeId}
                    onChange={(event) => update(stage.key, { assigneeId: event.target.value })}
                    placeholder="Who does it?"
                    selectSize="sm"
                    aria-label={`Stage ${index + 1} owner`}
                    options={peopleOptions}
                  />
                  <Input
                    name="stageDays"
                    type="number"
                    min={1}
                    max={90}
                    value={stage.days}
                    onChange={(event) => update(stage.key, { days: event.target.value })}
                    inputSize="sm"
                    suffix="d"
                    aria-label={`Stage ${index + 1} allotted days`}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setStages((current) => current.filter((s) => s.key !== stage.key))}
                  disabled={stages.length === 1}
                  className="mt-1.5 grid size-7 shrink-0 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-danger-soft hover:text-danger-text disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg-subtle"
                  aria-label={`Remove stage ${index + 1}`}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>

          {state.fieldErrors?.stageName || state.fieldErrors?.stageAssignee ? (
            <p role="alert" className="text-[12.5px] text-danger-text">
              {state.fieldErrors.stageName ?? state.fieldErrors.stageAssignee}
            </p>
          ) : null}

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setStages((current) => [...current, newStage()])}
            disabled={stages.length >= 20}
          >
            <Plus className="size-3.5" />
            Add a stage
          </Button>

          {/* The live feasibility check — the reason this form is worth having. */}
          {promisedOn ? (
            <div
              className={cn(
                "flex items-start gap-2.5 rounded-lg border px-3 py-2.5",
                overcommitted
                  ? "border-danger/30 bg-danger-soft/50"
                  : slack <= 1
                    ? "border-warning/30 bg-warning-soft/50"
                    : "border-success/25 bg-success-soft/40",
              )}
            >
              {overcommitted ? (
                <TriangleAlert className="mt-px size-4 shrink-0 text-danger" aria-hidden="true" />
              ) : (
                <GripVertical className="mt-px size-4 shrink-0 text-success" aria-hidden="true" />
              )}
              <div className="text-[12.5px] leading-[18px]">
                <p
                  className={cn(
                    "font-medium",
                    overcommitted
                      ? "text-danger-text"
                      : slack <= 1
                        ? "text-warning-text"
                        : "text-success-text",
                  )}
                >
                  {overcommitted
                    ? `This plan does not fit. ${totalAllotted} allotted days against ${available} working days available.`
                    : slack === 0
                      ? `Exactly ${available} working days available, and ${totalAllotted} allotted. No slack at all.`
                      : `${totalAllotted} allotted days against ${available} available — ${slack} day${
                          slack === 1 ? "" : "s"
                        } of slack.`}
                </p>
                <p className="mt-0.5 text-fg-muted">
                  {overcommitted
                    ? "It will be created already forecast late. Move the date, cut a stage, or reduce the allotments."
                    : slack <= 1
                      ? "One overrun anywhere and this order is late."
                      : "Weekends excluded. Holidays are applied by the server."}
                </p>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {state.ok === false && state.message && !state.fieldErrors ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2.5"
        >
          <AlertCircle className="mt-px size-4 shrink-0 text-danger" aria-hidden="true" />
          <p className="text-[12.5px] leading-[18px] text-danger-text">{state.message}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-fg-subtle">
          {stages.length} stage{stages.length === 1 ? "" : "s"} · everyone assigned is notified
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.back()}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={pending} disabled={!complete}>
            <Save className="size-4" />
            Create order
          </Button>
        </div>
      </div>
    </form>
  );
}
