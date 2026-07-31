"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CornerDownRight,
  FileText,
  ListPlus,
  Paperclip,
  Percent,
  Reply,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { MarkdownView } from "@/components/markdown-view";
import { MarkdownEditor, type MentionablePerson } from "@/components/ui/markdown-editor";
import { AttachmentPicker } from "@/components/tasks/attachment-picker";
import { TagRow } from "@/components/tasks/task-bits";
import { postTaskUpdateAction } from "@/server/actions/tasks";
import { IDLE } from "@/server/actions/form-state";
import { formatBytes } from "@/lib/utils/format";
import { formatRelative } from "@/lib/utils/date";
import type { TaskUpdateDto } from "@/lib/services/tasks";

/**
 * The threaded conversation on a task.
 *
 * Updates are additive and shown in full — the brief is explicit that a new update
 * must not replace the previous one, and that is the difference between a task with
 * history and a task with a status field. Replies nest one level; deeper than that
 * reads worse than it helps at this team size.
 *
 * The composer is collapsed until used. An open form with a file picker and a
 * checklist field is a lot of furniture to leave standing on a page whose main job is
 * reading what happened.
 */
export function TaskThread({
  taskId,
  updates,
  viewer,
  people,
  canPost,
  storageReady,
}: {
  taskId: string;
  updates: TaskUpdateDto[];
  viewer: { id: string; name: string; avatarUrl: string | null; role: string };
  people: MentionablePerson[];
  canPost: boolean;
  storageReady: boolean;
}) {
  const [replyTo, setReplyTo] = useState<TaskUpdateDto | null>(null);
  const [open, setOpen] = useState(false);
  const composer = useRef<HTMLDivElement | null>(null);

  function startReply(update: TaskUpdateDto) {
    setReplyTo(update);
    setOpen(true);
    requestAnimationFrame(() =>
      composer.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  }

  return (
    <div className="space-y-4">
      {updates.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[12.5px] text-fg-muted">
          No updates yet. Post progress here and everyone on the task sees it.
        </p>
      ) : (
        <ol className="space-y-4">
          {updates.map((update) => (
            <li key={update.id}>
              <UpdateBubble
                update={update}
                viewerId={viewer.id}
                onReply={canPost ? startReply : undefined}
              />

              {update.replies.length > 0 ? (
                <ol className="mt-3 space-y-3 border-l-2 border-border pl-4 sm:ml-5">
                  {update.replies.map((reply) => (
                    <li key={reply.id}>
                      <UpdateBubble update={reply} viewerId={viewer.id} nested />
                    </li>
                  ))}
                </ol>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      {canPost ? (
        <div ref={composer}>
          {open ? (
            <UpdateComposer
              taskId={taskId}
              viewer={viewer}
              people={people}
              storageReady={storageReady}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
              onDone={() => {
                setReplyTo(null);
                setOpen(false);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5 text-left text-[13px] text-fg-subtle transition-colors hover:border-border-strong hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
              <Avatar
                name={viewer.name}
                seed={viewer.id}
                src={viewer.avatarUrl}
                size="sm"
                className="shrink-0"
              />
              Post an update, attach a file, or record a voice note…
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function UpdateBubble({
  update,
  viewerId,
  nested = false,
  onReply,
}: {
  update: TaskUpdateDto;
  viewerId: string;
  nested?: boolean;
  onReply?: (update: TaskUpdateDto) => void;
}) {
  const isViewer = update.author.id === viewerId;
  const isReviewer = update.author.role === "ADMIN";

  return (
    <article className="flex gap-2.5">
      <Avatar
        name={update.author.name}
        seed={update.author.id}
        src={update.author.avatarUrl}
        size={nested ? "xs" : "sm"}
        className="mt-0.5 shrink-0"
      />

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[12.5px] font-medium text-fg">
            {isViewer ? "You" : update.author.name}
          </span>
          {isReviewer && !isViewer ? (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-accent-soft px-1.5 py-px text-[10px] font-medium text-accent">
              <ShieldCheck className="size-2.5" aria-hidden="true" />
              Admin
            </span>
          ) : null}
          <span className="text-[11px] text-fg-subtle">{formatRelative(update.createdAt)}</span>
          {update.editedAt ? (
            <span className="text-[10.5px] text-fg-subtle italic">edited</span>
          ) : null}
          {update.progressPercent !== null ? (
            <Badge tone="info" size="sm" variant="soft">
              <Percent className="size-2.5" aria-hidden="true" />
              {update.progressPercent}%
            </Badge>
          ) : null}
        </p>

        <div
          className={cn(
            "mt-1 rounded-lg rounded-tl-sm border px-3 py-2",
            isReviewer ? "border-accent/20 bg-accent-soft/30" : "border-border bg-surface-inset",
          )}
        >
          <MarkdownView source={update.body} />

          {update.mentions.length > 0 ? (
            <p className="mt-2 flex flex-wrap items-center gap-1 text-[10.5px] text-fg-subtle">
              Notified:
              {update.mentions.map((person) => (
                <span
                  key={person.id}
                  className="rounded bg-accent-soft px-1 py-px font-medium text-accent"
                >
                  @{person.name}
                </span>
              ))}
            </p>
          ) : null}

          {update.tags.length > 0 ? (
            <div className="mt-2">
              <TagRow tags={update.tags} max={4} />
            </div>
          ) : null}

          {update.attachments.length > 0 ? (
            <ul className="mt-2.5 space-y-1.5 border-t border-border pt-2.5">
              {update.attachments.map((file) => (
                <li key={file.id}>
                  <InlineAttachment file={file} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {onReply ? (
          <button
            type="button"
            onClick={() => onReply(update)}
            className="mt-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] font-medium text-fg-subtle transition-colors hover:text-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            <Reply className="size-3" aria-hidden="true" />
            Reply
          </button>
        ) : null}
      </div>
    </article>
  );
}

/**
 * A file inside an update.
 *
 * Audio and video play in place — a voice note you have to download is a voice note
 * nobody listens to. Everything else is a link, and anything the storage layer marked
 * non-inline downloads rather than opening, which is what keeps an uploaded HTML file
 * from rendering as a page.
 */
function InlineAttachment({ file }: { file: TaskUpdateDto["attachments"][number] }) {
  if (!file.url) {
    return (
      <span className="flex items-center gap-1.5 text-[11.5px] text-fg-subtle">
        <Paperclip className="size-3" aria-hidden="true" />
        {file.filename} — reload to view
      </span>
    );
  }

  if (file.mimeType.startsWith("audio/")) {
    return (
      <span className="block">
        <span className="mb-1 flex items-center gap-1.5 text-[11px] text-fg-subtle">
          <Paperclip className="size-3" aria-hidden="true" />
          {file.filename} · {formatBytes(file.size)}
        </span>
        <audio src={file.url} controls preload="metadata" className="w-full max-w-sm" />
      </span>
    );
  }

  if (file.mimeType.startsWith("video/")) {
    return (
      <span className="block">
        <span className="mb-1 flex items-center gap-1.5 text-[11px] text-fg-subtle">
          <Paperclip className="size-3" aria-hidden="true" />
          {file.filename} · {formatBytes(file.size)}
        </span>
        <video
          src={file.url}
          controls
          preload="metadata"
          playsInline
          className="w-full max-w-md rounded-md border border-border"
        />
      </span>
    );
  }

  if (file.mimeType.startsWith("image/") && file.inline) {
    return (
      <a href={file.url} target="_blank" rel="noopener noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed URL on a
            private bucket; next/image would cache a URL that expires in ten minutes. */}
        <img
          src={file.url}
          alt={file.filename}
          loading="lazy"
          className="max-h-56 w-auto rounded-md border border-border object-contain"
        />
        <span className="mt-1 block text-[10.5px] text-fg-subtle">
          {file.filename} · {formatBytes(file.size)}
        </span>
      </a>
    );
  }

  return (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-[11.5px] text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
    >
      <FileText className="size-3.5 shrink-0" aria-hidden="true" />
      {file.filename}
      <span className="text-fg-subtle">{formatBytes(file.size)}</span>
    </a>
  );
}

function UpdateComposer({
  taskId,
  viewer,
  people,
  storageReady,
  replyTo,
  onCancelReply,
  onDone,
}: {
  taskId: string;
  viewer: { id: string; name: string; avatarUrl: string | null };
  people: MentionablePerson[];
  storageReady: boolean;
  replyTo: TaskUpdateDto | null;
  onCancelReply: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, action, pending] = useActionState(postTaskUpdateAction, IDLE);

  const [body, setBody] = useState("");
  const [progress, setProgress] = useState("");
  const [checklist, setChecklist] = useState("");
  const [showChecklist, setShowChecklist] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (state.ok === true) {
      toast.success("Update posted", state.message);
      // `onDone` closes the composer, which unmounts this component — so there is
      // nothing to reset. Clearing the fields here would be dead work.
      onDone();
      router.refresh();
    } else if (state.ok === false && state.message) {
      toast.error("Couldn't post that update", state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      className="space-y-3 rounded-lg border border-accent/25 bg-surface p-3 shadow-xs"
    >
      <input type="hidden" name="taskId" value={taskId} />
      {replyTo ? <input type="hidden" name="parentId" value={replyTo.id} /> : null}

      {replyTo ? (
        <div className="flex items-start justify-between gap-2 rounded-md bg-surface-inset px-2.5 py-1.5">
          <p className="flex min-w-0 items-baseline gap-1.5 text-[11.5px] text-fg-muted">
            <CornerDownRight className="mt-px size-3 shrink-0 text-fg-subtle" aria-hidden="true" />
            Replying to <span className="font-medium text-fg">{replyTo.author.name}</span>
          </p>
          <button
            type="button"
            onClick={onCancelReply}
            className="grid size-5 shrink-0 place-items-center rounded text-fg-subtle hover:bg-surface-hover hover:text-fg"
            aria-label="Cancel reply"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <div className="flex gap-2.5">
        <Avatar
          name={viewer.name}
          seed={viewer.id}
          src={viewer.avatarUrl}
          size="sm"
          className="mt-1 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <MarkdownEditor
            name="body"
            value={body}
            onChange={setBody}
            people={people}
            rows={3}
            maxLength={10_000}
            placeholder="What changed? Mention someone with @, and attach a photo or a voice note if it explains it faster."
            ariaLabel="Update body"
          />
          {state.fieldErrors?.body ? (
            <p role="alert" className="mt-1 text-[12.5px] text-danger-text">
              {state.fieldErrors.body}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-[9.5rem]">
          <Field label="Progress" optional>
            <Input
              name="progressPercent"
              value={progress}
              onChange={(event) => setProgress(event.target.value)}
              inputMode="numeric"
              inputSize="sm"
              placeholder="e.g. 60"
              suffix="%"
              aria-label="Progress percent"
            />
          </Field>
        </div>

        <Button
          type="button"
          variant={showChecklist ? "subtle" : "ghost"}
          size="sm"
          onClick={() => setShowChecklist((value) => !value)}
        >
          <ListPlus className="size-3.5" />
          Checklist
        </Button>

        <Button
          type="button"
          variant={showFiles ? "subtle" : "ghost"}
          size="sm"
          onClick={() => setShowFiles((value) => !value)}
        >
          <Paperclip className="size-3.5" />
          Attach or record
        </Button>
      </div>

      {showChecklist ? (
        <Field
          label="Checklist"
          hint="One item per line. These stay tickable on the task afterwards."
        >
          <Textarea
            name="checklist"
            value={checklist}
            onChange={(event) => setChecklist(event.target.value)}
            rows={3}
            autosize
            placeholder={"Re-grind the cam\nCheck first-off with QA\nLog the grind size"}
          />
        </Field>
      ) : (
        // Always posted, so toggling the field shut does not silently drop what
        // was typed into it.
        <input type="hidden" name="checklist" value={checklist} />
      )}

      {showFiles ? (
        <AttachmentPicker storageReady={storageReady} pendingUpload={pending} />
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={pending}
          disabled={body.trim().length < 2}
        >
          <Send className="size-3.5" />
          {replyTo ? "Post reply" : "Post update"}
        </Button>
      </div>
    </form>
  );
}
