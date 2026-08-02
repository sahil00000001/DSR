import "server-only";
import { logger } from "@/lib/logger";

/**
 * Human-readable sequential references — TSK-0042, ORD-0007, EXP-0113.
 *
 * ## The bug this exists to prevent
 *
 * All three generators independently did the same thing:
 *
 * ```ts
 * const latest = await prisma.task.findFirst({ orderBy: { createdAt: "desc" } });
 * return `TSK-${parse(latest.taskNumber) + 1}`;
 * ```
 *
 * **The newest row is not the one with the highest number.** Any row whose `createdAt`
 * was backdated — a seed, an import, a migration from the old spreadsheet — sits in the
 * middle of the timeline while holding a high reference. On this database the newest task
 * by date was TSK-0031 while TSK-0038 existed, so the next task claimed TSK-0032 and hit
 * the unique index. Orders had the same gap.
 *
 * It failed hard, not gracefully: the evening cron died on it before sending the digest or
 * the briefing, so an unrelated numbering bug silently took out the day's reporting.
 *
 * Ordering by the reference column instead is the fix. Sorting them as text is correct
 * *because* they are zero-padded to a fixed width — "TSK-0038" > "TSK-0031" lexically and
 * numerically. That holds to 9999, which at this plant's rate is several decades; past it
 * the padding grows and the comparison would need to become numeric.
 *
 * ## And a retry, because ordering is not enough
 *
 * Read-highest-then-insert is still a race. Two people creating an order in the same
 * moment both read ORD-0006 and both try ORD-0007; one gets a 500 on a form they just
 * filled in. `withUniqueReference` re-reads and retries on the unique violation, which is
 * the cheap correct answer — a sequence or an advisory lock would serialise every create
 * for a collision that happens a few times a year.
 */

/** Digits out of a reference. Returns 0 for anything unparseable, so the next is 1. */
export function parseReference(reference: string | null | undefined): number {
  const digits = reference?.split("-")[1];
  const value = Number.parseInt(digits ?? "0", 10);
  return Number.isFinite(value) ? value : 0;
}

export function formatReference(prefix: string, sequence: number): string {
  return `${prefix}-${String(sequence).padStart(4, "0")}`;
}

type PrismaKnownError = { code: string };

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as PrismaKnownError).code === "P2002"
  );
}

/**
 * Creates a record with a fresh reference, retrying if someone else took it first.
 *
 * `create` is called with the reference to use and must be the *only* thing in the
 * attempt that can raise a unique violation on it — a P2002 from any other column would
 * be retried pointlessly and then rethrown, which is noisier than failing at once but
 * still correct.
 */
export async function withUniqueReference<T>(
  nextReference: () => Promise<string>,
  create: (reference: string) => Promise<T>,
  attempts = 4,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const reference = await nextReference();

    try {
      return await create(reference);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;

      lastError = error;
      logger.warn("Reference was taken while creating; retrying", { reference, attempt });
    }
  }

  throw lastError;
}
