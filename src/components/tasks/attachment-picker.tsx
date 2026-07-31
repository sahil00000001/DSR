"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  FileArchive,
  FileAudio,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Paperclip,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";
import { formatBytes } from "@/lib/utils/format";
import { MediaRecorderField, type Recording } from "@/components/tasks/media-recorder";

/**
 * Attachment picker: drag-and-drop, a file button, and in-browser recording.
 *
 * ## The hidden input is the source of truth
 *
 * Files are held in a ref and written back into a real `<input type="file">` via
 * `DataTransfer` on every change, so the form posts exactly what is on screen. A
 * `FileList` cannot be spliced, which is why the list is kept beside it rather than
 * read from it — removing the second of three files is otherwise impossible.
 *
 * ## No upload progress bar, deliberately
 *
 * Section 14 asks for upload progress indicators. A Server Action posts the whole
 * multipart body in one `fetch` that reports nothing until it completes, so a
 * percentage here would be a lie animating at a made-up rate. What is shown instead
 * is honest: per-file size, a running total, and a pending state while the post is in
 * flight. Real per-byte progress needs presigned direct-to-bucket uploads with
 * `XMLHttpRequest`, which is a sensible next step and is noted in the module doc for
 * whoever takes it on.
 */

/** Kept in step with MAX_TASK_FILE_BYTES on the server. */
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_FILES = 10;
/** Guards the whole post, since a Server Action buffers the entire body. */
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;

interface Pending {
  key: string;
  name: string;
  size: number;
  type: string;
  /** Object URL for images and media; null for everything else. */
  previewUrl: string | null;
}

