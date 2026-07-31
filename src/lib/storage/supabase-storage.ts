import "server-only";
import { randomUUID } from "node:crypto";
import { env, isSupabaseConfigured } from "@/lib/env";
import { errors } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Receipt storage on Supabase Storage.
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
 * The bucket is **private**. Nothing here ever produces a public URL:
 *
 *   • Uploads go through a Server Action using the service key, so the key never
 *     reaches the browser and every write is already behind our own authorisation.
 *   • Reads go through short-lived signed URLs minted per request, after the same
 *     RBAC check that guards the claim itself. A receipt can contain a home
 *     address or a card number; a guessable public URL is not acceptable for it.
 *   • Object paths are `<userId>/<uuid>.<ext>` — never the original filename, which
 *     could collide, contain traversal sequences, or leak information.
 */

const BUCKET = "receipts";

/** Receipts are photos of paper or a PDF. Nothing else is accepted. */
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);

const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

/** 8 MB — a phone photo of a bill, with headroom. */
export const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;

export interface StoredFile {
  storagePath: string;
  filename: string;
  mimeType: string;
  size: number;
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

/**
 * Creates the bucket if it doesn't exist.
 *
 * Called before the first upload rather than assumed, so a fresh Supabase project
 * works without anyone clicking through the dashboard. Idempotent — an existing
 * bucket returns a conflict, which is success for our purposes.
 */
async function ensureBucket(): Promise<void> {
  const response = await fetch(storageUrl("bucket"), {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      // Private. This is the single most important line in the file.
      public: false,
      file_size_limit: MAX_RECEIPT_BYTES,
      allowed_mime_types: [...ALLOWED_MIME],
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (response.ok || response.status === 409) return;

  const body = await response.text();
  // "already exists" arrives as 400 on some versions.
  if (/already exists|Duplicate/i.test(body)) return;

  logger.error("Could not create the receipts bucket", undefined, {
    status: response.status,
    body: body.slice(0, 300),
  });
  throw errors.internal("Receipt storage isn't available. Please try again shortly.");
}

/**
 * Validates and uploads a receipt.
 *
 * Validation is on the *server*, against the real bytes — a client-side `accept`
 * attribute is a convenience for the file picker, not a control.
 */
export async function uploadReceipt(file: File, userId: string): Promise<StoredFile> {
  if (!isSupabaseConfigured) {
    throw errors.internal("Receipt uploads aren't configured on this deployment.");
  }

  if (file.size === 0) throw errors.validation("That file is empty.");
  if (file.size > MAX_RECEIPT_BYTES) {
    throw errors.validation(
      `Receipts must be under ${Math.floor(MAX_RECEIPT_BYTES / 1024 / 1024)} MB. Try a photo instead of a scan.`,
    );
  }
  if (!ALLOWED_MIME.has(file.type)) {
    throw errors.validation("Attach a photo (JPG, PNG, WebP, HEIC) or a PDF.");
  }

  await ensureBucket();

  // Never trust the supplied filename for the path: it can collide, contain
  // `../`, or carry information. Keep the original only as a display label.
  const extension = EXTENSION[file.type] ?? "bin";
  const storagePath = `${userId}/${randomUUID()}.${extension}`;

  const response = await fetch(storageUrl(`object/${BUCKET}/${storagePath}`), {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": file.type,
      "cache-control": "3600",
    },
    body: new Uint8Array(await file.arrayBuffer()),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    logger.error("Receipt upload failed", undefined, {
      status: response.status,
      body: (await response.text()).slice(0, 300),
    });
    throw errors.internal("That receipt couldn't be uploaded. Please try again.");
  }

  return {
    storagePath,
    // Trimmed and stripped of any path component.
    filename: (file.name.split(/[\\/]/).pop() ?? "receipt").slice(0, 200),
    mimeType: file.type,
    size: file.size,
  };
}

/**
 * Mints a short-lived signed URL.
 *
 * Ten minutes: long enough to open or download, short enough that a URL pasted
 * into a chat stops working quickly. Callers MUST have authorised the viewer
 * first — this function deliberately knows nothing about permissions.
 */
export async function signReceiptUrl(storagePath: string, expiresInSeconds = 600): Promise<string | null> {
  if (!isSupabaseConfigured) return null;

  try {
    const response = await fetch(storageUrl(`object/sign/${BUCKET}/${storagePath}`), {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: expiresInSeconds }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      logger.warn("Could not sign receipt URL", { status: response.status, storagePath });
      return null;
    }

    const { signedURL } = (await response.json()) as { signedURL?: string };
    if (!signedURL) return null;

    // The API returns a path relative to /storage/v1.
    return `${env.SUPABASE_URL!.replace(/\/$/, "")}/storage/v1${signedURL}`;
  } catch (error) {
    logger.warn("Signing receipt URL threw", { error: String(error), storagePath });
    return null;
  }
}

/** Best-effort delete. A leftover object is untidy, not dangerous. */
export async function deleteReceipt(storagePath: string): Promise<void> {
  if (!isSupabaseConfigured) return;

  try {
    await fetch(storageUrl(`object/${BUCKET}/${storagePath}`), {
      method: "DELETE",
      headers: authHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    logger.warn("Could not delete receipt object", { error: String(error), storagePath });
  }
}
