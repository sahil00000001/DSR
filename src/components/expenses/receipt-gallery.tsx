"use client";

import { useState } from "react";
import { ExternalLink, FileText, ImageOff, Paperclip, ZoomIn } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { formatBytes } from "@/lib/utils/format";
import type { ExpenseAttachmentDto } from "@/lib/services/expenses";

/**
 * Receipts attached to a claim.
 *
 * The URLs here are short-lived signed URLs minted server-side *after* the viewer
 * passed the RBAC check — the bucket is private and there is no public URL to leak.
 * That has one visible consequence: a tab left open past the expiry will show a
 * broken image, so `onError` swaps in a "reload to view" state rather than an
 * unexplained blank box.
 */
export function ReceiptGallery({ attachments }: { attachments: ExpenseAttachmentDto[] }) {
  const [zoomed, setZoomed] = useState<ExpenseAttachmentDto | null>(null);
  const [expired, setExpired] = useState<Set<string>>(new Set());

  if (attachments.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={<Paperclip className="size-5" />}
        title="No receipts attached"
        description="A claim without a bill takes longer to approve — an admin has to take your word for the amount."
      />
    );
  }

  const markExpired = (id: string) =>
    setExpired((previous) => new Set(previous).add(id));

  return (
    <>
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {attachments.map((attachment) => {
          const isImage = attachment.mimeType.startsWith("image/");
          const unavailable = !attachment.url || expired.has(attachment.id);

          return (
            <li key={attachment.id}>
              <button
                type="button"
                onClick={() => {
                  if (unavailable) return;
                  // Images open in the lightbox; a PDF is better handled by the
                  // browser's own viewer than by anything we could build here.
                  if (isImage) setZoomed(attachment);
                  else window.open(attachment.url!, "_blank", "noopener,noreferrer");
                }}
                disabled={unavailable}
                className="group relative block w-full overflow-hidden rounded-lg border border-border bg-surface-inset text-left transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface focus-visible:outline-none disabled:cursor-default"
                aria-label={
                  isImage ? `View ${attachment.filename}` : `Open ${attachment.filename}`
                }
              >
                <span className="grid aspect-4/3 place-items-center overflow-hidden">
                  {unavailable ? (
                    <span className="flex flex-col items-center gap-1.5 px-2 text-center text-fg-subtle">
                      <ImageOff className="size-4" aria-hidden="true" />
                      <span className="text-[10.5px] leading-tight">Reload to view</span>
                    </span>
                  ) : isImage ? (
                    /* Signed URL on a private bucket: next/image would need the host
                       allow-listed and would cache a URL that expires in ten minutes. */
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={attachment.url!}
                      alt={attachment.filename}
                      loading="lazy"
                      onError={() => markExpired(attachment.id)}
                      className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <span className="flex flex-col items-center gap-1.5 text-fg-muted">
                      <FileText className="size-6" aria-hidden="true" />
                      <span className="text-[10.5px] font-medium tracking-wide uppercase">PDF</span>
                    </span>
                  )}
                </span>

                {!unavailable ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-md bg-surface/85 text-fg-muted opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
                  >
                    {isImage ? (
                      <ZoomIn className="size-3.5" />
                    ) : (
                      <ExternalLink className="size-3.5" />
                    )}
                  </span>
                ) : null}

                <span className="block border-t border-border px-2 py-1.5">
                  <span className="block truncate text-[11.5px] font-medium text-fg">
                    {attachment.filename}
                  </span>
                  <span className="block text-[10.5px] text-fg-subtle">
                    {formatBytes(attachment.size)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <Dialog
        open={zoomed !== null}
        onClose={() => setZoomed(null)}
        title={zoomed?.filename ?? "Receipt"}
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
          // eslint-disable-next-line @next/next/no-img-element -- see note above.
          <img
            src={zoomed.url}
            alt={zoomed.filename}
            className="mx-auto max-h-[70vh] w-auto rounded-md border border-border object-contain"
          />
        ) : null}
      </Dialog>
    </>
  );
}