const ICONS: Array<[RegExp, LucideIcon]> = [
  [/^image\//, Paperclip],
  [/^audio\//, FileAudio],
  [/^video\//, FileVideo],
  [/pdf$/, FileText],
  [/zip|compressed|rar|7z/, FileArchive],
  [/sheet|excel|csv/, FileSpreadsheet],
  [/word|document/, FileText],
];

function iconFor(type: string): LucideIcon {
  return ICONS.find(([pattern]) => pattern.test(type))?.[1] ?? Paperclip;
}

export function AttachmentPicker({
  name = "files",
  disabled,
  storageReady = true,
  pendingUpload = false,
  allowRecording = true,
}: {
  name?: string;
  disabled?: boolean;
  storageReady?: boolean;
  /** True while the parent form is submitting, so the list can show it. */
  pendingUpload?: boolean;
  allowRecording?: boolean;
}) {
  const [items, setItems] = useState<Pending[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const input = useRef<HTMLInputElement | null>(null);
  /** The authoritative list; the input's own FileList cannot be spliced. */
  const files = useRef<File[]>([]);
  /** Every object URL created, revoked once on unmount. */
  const created = useRef<string[]>([]);

  useEffect(
    () => () => {
      for (const url of created.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const syncInput = useCallback(() => {
    const transfer = new DataTransfer();
    for (const file of files.current) transfer.items.add(file);
    if (input.current) input.current.files = transfer.files;
  }, []);

  const add = useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return;
      setError(null);

      const accepted: File[] = [];
      let total = files.current.reduce((sum, file) => sum + file.size, 0);

      for (const file of incoming) {
        if (files.current.length + accepted.length >= MAX_FILES) {
          setError(`Attach at most ${MAX_FILES} files at a time.`);
          break;
        }
        if (file.size === 0) {
          setError(`${file.name} is empty.`);
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          setError(`${file.name} is ${formatBytes(file.size)} — the limit is 50 MB per file.`);
          continue;
        }
        if (total + file.size > MAX_TOTAL_BYTES) {
          setError("That would take the post over 100 MB in total. Split it across two updates.");
          break;
        }
        // Same name and size twice is a double-click on the picker, not two files.
        const duplicate = files.current.some(
          (existing) => existing.name === file.name && existing.size === file.size,
        );
        if (duplicate) continue;

        accepted.push(file);
        total += file.size;
      }

      if (accepted.length === 0) {
        syncInput();
        return;
      }

      const added = accepted.map((file) => {
        const previewable = /^(image|audio|video)\//.test(file.type);
        const previewUrl = previewable ? URL.createObjectURL(file) : null;
        if (previewUrl) created.current.push(previewUrl);
        return {
          key: `${file.name}-${file.size}-${file.lastModified}-${files.current.length}`,
          name: file.name,
          size: file.size,
          type: file.type,
          previewUrl,
        };
      });

      files.current = [...files.current, ...accepted];
      setItems((previous) => [...previous, ...added]);
      syncInput();
    },
    [syncInput],
  );

  function remove(key: string) {
    const index = items.findIndex((item) => item.key === key);
    if (index === -1) return;

    const removed = items[index];
    if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);

    // Both lists are index-aligned, so drop the same position from each.
    files.current = files.current.filter((_, position) => position !== index);
    setItems(items.filter((_, position) => position !== index));
    setError(null);
    syncInput();
  }

  function onRecorded(recording: Recording) {
    add([recording.file]);
  }

  const totalBytes = items.reduce((sum, item) => sum + item.size, 0);
  const blocked = disabled || !storageReady;

  return (
    <div className="space-y-2.5">
      <input
        ref={input}
        type="file"
        name={name}
        multiple
        disabled={blocked}
        onChange={(event) => add(Array.from(event.target.files ?? []))}
        className="sr-only"
        id={`${name}-input`}
      />

      <div
        onDragOver={(event) => {
          if (blocked) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          if (blocked) return;
          event.preventDefault();
          setDragging(false);
          add(Array.from(event.dataTransfer.files));
        }}
        className={cn(
          "rounded-lg border border-dashed transition-colors",
          dragging ? "border-accent bg-accent-soft/50" : "border-border",
          blocked && "opacity-60",
        )}
      >
        <label
          htmlFor={`${name}-input`}
          className={cn(
            "flex flex-col items-center gap-1.5 px-4 py-5 text-center",
            blocked ? "cursor-not-allowed" : "cursor-pointer",
          )}
        >
          <Upload className="size-5 text-fg-subtle" aria-hidden="true" />
          <span className="text-[13px] font-medium text-fg">
            {items.length > 0 ? "Add another file" : "Drop files here, or choose them"}
          </span>
          <span className="text-[11.5px] text-fg-subtle">
            {storageReady
              ? "Any file type — documents, spreadsheets, images, audio, video, ZIP. 50 MB each."
              : "File storage isn't configured on this deployment."}
          </span>
        </label>
      </div>

      {allowRecording && storageReady ? (
        <div className="flex flex-wrap gap-2">
          <MediaRecorderField kind="audio" onRecorded={onRecorded} disabled={blocked} />
          <MediaRecorderField kind="video" onRecorded={onRecorded} disabled={blocked} />
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-[12.5px] text-danger-text">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      {items.length > 0 ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11.5px] text-fg-subtle">
              {items.length} file{items.length === 1 ? "" : "s"} · {formatBytes(totalBytes)}
            </p>
            {pendingUpload ? (
              <Badge tone="info" size="sm">
                Uploading…
              </Badge>
            ) : null}
          </div>

          <ul className="space-y-1.5">
            {items.map((item) => {
              const Icon = iconFor(item.type);
              const isImage = item.type.startsWith("image/");

              return (
                <li
                  key={item.key}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg border border-border bg-surface-inset p-2",
                    pendingUpload && "animate-pulse",
                  )}
                >
                  <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-surface">
                    {isImage && item.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.previewUrl}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <Icon className="size-4 text-fg-subtle" aria-hidden="true" />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium text-fg">
                      {item.name}
                    </span>
                    <span className="block text-[10.5px] text-fg-subtle">
                      {formatBytes(item.size)}
                      {item.type ? ` · ${item.type}` : ""}
                    </span>
                  </span>

                  <button
                    type="button"
                    onClick={() => remove(item.key)}
                    disabled={pendingUpload}
                    className="grid size-6 shrink-0 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-danger-soft hover:text-danger-text focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50"
                    aria-label={`Remove ${item.name}`}
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}
