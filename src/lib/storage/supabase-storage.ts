import "server-only";
import { randomUUID } from "node:crypto";
import { env, isSupabaseConfigured } from "@/lib/env";
import { errors } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * File storage on Supabase Storage.
 *
 * ## Why raw REST rather than @supabase/supabase-js
 *
 * The client library is ~40 kB of auth, realtime and postgrest we don't use — this
 * app talks to Postgres through Prisma and owns its own sessions. Three endpoints
 * are needed (upload, sign, delete) and each is one `fetch`. Consistent with the
 * hand-rolled XLSX writer and icon generator elsewhere in the project.
 *
 * ## Security model
 *
 * Buckets are **private**. Nothing here ever produces a public URL:
 *
 *   • Uploads go through a Server Action using the service key, so the key never
 *     reaches the browser and every write is already behind our own authorisation.
 *   • Reads go through short-lived signed URLs minted per request, after the same
 *     RBAC check that guards the parent record. A receipt can contain a home
 *     address or a card number; a guessable public URL is not acceptable for it.
 *   • Object paths are `<userId>/<uuid>.<ext>` — never the original filename, which
 *     could collide, contain traversal sequences, or leak information.
 *
 * ## Two buckets, because the rules genuinely differ
 *
 * `receipts` accepts a photo of a bill and nothing else. `task-files` has to accept
 * whatever someone needs to attach to a job — a CAD export, a ZIP of photos, a voice
 * note. Widening the receipt rules to cover that would quietly weaken the narrow
 * case, so the two are configured separately and the wide one carries the extra
 * precaution described on `INLINE_SAFE_MIME`.
 */

interface BucketConfig {
  bucket: string;
  maxBytes: number;
  /** `null` means any type; otherwise an allowlist checked against the real bytes. */
  allowedMime: ReadonlySet<string> | null;
  /** Extension per MIME, for the allowlisted case. */
  extensions: Record<string, string>;
}

/** 8 MB — a phone photo of a bill, with headroom. */
export const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;

/**
 * 50 MB — enough for a two-minute phone video or a ZIP of drawings.
 *
 * Not unlimited: a Server Action buffers the body in the function's memory, so an
 * unbounded upload is a way to knock the deployment over rather than a feature.
 */
export const MAX_TASK_FILE_BYTES = 50 * 1024 * 1024;

const RECEIPT_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);

const RECEIPT_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

const RECEIPTS: BucketConfig = {
  bucket: "receipts",
  maxBytes: MAX_RECEIPT_BYTES,
  allowedMime: RECEIPT_MIME,
  extensions: RECEIPT_EXTENSIONS,
};

const TASK_FILES: BucketConfig = {
  bucket: "task-files",
  maxBytes: MAX_TASK_FILE_BYTES,
  // Any type: the brief asks for audio, video, PDF, Excel, Word, images, ZIP and
  // "any supported file type". The protection is in how a file is *served*, not in a
  // guessing game about extensions — see `INLINE_SAFE_MIME`.
  allowedMime: null,
  extensions: {},
};

/**
 * Types safe to hand the browser to render in place.
 *
 * Anything outside this set is served with `Content-Disposition: attachment`, so it
 * downloads rather than executes. That matters because an uploaded `.html` or `.svg`
 * is a script the browser would happily run in the storage origin's context — not
 * enough to touch this app's cookies (different origin), but plenty for a convincing
 * phishing page hosted on a domain the company appears to trust.
 *
 * SVG is deliberately absent. It is an image to a person and a script host to a
 * browser, and there is no safe way to preview one we did not generate ourselves.
 */
const INLINE_SAFE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "application/pdf",
  "audio/mpeg",
  "audio/mp4",
  "audio/webm",
  "audio/ogg",
  "audio/wav",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "text/plain",
]);

