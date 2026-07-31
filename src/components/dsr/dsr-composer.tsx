"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Bold,
  CheckCircle2,
  CloudOff,
  Eye,
  Italic,
  List,
  ListOrdered,
  Minus,
  Plus,
  Save,
  Send,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Badge, Kbd } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { MarkdownView } from "@/components/markdown-view";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { saveDsrAction } from "@/server/actions/dsr";
import { IDLE } from "@/server/actions/form-state";
import { countBullets } from "@/lib/utils/markdown";
import { DSR_STATUS_LABEL, DSR_STATUS_TONE, type DsrStatus } from "@/lib/constants/enums";
import { formatHours } from "@/lib/utils/format";

/**
 * DSR composer.
 *
 * Three deliberate decisions:
 *
 *  1. **Markdown, with training wheels.** A toolbar inserts the syntax so nobody
 *     has to know it, but the stored value stays plain text — diffable, greppable,
 *     exportable, and safe to render (see `markdown-view.tsx`).
 *  2. **Offline drafts.** Every keystroke is mirrored to localStorage keyed by
 *     date. A closed laptop, a dead connection or a stray refresh doesn't lose
 *     the writing. The draft is cleared only once the server confirms the save.
 *  3. **Draft and submit are separate verbs.** Saving keeps it private; submitting
 *     puts it in the review queue. Anything else would make people afraid of the
 *     save button.
 */

interface DsrComposerProps {
  date: string;
  dateLabel: string;
  existing: {
    id: string;
    status: DsrStatus;
    tasksCompleted: string;
    blockers: string | null;
    nextSteps: string | null;
    notes: string | null;
    hoursWorked: number;
    reviewComment: string | null;
    reviewedByName: string | null;
  } | null;
  /** Yesterday's next-steps, offered as a starting point. */
  previousNextSteps?: string | null;
  /** Non-working day warning. */
  isNonWorkingDay?: boolean;
}

interface DraftShape {
  tasksCompleted: string;
  blockers: string;
  nextSteps: string;
  notes: string;
  hoursWorked: string;
}

const HOUR_PRESETS = [4, 6, 7.5, 8, 9] as const;

