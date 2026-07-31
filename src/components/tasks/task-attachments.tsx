"use client";

import { useState } from "react";
import {
  Download,
  ExternalLink,
  FileArchive,
  FileAudio,
  FileSpreadsheet,
  FileText,
  FileVideo,
  ImageOff,
  ZoomIn,
  type LucideIcon,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { formatBytes } from "@/lib/utils/format";
import { formatRelative } from "@/lib/utils/date";
import type { TaskAttachmentDto } from "@/lib/services/tasks";

/**
 * Files attached to a task.
 *
 * The URLs are short-lived signed URLs minted server-side after the RBAC check — the
 * buckets are private and there is no public URL to leak. That has one visible
 * consequence: a tab left open past the expiry gets a broken image, so `onError` swaps
 * in a "reload to view" state rather than an unexplained blank box.
 *
 * `file.inline` comes from the storage layer, not from guessing here. Anything it says
 * no to already carries `Content-Disposition: attachment`, so clicking it downloads —
 * which is what stops an uploaded HTML or SVG file rendering as a page on the storage
 * origin.
 */
const ICONS: Array<[RegExp, LucideIcon]> = [
  [/^audio\//, FileAudio],
  [/^video\//, FileVideo],
  [/pdf$/, FileText],
  [/zip|compressed|rar|7z/, FileArchive],
  [/sheet|excel|csv/, FileSpreadsheet],
];

function iconFor(type: string): LucideIcon {
  return ICONS.find(([pattern]) => pattern.test(type))?.[1] ?? FileText;
}

export function TaskAttachments({ attachments }: { attachments: TaskAttachmentDto[] }) {
  const [zoomed, setZoomed] = useState<TaskAttachmentDto | null>(null);
  const [expired, setExpired] = useState<Set<string>>(new Set());

  const markExpired = (id: string) => setExpired((previous) => new Set(previous).add(id));

  const images = attachments.filter(
    (file) => file.mimeType.startsWith("image/") && file.inline && file.url,
  );
  const media = attachments.filter((file) => /^(audio|video)\//.test(file.mimeType) && file.url);
  const documents = attachments.filter(
    (file) => !images.includes(file) && !media.includes(file),
  );

  return (
    <div className="space-y-4">
      {images.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {images.map((file) => {
            const unavailable = expired.has(file.id);
            return (
              <li key={file.id}>
                <button
                  type="button"
                  onClick={() => !unavailable && setZoomed(file)}
                  disabled={unavailable}
                  aria-label={`View ${file.filename}`}
                  className="group relative block w-full overflow-hidden rounded-lg border border-border bg-surface-inset text-left transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:cursor-default"
                >
                  <span className="grid aspect-4/3 place-items-center overflow-hidden">
                    {unavailable ? (
                      <span className="flex flex-col items-center gap-1.5 text-fg-subtle">
                        <ImageOff className="size-4" aria-hidden="true" />
                        <span className="text-[10.5px]">Reload to view</span>
                      </span>
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element -- signed URL
                         on a private bucket; next/image would cache a URL that expires. */
                      <img
                        src={file.url!}
                        alt={file.filename}
                        loading="lazy"
                        onError={() => markExpired(file.id)}
                        className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                      />
                    )}
                  </span>

                  {!unavailable ? (
                    <span
                      aria-hidden="true"
                      className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-md bg-surface/85 text-fg-muted opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
                    >
                      <ZoomIn className="size-3.5" />
                    </span>
                  ) : null}

                  <span className="block border-t border-border px-2 py-1.5">
                    <span className="block truncate text-[11.5px] font-medium text-fg">
                      {file.filename}
                    </span>
                    <span className="block text-[10px] text-fg-subtle">
                      {formatBytes(file.size)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {media.length > 0 ? (
        <ul className="space-y-3">
          {media.map((file) => (
            <li key={file.id}>
              <p className="mb-1 flex items-baseline gap-2 text-[11.5px]">
                <span className="font-medium text-fg">{file.filename}</span>
                <span className="text-fg-subtle">
                  {formatBytes(file.size)}
                  {file.uploadedBy ? ` · ${file.uploadedBy.name.split(" ")[0]}` : ""} ·{" "}
                  {formatRelative(file.createdAt)}
                </span>
              </p>
              {file.mimeType.startsWith("audio/") ? (
                <audio src={file.url!} controls preload="metadata" className="w-full max-w-md" />
              ) : (
                <video
                  src={file.url!}
                  controls
                  preload="metadata"
                  playsInline
                  className="w-full max-w-lg rounded-lg border border-border"
                />
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {documents.length > 0 ? (
        <ul className="space-y-1.5">
          {documents.map((file) => {
            const Icon = iconFor(file.mimeType);
            return (
              <li key={file.id}>
                {file.url ? (
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 rounded-lg border border-border bg-surface p-2 transition-colors hover:border-border-strong hover:bg-surface-hover"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-inset">
                      <Icon className="size-4 text-fg-subtle" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium text-fg">
                        {file.filename}
                      </span>
                      <span className="block text-[10.5px] text-fg-subtle">
                        {formatBytes(file.size)}
                        {file.uploadedBy ? ` · ${file.uploadedBy.name.split(" ")[0]}` : ""} ·{" "}
                        {formatRelative(file.createdAt)}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="shrink-0 text-fg-subtle"
                      title={file.inline ? "Opens in a new tab" : "Downloads"}
                    >
                      {file.inline ? (
                        <ExternalLink className="size-3.5" />
                      ) : (
                        <Download className="size-3.5" />
                      )}
                    </span>
                  </a>
                ) : (
                  <span className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-inset p-2 text-[12.5px] text-fg-subtle">
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {file.filename} — reload to view
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      <Dialog
        open={zoomed !== null}
        onClose={() => setZoomed(null)}
        title={zoomed?.filename ?? "Attachment"}
        description={zoomed ? formatBytes(zoomed.size) : undefined}
        size="xl"
        footer={
          zoomed?.url ? (
            <a
              href={zoomed.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent underline-offset-2 hover:underline"
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              Open full size
            </a>
          ) : null
        }
      >
        {zoomed?.url ? (
          /* eslint-disable-next-line @next/next/no-img-element -- see note above. */
          <img
            src={zoomed.url}
            alt={zoomed.filename}
            className="mx-auto max-h-[70vh] w-auto rounded-md border border-border object-contain"
          />
        ) : null}
      </Dialog>
    </div>
  );
}
