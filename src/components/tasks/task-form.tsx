"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CalendarClock,
  Check,
  Clock3,
  Flag,
  FolderOpen,
  Link2,
  Repeat,
  Save,
  Tag,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { AttachmentPicker } from "@/components/tasks/attachment-picker";
import { createTaskAction, editTaskAction } from "@/server/actions/tasks";
import { IDLE } from "@/server/actions/form-state";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_RECURRENCES,
  TASK_RECURRENCE_LABEL,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  type TaskPriority,
  type TaskRecurrence,
  type TaskStatus,
} from "@/lib/constants/enums";
import { todayKey } from "@/lib/utils/date";

/**
 * Create and edit a task.
 *
 * One component for both, because the fields are identical and the alternative is two
 * forms that drift. `existing` decides which action runs and what the button says.
 *
 * Everything that can be typed rather than clicked is typeable: dates, times and hours
 * are plain inputs, which on a phone opens the platform's own picker and on a desktop
 * lets somebody who knows the value just enter it.
 */

export interface TaskFormPerson {
  id: string;
  name: string;
  avatarUrl: string | null;
  designation: string | null;
  department: string | null;
}

export interface TaskFormDefaults {
  id: string;
  taskNumber: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  categoryId: string | null;
  dueOn: string | null;
  deadlineTime: string | null;
  estimateHours: string | null;
  blockedReason: string | null;
  recurrence: TaskRecurrence;
  recurrenceEvery: number;
  recurrenceUntil: string | null;
  assigneeIds: string[];
  tagIds: string[];
}

