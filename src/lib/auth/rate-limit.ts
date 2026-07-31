import "server-only";

/**
 * Fixed-window rate limiter for authentication endpoints.
 *
 * ## Scope and honest limitations
 *
 * State lives in the process. On a single long-lived server that's exactly right.
 * On Vercel's serverless runtime each instance keeps its own counters, so the
 * effective limit is `limit × concurrent instances` — enough to blunt a casual
 * credential-stuffing script, not enough to stop a determined distributed one.
 *
 * For that, swap `hit()` for a Redis `INCR` + `EXPIRE` (Upstash works well on
 * Vercel). The call sites don't change; only this module does. It is deliberately
 * the single place that would need touching.
 *
 * Sign-in also has a second, independent defence that doesn't depend on shared
 * state: scrypt makes every attempt cost ~150 ms of CPU (see password.ts).
 */

interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();

/** Bound the map so a hostile key space can't grow it without limit. */
const MAX_BUCKETS = 10_000;

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** Seconds until the window resets. */
  retryAfter: number;
}

export function hit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    // Opportunistic sweep of expired windows before inserting a new one.
    if (buckets.size >= MAX_BUCKETS) {
      for (const [bucketKey, window] of buckets) {
        if (window.resetAt <= now) buckets.delete(bucketKey);
      }
      // Still full: the oldest insertion goes, rather than refusing service.
      if (buckets.size >= MAX_BUCKETS) {
        const oldest = buckets.keys().next().value;
        if (oldest) buckets.delete(oldest);
      }
    }

    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { ok: true, remaining: limit - 1, retryAfter: windowSeconds };
  }

  existing.count += 1;
  const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));

  return {
    ok: existing.count <= limit,
    remaining: Math.max(0, limit - existing.count),
    retryAfter,
  };
}

/** Clears a key — called after a successful sign-in so one typo isn't punished. */
export function reset(key: string): void {
  buckets.delete(key);
}

/** Policies, named so call sites read as intent rather than magic numbers. */
export const LIMITS = {
  /** Per email+IP: 8 sign-in attempts every 5 minutes. */
  login: { limit: 8, window: 300 },
  /** Password-reset requests are cheap to send but expensive to receive. */
  passwordReset: { limit: 4, window: 900 },
  /** Guards the reset form itself against token brute-forcing. */
  passwordResetSubmit: { limit: 10, window: 900 },
  /** Global write ceiling to stop a runaway client hammering server actions. */
  mutation: { limit: 120, window: 60 },
} as const;

export function limitKey(scope: string, ...parts: Array<string | null | undefined>): string {
  return [scope, ...parts.map((part) => part ?? "unknown")].join(":");
}