export function DsrComposer({
  date,
  dateLabel,
  existing,
  previousNextSteps,
  isNonWorkingDay = false,
}: DsrComposerProps) {
  const router = useRouter();
  const toast = useToast();
  const [state, action, pending] = useActionState(saveDsrAction, IDLE);

  const initial: DraftShape = {
    tasksCompleted: existing?.tasksCompleted ?? "",
    blockers: existing?.blockers ?? "",
    nextSteps: existing?.nextSteps ?? "",
    notes: existing?.notes ?? "",
    hoursWorked: String(existing?.hoursWorked ?? 8),
  };

  // Keyed by date so each day keeps its own recoverable draft.
  const draft = usePersistentState<DraftShape>(`cadence:dsr-draft:${date}`, initial);
  const [form, setForm] = useState<DraftShape>(initial);
  const [preview, setPreview] = useState(false);
  const [restored, setRestored] = useState(false);
  const [intent, setIntent] = useState<"DRAFT" | "SUBMITTED">("SUBMITTED");

  const tasksRef = useRef<HTMLTextAreaElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  // Offer a recovered draft rather than silently overwriting what's on screen —
  // clobbering a submitted report with stale local text would be worse than the
  // problem it solves.
  useEffect(() => {
    if (!draft.hydrated || restored) return;
    const stored = draft.value;
    const hasStored = stored.tasksCompleted.trim().length > 0;
    const differs = stored.tasksCompleted.trim() !== initial.tasksCompleted.trim();

    if (hasStored && differs && !existing) {
      setForm(stored);
      setRestored(true);
      toast.info("Draft restored", "We recovered what you had written on this device.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.hydrated]);

  // Mirror to localStorage as the user types.
  useEffect(() => {
    if (!draft.hydrated) return;
    draft.setValue(form);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, draft.hydrated]);

  useEffect(() => {
    if (state.ok === true) {
      draft.reset();
      toast.success(state.message ?? "Saved");
      if (state.data?.status === "SUBMITTED") router.push("/dsr");
      else router.refresh();
    } else if (state.ok === false && state.message) {
      toast.error("Couldn't save your report", state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const update = <K extends keyof DraftShape>(key: K, value: DraftShape[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  /**
   * Wraps or prefixes the current selection in the tasks field.
   * Restores the caret afterwards so typing continues where it was.
   */
  const applyFormat = useCallback((kind: "bullet" | "numbered" | "bold" | "italic") => {
    const element = tasksRef.current;
    if (!element) return;

    const { selectionStart, selectionEnd, value } = element;
    const selected = value.slice(selectionStart, selectionEnd);

    let replacement: string;
    let caretOffset = 0;

    if (kind === "bold" || kind === "italic") {
      const marker = kind === "bold" ? "**" : "*";
      replacement = `${marker}${selected || (kind === "bold" ? "bold text" : "italic text")}${marker}`;
      caretOffset = marker.length;
    } else {
      // Line-level formats apply to every line in the selection.
      const lines = (selected || "").split("\n");
      replacement = lines
        .map((line, index) => {
          const clean = line.replace(/^(\s*)([-*+]|\d+[.)])\s+/, "$1");
          return kind === "bullet" ? `- ${clean}` : `${index + 1}. ${clean}`;
        })
        .join("\n");
    }

    const next = value.slice(0, selectionStart) + replacement + value.slice(selectionEnd);
    update("tasksCompleted", next);

    requestAnimationFrame(() => {
      element.focus();
      const position = selected
        ? selectionStart + replacement.length
        : selectionStart + caretOffset + (kind === "bullet" || kind === "numbered" ? 2 : 0);
      element.setSelectionRange(position, selected ? position : position + (selected ? 0 : 9));
    });
  }, []);

  /**
   * Enter inside a list continues the list; Enter on an empty bullet ends it.
   * ⌘/Ctrl+Enter submits.
   */
  const onTasksKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      setIntent("SUBMITTED");
      formRef.current?.requestSubmit();
      return;
    }

    if (event.key !== "Enter" || event.shiftKey) return;

    const element = event.currentTarget;
    const before = element.value.slice(0, element.selectionStart);
    const currentLine = before.slice(before.lastIndexOf("\n") + 1);

    const bullet = /^(\s*)([-*+])\s+(.*)$/.exec(currentLine);
    const numbered = /^(\s*)(\d+)([.)])\s+(.*)$/.exec(currentLine);

    if (bullet && bullet[3]!.trim() === "") {
      // Empty bullet: remove it and drop out of the list.
      event.preventDefault();
      const start = element.selectionStart - currentLine.length;
      update(
        "tasksCompleted",
        element.value.slice(0, start) + element.value.slice(element.selectionStart),
      );
      return;
    }

    if (bullet) {
      event.preventDefault();
      insertAtCaret(element, `\n${bullet[1]}${bullet[2]} `);
    } else if (numbered) {
      event.preventDefault();
      insertAtCaret(element, `\n${numbered[1]}${Number(numbered[2]) + 1}${numbered[3]} `);
    }
  };

  const insertAtCaret = (element: HTMLTextAreaElement, text: string) => {
    const { selectionStart, value } = element;
    const next = value.slice(0, selectionStart) + text + value.slice(element.selectionEnd);
    update("tasksCompleted", next);
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(selectionStart + text.length, selectionStart + text.length);
    });
  };

  const hours = Number(form.hoursWorked) || 0;
  const taskCount = countBullets(form.tasksCompleted);
  const isLocked = existing?.status === "REVIEWED";

  return (
    <form ref={formRef} action={action} className="space-y-5" noValidate>
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="status" value={intent} />

      {/* Review feedback, if this report was sent back. */}
      {existing?.status === "FLAGGED" && existing.reviewComment ? (
        <Card className="border-warning/30 bg-warning-soft/40">
          <CardContent className="flex gap-3 pt-4">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-fg">
                {existing.reviewedByName ?? "Your reviewer"} asked for a change
              </p>
              <p className="mt-1 text-[12.5px] leading-5 text-fg-muted">{existing.reviewComment}</p>
              <p className="mt-1.5 text-[11.5px] text-fg-subtle">
                Editing and resubmitting puts it back in the review queue.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {isLocked ? (
        <Card className="border-info/30 bg-info-soft/40">
          <CardContent className="flex items-center gap-3 pt-4">
            <CheckCircle2 className="size-4 shrink-0 text-info" aria-hidden="true" />
            <p className="text-[12.5px] text-fg-muted">
              This report has been reviewed
              {existing?.reviewedByName ? ` by ${existing.reviewedByName}` : ""} and is now
              read-only. Ask an admin if it needs a correction.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {isNonWorkingDay ? (
        <Card className="border-border bg-surface-inset">
          <CardContent className="flex items-center gap-3 pt-4">
            <CloudOff className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
            <p className="text-[12.5px] text-fg-muted">
              {dateLabel} isn&apos;t a working day. You can still file a report — it just
              won&apos;t count against your completion rate.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          actions={
            <>
              {taskCount > 0 ? (
                <Badge tone="neutral" size="sm">
                  {taskCount} {taskCount === 1 ? "item" : "items"}
                </Badge>
              ) : null}
              {existing ? (
                <Badge tone={DSR_STATUS_TONE[existing.status]} size="sm" dot>
                  {DSR_STATUS_LABEL[existing.status]}
                </Badge>
              ) : null}
              <Tooltip content={preview ? "Back to editing" : "Preview formatting"}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setPreview((value) => !value)}
                  aria-pressed={preview}
                  aria-label={preview ? "Back to editing" : "Preview formatting"}
                >
                  <Eye className="size-4" />
                </Button>
              </Tooltip>
            </>
          }
        >
          <CardTitle>What did you get done?</CardTitle>
          <CardDescription>
            One line per task. Specific beats comprehensive — your future self and your manager both
            read this.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <Field error={state.fieldErrors?.tasksCompleted}>
            {preview ? (
              <div className="min-h-[9.5rem] rounded-lg border border-border bg-surface-inset p-3.5">
                {form.tasksCompleted.trim() ? (
                  <MarkdownView source={form.tasksCompleted} />
                ) : (
                  <p className="text-[13px] text-fg-subtle italic">Nothing to preview yet.</p>
                )}
              </div>
            ) : (
              <>
                <div
                  role="toolbar"
                  aria-label="Formatting"
                  className="mb-1.5 flex items-center gap-0.5"
                >
                  {[
                    { icon: List, label: "Bulleted list", kind: "bullet" as const },
                    { icon: ListOrdered, label: "Numbered list", kind: "numbered" as const },
                    { icon: Bold, label: "Bold", kind: "bold" as const },
                    { icon: Italic, label: "Italic", kind: "italic" as const },
                  ].map((tool) => (
                    <Tooltip key={tool.kind} content={tool.label}>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => applyFormat(tool.kind)}
                        aria-label={tool.label}
                        disabled={isLocked}
                      >
                        <tool.icon className="size-3.5" />
                      </Button>
                    </Tooltip>
                  ))}

                  <span className="ml-auto flex items-center gap-1 text-[11px] text-fg-subtle">
                    Markdown supported ·
                    <Kbd>⌘</Kbd>
                    <Kbd>↵</Kbd>
                    to submit
                  </span>
                </div>

                <Textarea
                  ref={tasksRef}
                  name="tasksCompleted"
                  value={form.tasksCompleted}
                  onChange={(event) => update("tasksCompleted", event.target.value)}
                  onKeyDown={onTasksKeyDown}
                  placeholder={"- Shipped the invoice export endpoint\n- Paired with Priya on the auth refactor\n- Reviewed 3 PRs"}
                  rows={7}
                  autosize
                  maxRows={22}
                  required
                  disabled={isLocked}
                  className="font-normal"
                />
              </>
            )}
          </Field>

          {previousNextSteps && !form.tasksCompleted.trim() ? (
            <button
              type="button"
              onClick={() => update("tasksCompleted", previousNextSteps)}
              className="flex w-full items-start gap-2.5 rounded-lg border border-dashed border-border bg-surface-inset p-3 text-left transition-colors hover:border-accent/40 hover:bg-accent-soft/30"
            >
              <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-[12.5px] font-medium text-fg">
                  Start from yesterday&apos;s plan
                </span>
                <span className="mt-0.5 block line-clamp-2 text-[11.5px] text-fg-subtle">
                  {previousNextSteps}
                </span>
              </span>
            </button>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Anything blocking you?</CardTitle>
            <CardDescription>
              The fastest way to get help. Leave it empty if you&apos;re clear.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Field error={state.fieldErrors?.blockers}>
              <Textarea
                name="blockers"
                value={form.blockers}
                onChange={(event) => update("blockers", event.target.value)}
                placeholder="Waiting on staging credentials from IT"
                rows={4}
                autosize
                disabled={isLocked}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What&apos;s next?</CardTitle>
            <CardDescription>
              Tomorrow&apos;s plan. This is offered back to you when you write your next report.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Field error={state.fieldErrors?.nextSteps}>
              <Textarea
                name="nextSteps"
                value={form.nextSteps}
                onChange={(event) => update("nextSteps", event.target.value)}
                placeholder="- Finish the CSV importer\n- Write tests for the webhook handler"
                rows={4}
                autosize
                disabled={isLocked}
              />
            </Field>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hours &amp; notes</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-[210px_minmax(0,1fr)]">
          <Field label="Hours worked" error={state.fieldErrors?.hoursWorked} required>
            <div className="flex items-center gap-1.5">
              <Button
                variant="secondary"
                size="icon-sm"
                onClick={() => update("hoursWorked", String(Math.max(0, hours - 0.5)))}
                aria-label="Decrease by half an hour"
                disabled={isLocked}
              >
                <Minus className="size-3.5" />
              </Button>
              <Input
                name="hoursWorked"
                type="number"
                inputMode="decimal"
                step="0.25"
                min="0"
                max="24"
                value={form.hoursWorked}
                onChange={(event) => update("hoursWorked", event.target.value)}
                className="text-center"
                suffix="h"
                required
                disabled={isLocked}
              />
              <Button
                variant="secondary"
                size="icon-sm"
                onClick={() => update("hoursWorked", String(Math.min(24, hours + 0.5)))}
                aria-label="Increase by half an hour"
                disabled={isLocked}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>

            <div className="mt-2 flex flex-wrap gap-1">
              {HOUR_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => update("hoursWorked", String(preset))}
                  disabled={isLocked}
                  className={cn(
                    "rounded-md border px-2 py-0.5 text-[11.5px] font-medium tabular-nums transition-colors",
                    hours === preset
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-border text-fg-muted hover:border-border-strong hover:text-fg",
                  )}
                >
                  {formatHours(preset)}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Additional notes" optional error={state.fieldErrors?.notes}>
            <Textarea
              name="notes"
              value={form.notes}
              onChange={(event) => update("notes", event.target.value)}
              placeholder="Context your manager should know — a risk, a win, a decision that needs input."
              rows={3}
              autosize
              disabled={isLocked}
            />
          </Field>
        </CardContent>
      </Card>

      {/* Sticky action bar: on a long form the buttons must stay reachable. */}
      {!isLocked ? (
        <div className="sticky bottom-20 z-10 lg:bottom-4">
          <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 shadow-lg">
            <p className="min-w-0 pl-1 text-[12px] text-fg-muted">
              {draft.hydrated && form.tasksCompleted.trim() ? (
                <span className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                  Saved on this device
                </span>
              ) : (
                <span className="text-fg-subtle">Drafts are kept locally as you type</span>
              )}
            </p>

            <div className="flex flex-1 items-center justify-end gap-2 sm:flex-initial">
              <Button
                type="submit"
                variant="secondary"
                loading={pending && intent === "DRAFT"}
                disabled={pending}
                onClick={() => setIntent("DRAFT")}
              >
                <Save className="size-4" />
                Save draft
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={pending && intent === "SUBMITTED"}
                disabled={pending}
                onClick={() => setIntent("SUBMITTED")}
              >
                <Send className="size-4" />
                {existing?.status === "SUBMITTED" ? "Update report" : "Submit report"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
