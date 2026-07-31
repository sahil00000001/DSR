"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Megaphone, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/toast";
import { MarkdownView } from "@/components/markdown-view";
import { createAnnouncementAction } from "@/server/actions/announcements";
import { IDLE } from "@/server/actions/form-state";

/**
 * Announcement composer.
 *
 * Markdown with a live preview, because an announcement is the one place in this
 * product where formatting genuinely helps — a list of dates, a bolded deadline.
 * The audience selector is constrained for managers: they can only address their
 * own department, and the server enforces the same rule.
 */
export function AnnouncementComposer({
  departments,
  restrictToDepartmentId,
}: {
  departments: Array<{ id: string; name: string }>;
  restrictToDepartmentId: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createAnnouncementAction, IDLE);

  const [audience, setAudience] = useState<"ALL" | "DEPARTMENT">(
    restrictToDepartmentId ? "DEPARTMENT" : "ALL",
  );
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (state.ok === true) {
      toast.success("Announcement posted", state.message);
      setOpen(false);
      setBody("");
      router.refresh();
    } else if (state.ok === false && state.message && !state.fieldErrors) {
      toast.error("Couldn't post the announcement", state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        <Megaphone className="size-4" />
        New announcement
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="xl"
        dismissible={!pending}
        title="New announcement"
        description="Everyone in the audience gets a notification, and an email unless they've opted out."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form="announcement-form" variant="primary" loading={pending}>
              <Send className="size-4" />
              Post announcement
            </Button>
          </>
        }
      >
        <form id="announcement-form" action={action} className="space-y-4" noValidate>
          <input type="hidden" name="audience" value={audience} />

          <Field label="Title" required error={state.fieldErrors?.title}>
            <Input
              name="title"
              required
              autoFocus
              placeholder="Office closed on Friday for maintenance"
            />
          </Field>

          <Field
            label="Message"
            required
            error={state.fieldErrors?.body}
            hint="Markdown supported — lists, bold, links."
          >
            <div className="mb-1.5 flex justify-end">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setPreview((value) => !value)}
                aria-pressed={preview}
              >
                <Eye className="size-3.5" />
                {preview ? "Edit" : "Preview"}
              </Button>
            </div>

            {preview ? (
              <div className="min-h-[8rem] rounded-lg border border-border bg-surface-inset p-3.5">
                {body.trim() ? (
                  <MarkdownView source={body} />
                ) : (
                  <p className="text-[13px] text-fg-subtle italic">Nothing to preview yet.</p>
                )}
              </div>
            ) : (
              <Textarea
                name="body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={7}
                autosize
                required
                placeholder={
                  "The building's power is being serviced on Friday.\n\n- Work from home if you can\n- The office reopens Monday at 9am"
                }
              />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Audience" error={state.fieldErrors?.audience}>
              <Select
                value={audience}
                onChange={(event) => setAudience(event.target.value as "ALL" | "DEPARTMENT")}
                disabled={Boolean(restrictToDepartmentId)}
                options={[
                  { value: "ALL", label: "Everyone" },
                  { value: "DEPARTMENT", label: "A single department" },
                ]}
              />
            </Field>

            {audience === "DEPARTMENT" ? (
              <Field label="Department" required error={state.fieldErrors?.departmentId}>
                <Select
                  name="departmentId"
                  required
                  defaultValue={restrictToDepartmentId ?? ""}
                  disabled={Boolean(restrictToDepartmentId)}
                  placeholder="Choose a department"
                  options={departments.map((department) => ({
                    value: department.id,
                    label: department.name,
                  }))}
                />
              </Field>
            ) : null}
          </div>

          <Checkbox
            name="pinned"
            value="true"
            label="Pin to the top"
            description="Pinned announcements stay above the rest until unpinned."
          />
        </form>
      </Dialog>
    </>
  );
}