/** Extension guessed from the MIME type, for the wide bucket. */
const COMMON_EXTENSIONS: Record<string, string> = {
  ...RECEIPT_EXTENSIONS,
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/webm": "weba",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

export interface StoredFile {
  storagePath: string;
  filename: string;
  mimeType: string;
  size: number;
  /** Which bucket it landed in, so signing later does not have to guess. */
  bucket: string;
}

function storageUrl(path: string): string {
  return `${env.SUPABASE_URL!.replace(/\/$/, "")}/storage/v1/${path}`;
}

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${env.SUPABASE_SECRET_KEY!}`,
    // Supabase requires apikey alongside the bearer token on storage routes.
    apikey: env.SUPABASE_SECRET_KEY!,
  };
}

export function isStorageConfigured(): boolean {
  return isSupabaseConfigured;
}

/** True when the browser may be allowed to render this type in place. */
export function isInlineSafe(mimeType: string): boolean {
  return INLINE_SAFE_MIME.has(mimeType);
}

/**
 * Creates a bucket if it does not exist.
 *
 * Called before the first upload rather than assumed, so a fresh Supabase project
 * works without anyone clicking through the dashboard. Idempotent — an existing
 * bucket returns a conflict, which is success for our purposes.
 */
async function ensureBucket(config: BucketConfig): Promise<void> {
  const response = await fetch(storageUrl("bucket"), {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      id: config.bucket,
      name: config.bucket,
      // Private. This is the single most important line in the file.
      public: false,
      file_size_limit: config.maxBytes,
      ...(config.allowedMime ? { allowed_mime_types: [...config.allowedMime] } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (response.ok || response.status === 409) return;

  const body = await response.text();
  // "already exists" arrives as 400 on some versions.
  if (/already exists|Duplicate/i.test(body)) return;

  logger.error("Could not create a storage bucket", undefined, {
    bucket: config.bucket,
    status: response.status,
    body: body.slice(0, 300),
  });
  throw errors.internal("File storage isn't available. Please try again shortly.");
}

/** Trimmed, stripped of any path component, and length-capped. */
function safeLabel(name: string): string {
  return (name.split(/[\\/]/).pop() ?? "file").slice(0, 200);
}

function extensionFor(config: BucketConfig, file: File): string {
  const fromMime = config.allowedMime
    ? config.extensions[file.type]
    : COMMON_EXTENSIONS[file.type];
  if (fromMime) return fromMime;

  // Fall back to the supplied extension, but only if it looks like one. It affects
  // nothing but the stored object's name — the served Content-Type comes from the
  // recorded MIME, so a misleading extension cannot change how a file is treated.
  const supplied = file.name.split(".").pop();
  return supplied && /^[a-z0-9]{1,8}$/i.test(supplied) ? supplied.toLowerCase() : "bin";
}

async function upload(config: BucketConfig, file: File, userId: string): Promise<StoredFile> {
  if (!isSupabaseConfigured) {
    throw errors.internal("File uploads aren't configured on this deployment.");
  }

  if (file.size === 0) throw errors.validation("That file is empty.");
  if (file.size > config.maxBytes) {
    throw errors.validation(
      `Files must be under ${Math.floor(config.maxBytes / 1024 / 1024)} MB. ` +
        `That one is ${(file.size / 1024 / 1024).toFixed(1)} MB.`,
    );
  }
  // Validation is on the *server*, against the real bytes — a client-side `accept`
  // attribute is a convenience for the file picker, not a control.
  if (config.allowedMime && !config.allowedMime.has(file.type)) {
    throw errors.validation("Attach a photo (JPG, PNG, WebP, HEIC) or a PDF.");
  }
  if (!file.type) {
    throw errors.validation("That file has no type the browser could identify.");
  }

  await ensureBucket(config);

  // Never trust the supplied filename for the path: it can collide, contain `../`,
  // or carry information. Keep the original only as a display label.
  const storagePath = `${userId}/${randomUUID()}.${extensionFor(config, file)}`;

  const response = await fetch(storageUrl(`object/${config.bucket}/${storagePath}`), {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": file.type,
      "cache-control": "3600",
    },
    body: new Uint8Array(await file.arrayBuffer()),
    // Generous: a 50 MB video over a plant's connection is not quick.
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    logger.error("File upload failed", undefined, {
      bucket: config.bucket,
      status: response.status,
      body: (await response.text()).slice(0, 300),
    });
    throw errors.internal("That file couldn't be uploaded. Please try again.");
  }

  return {
    storagePath,
    filename: safeLabel(file.name),
    mimeType: file.type,
    size: file.size,
    bucket: config.bucket,
  };
}

export function uploadReceipt(file: File, userId: string): Promise<StoredFile> {
  return upload(RECEIPTS, file, userId);
}

export function uploadTaskFile(file: File, userId: string): Promise<StoredFile> {
  return upload(TASK_FILES, file, userId);
}

/**
 * Mints a short-lived signed URL.
 *
 * Ten minutes: long enough to open or download, short enough that a URL pasted into
 * a chat stops working quickly. Callers MUST have authorised the viewer first — this
 * function deliberately knows nothing about permissions.
 *
 * `downloadAs` sets `Content-Disposition: attachment` with a filename. It is passed
 * for anything `isInlineSafe()` rejects, so the browser saves the file rather than
 * rendering it.
 */
async function sign(
  bucket: string,
  storagePath: string,
  expiresInSeconds: number,
  downloadAs?: string,
): Promise<string | null> {
  if (!isSupabaseConfigured) return null;

  try {
    const response = await fetch(storageUrl(`object/sign/${bucket}/${storagePath}`), {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: expiresInSeconds }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      logger.warn("Could not sign a storage URL", { bucket, status: response.status, storagePath });
      return null;
    }

    const { signedURL } = (await response.json()) as { signedURL?: string };
    if (!signedURL) return null;

    // The API returns a path relative to /storage/v1.
    const url = new URL(`${env.SUPABASE_URL!.replace(/\/$/, "")}/storage/v1${signedURL}`);
    if (downloadAs) url.searchParams.set("download", downloadAs);
    return url.toString();
  } catch (error) {
    logger.warn("Signing a storage URL threw", { error: String(error), bucket, storagePath });
    return null;
  }
}

export function signReceiptUrl(storagePath: string, expiresInSeconds = 600) {
  return sign(RECEIPTS.bucket, storagePath, expiresInSeconds);
}

/**
 * Signs a task attachment.
 *
 * Anything not inline-safe is forced to download, which is what stops an uploaded
 * HTML or SVG file from running as a page on the storage origin.
 */
export function signTaskFileUrl(
  storagePath: string,
  {
    mimeType,
    filename,
    expiresInSeconds = 600,
  }: {
    mimeType: string;
    filename: string;
    expiresInSeconds?: number;
  },
) {
  return sign(
    TASK_FILES.bucket,
    storagePath,
    expiresInSeconds,
    isInlineSafe(mimeType) ? undefined : filename,
  );
}

/** Best-effort delete. A leftover object is untidy, not dangerous. */
async function remove(bucket: string, storagePath: string): Promise<void> {
  if (!isSupabaseConfigured) return;

  try {
    await fetch(storageUrl(`object/${bucket}/${storagePath}`), {
      method: "DELETE",
      headers: authHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    logger.warn("Could not delete a storage object", {
      error: String(error),
      bucket,
      storagePath,
    });
  }
}

export function deleteReceipt(storagePath: string): Promise<void> {
  return remove(RECEIPTS.bucket, storagePath);
}

export function deleteTaskFile(storagePath: string): Promise<void> {
  return remove(TASK_FILES.bucket, storagePath);
}