export function TaskForm({
  people,
  categories,
  tags,
  dependencyCandidates,
  storageReady,
  existing,
}: {
  people: TaskFormPerson[];
  categories: Array<{ id: string; name: string; color: string }>;
  tags: Array<{ id: string; name: string; color: string }>;
  dependencyCandidates: Array<{ id: string; taskNumber: string; title: string }>;
  storageReady: boolean;
  existing?: TaskFormDefaults;
}) {
  const router = useRouter();
  const toast = useToast();
  const editing = existing !== undefined;

  const [state, action, pending] = useActionState(
    editing ? editTaskAction : createTaskAction,
    IDLE,
  );

  const [description, setDescription] = useState(existing?.description ?? "");
  const [priority, setPriority] = useState<TaskPriority>(existing?.priority ?? "MEDIUM");
  const [status, setStatus] = useState<TaskStatus>(existing?.status ?? "TODO");
  const [assignees, setAssignees] = useState<string[]>(existing?.assigneeIds ?? []);
  const [selectedTags, setSelectedTags] = useState<string[]>(existing?.tagIds ?? []);
  const [dependsOn, setDependsOn] = useState<string[]>([]);
  const [recurrence, setRecurrence] = useState<TaskRecurrence>(existing?.recurrence ?? "NONE");
  const [dueOn, setDueOn] = useState(existing?.dueOn ?? "");
  const [blockedReason, setBlockedReason] = useState(existing?.blockedReason ?? "");
  const [peopleQuery, setPeopleQuery] = useState("");

  useEffect(() => {
    if (state.ok === true) {
      toast.success(editing ? "Task updated" : "Task created", state.message);
      const id = (state.data as { id?: string } | undefined)?.id ?? existing?.id;
      router.push(id ? `/tasks/${id}` : "/tasks");
    } else if (state.ok === false && state.message) {
      toast.error(editing ? "Couldn't save the task" : "Couldn't create the task", state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const visiblePeople = useMemo(() => {
    const query = peopleQuery.trim().toLowerCase();
    if (!query) return people;
    return people.filter(
      (person) =>
        person.name.toLowerCase().includes(query) ||
        (person.designation ?? "").toLowerCase().includes(query) ||
        (person.department ?? "").toLowerCase().includes(query),
    );
  }, [people, peopleQuery]);

  const needsReason = status === "BLOCKED";
  const recurring = recurrence !== "NONE";
  const canSubmit =
    assignees.length > 0 &&
    description.trim().length >= 10 &&
    (!needsReason || blockedReason.trim().length > 0) &&
    (!recurring || dueOn !== "");

  function toggle(list: string[], id: string, set: (next: string[]) => void) {
    set(list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id]);
  }

  return (
    <form action={action} className="space-y-5" noValidate>
      {editing ? <input type="hidden" name="taskId" value={existing.id} /> : null}
      <input type="hidden" name="priority" value={priority} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="assigneeIds" value={assignees.join(",")} />
      <input type="hidden" name="tagIds" value={selectedTags.join(",")} />
      <input type="hidden" name="dependsOnIds" value={dependsOn.join(",")} />
      <input type="hidden" name="recurrence" value={recurrence} />

      <Card>
        <CardHeader>
          <CardTitle>What needs doing?</CardTitle>
          <CardDescription>
            Write it for someone who wasn&apos;t in the room when it was decided.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <Field label="Title" required error={state.fieldErrors?.title}>
            <Input
              name="title"
              defaultValue={existing?.title}
              required
              maxLength={180}
              placeholder="Re-cut the feed-dog cam for the JK-2 changeover"
              autoComplete="off"
            />
          </Field>

          <Field label="Description" required error={state.fieldErrors?.description}>
            <MarkdownEditor
              name="description"
              value={description}
              onChange={setDescription}
              rows={7}
              maxLength={20_000}
              placeholder={
                "What has to happen, and how you'll know it's done.\n\n- Grind to 0.02 mm\n- First-off approval from QA before the batch runs"
              }
              ariaLabel="Task description"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-3.5 text-fg-subtle" aria-hidden="true" />
            Who is doing it?
          </CardTitle>
          <CardDescription>
            Pick one person, or several if it genuinely takes several. Everyone chosen gets
            an email with the full description.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {people.length > 8 ? (
            <Input
              value={peopleQuery}
              onChange={(event) => setPeopleQuery(event.target.value)}
              placeholder="Filter people…"
              inputSize="sm"
              aria-label="Filter the assignee list"
            />
          ) : null}

          <div
            role="group"
            aria-label="Assignees"
            className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3"
          >
            {visiblePeople.map((person) => {
              const active = assignees.includes(person.id);
              return (
                <button
                  key={person.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggle(assignees, person.id, setAssignees)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors",
                    active
                      ? "border-accent/40 bg-accent-soft"
                      : "border-border hover:bg-surface-hover",
                  )}
                >
                  <Avatar
                    name={person.name}
                    seed={person.id}
                    src={person.avatarUrl}
                    size="sm"
                    className="shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium text-fg">
                      {person.name}
                    </span>
                    <span className="block truncate text-[10.5px] text-fg-subtle">
                      {person.designation ?? person.department ?? "—"}
                    </span>
                  </span>
                  {active ? (
                    <Check className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
          </div>

          {visiblePeople.length === 0 ? (
            <p className="text-[12.5px] text-fg-subtle">Nobody matches that.</p>
          ) : null}

          {assignees.length === 0 ? (
            <p className="flex items-start gap-2 text-[12.5px] text-warning-text">
              <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              A task needs at least one person, or it is just a note.
            </p>
          ) : (
            <p className="text-[12px] text-fg-subtle">
              {assignees.length} {assignees.length === 1 ? "person" : "people"} assigned.
            </p>
          )}
          {state.fieldErrors?.assigneeIds ? (
            <p role="alert" className="text-[12.5px] text-danger-text">
              {state.fieldErrors.assigneeIds}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Priority, status and dates</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
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

            <Field label="Starting status" hint="Usually “To do”.">
              <Select
                value={status}
                onChange={(event) => setStatus(event.target.value as TaskStatus)}
                aria-label="Starting status"
                options={TASK_STATUSES.map((option) => ({
                  value: option,
                  label: TASK_STATUS_LABEL[option],
                }))}
              />
            </Field>
          </div>

          {needsReason ? (
            <Field
              label="What is blocking it?"
              required
              error={state.fieldErrors?.blockedReason}
              hint="Shown on the task, so whoever can clear it knows what to clear."
            >
              <Input
                name="blockedReason"
                value={blockedReason}
                onChange={(event) => setBlockedReason(event.target.value)}
                maxLength={500}
                placeholder="Waiting on the replacement bearing lot from stores."
              />
            </Field>
          ) : (
            <input type="hidden" name="blockedReason" value="" />
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Due date" optional error={state.fieldErrors?.dueOn}>
              <Input
                name="dueOn"
                type="date"
                value={dueOn}
                min={editing ? undefined : todayKey()}
                onChange={(event) => setDueOn(event.target.value)}
              />
            </Field>

            <Field
              label="Time"
              optional
              hint="If the hour matters."
              error={state.fieldErrors?.deadlineTime}
            >
              <Input
                name="deadlineTime"
                type="time"
                defaultValue={existing?.deadlineTime ?? ""}
                disabled={dueOn === ""}
                icon={<CalendarClock />}
              />
            </Field>

            <Field label="Estimate" optional error={state.fieldErrors?.estimateHours}>
              <Input
                name="estimateHours"
                defaultValue={existing?.estimateHours ?? ""}
                inputMode="decimal"
                placeholder="2.5"
                suffix="hrs"
                icon={<Clock3 />}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="size-3.5 text-fg-subtle" aria-hidden="true" />
            Project and tags
          </CardTitle>
          <CardDescription>Used for filtering and the spend-of-effort breakdown.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <Field label="Project" optional>
            <Select
              name="categoryId"
              defaultValue={existing?.categoryId ?? ""}
              placeholder="No project"
              aria-label="Project"
              options={categories.map((category) => ({
                value: category.id,
                label: category.name,
              }))}
            />
          </Field>

          {tags.length > 0 ? (
            <Field label="Tags" optional>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => {
                  const active = selectedTags.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggle(selectedTags, tag.id, setSelectedTags)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px] font-medium transition-colors",
                        active
                          ? "border-accent/40 bg-accent-soft text-accent"
                          : "border-border text-fg-muted hover:bg-surface-hover",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className="size-1.5 rounded-full"
                        style={{ backgroundColor: `var(--cat-${tag.color})` }}
                      />
                      {tag.name}
                      {active ? <X className="size-2.5" aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
            </Field>
          ) : null}
        </CardContent>
      </Card>

      {!editing && dependencyCandidates.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="size-3.5 text-fg-subtle" aria-hidden="true" />
              Waits on
            </CardTitle>
            <CardDescription>
              This task can&apos;t be completed until everything picked here is done.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {dependencyCandidates.slice(0, 40).map((candidate) => {
                const active = dependsOn.includes(candidate.id);
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggle(dependsOn, candidate.id, setDependsOn)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors",
                      active ? "border-accent/40 bg-accent-soft" : "border-border hover:bg-surface-hover",
                    )}
                  >
                    <span className="font-mono text-[10.5px] tabular-nums text-fg-subtle">
                      {candidate.taskNumber}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-fg-muted">
                      {candidate.title}
                    </span>
                    {active ? (
                      <Check className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Repeat className="size-3.5 text-fg-subtle" aria-hidden="true" />
            Repeat
          </CardTitle>
          <CardDescription>
            A repeating task is a template — each period gets its own copy with a fresh
            timeline, so last week&apos;s notes stay on last week&apos;s job.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="How often">
              <Select
                value={recurrence}
                onChange={(event) => setRecurrence(event.target.value as TaskRecurrence)}
                aria-label="Repeat frequency"
                options={TASK_RECURRENCES.map((option) => ({
                  value: option,
                  label: TASK_RECURRENCE_LABEL[option],
                }))}
              />
            </Field>

            {recurring ? (
              <>
                <Field label="Every" hint="Every 2 weeks, every 3 months…">
                  <Input
                    name="recurrenceEvery"
                    type="number"
                    min={1}
                    max={52}
                    defaultValue={existing?.recurrenceEvery ?? 1}
                  />
                </Field>
                <Field label="Until" optional>
                  <Input
                    name="recurrenceUntil"
                    type="date"
                    defaultValue={existing?.recurrenceUntil ?? ""}
                    min={dueOn || todayKey()}
                  />
                </Field>
              </>
            ) : (
              <>
                <input type="hidden" name="recurrenceEvery" value={1} />
                <input type="hidden" name="recurrenceUntil" value="" />
              </>
            )}
          </div>

          {recurring && dueOn === "" ? (
            <p className="flex items-start gap-2 text-[12.5px] text-warning-text">
              <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              Pick a due date above — a repeating task needs a first occurrence to count from.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {!editing ? (
        <Card>
          <CardHeader>
            <CardTitle>Supporting files</CardTitle>
            <CardDescription>
              Drawings, spreadsheets, photos, a voice note explaining it — anything the person
              doing this would want. Named in the assignment email; downloadable from the task.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AttachmentPicker storageReady={storageReady} pendingUpload={pending} />
          </CardContent>
        </Card>
      ) : null}

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
        <p className="flex items-center gap-1.5 text-[12px] text-fg-subtle">
          <Flag className="size-3.5" aria-hidden="true" />
          {editing ? (
            <>Editing {existing.taskNumber}</>
          ) : (
            <>
              {assignees.length > 0
                ? `${assignees.length} ${assignees.length === 1 ? "person is" : "people are"} emailed on save`
                : "Nobody is assigned yet"}
            </>
          )}
          {selectedTags.length > 0 ? (
            <Badge tone="neutral" variant="outline" size="sm">
              <Tag className="size-2.5" aria-hidden="true" />
              {selectedTags.length}
            </Badge>
          ) : null}
        </p>

        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => router.back()} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={pending} disabled={!canSubmit}>
            <Save className="size-4" />
            {editing ? "Save changes" : "Create and assign"}
          </Button>
        </div>
      </div>
    </form>
  );
}
