import "server-only";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Password hashing with scrypt.
 *
 * ## Why scrypt
 *
 * scrypt is memory-hard, which is what makes GPU/ASIC cracking expensive — a
 * property plain PBKDF2 doesn't have. It also ships in Node's standard library,
 * so there's no native module to compile (a non-starter on Vercel) and no pure-JS
 * implementation to be slow (pure-JS bcrypt at a *safe* cost factor takes over a
 * second per hash, which pushes implementers toward unsafely low cost factors).
 *
 * Parameters below are the OWASP-recommended minimum (N=2^16, r=8, p=1 ⇒ ~64 MB
 * of memory per hash, roughly 100–200 ms on Vercel's runtime). `maxmem` must be
 * raised explicitly or Node refuses the allocation.
 *
 * ## Stored format
 *
 *   scrypt$<N>$<r>$<p>$<salt-base64>$<hash-base64>
 *
 * Parameters travel with the hash so they can be raised later without
 * invalidating existing passwords — `needsRehash()` reports which rows are stale
 * and they get upgraded transparently on next successful sign-in.
 */

const N = 2 ** 16;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
// 64 MiB working set + headroom.
const MAX_MEM = 144 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: MAX_MEM,
  });
  return ["scrypt", N, R, P, salt.toString("base64"), derived.toString("base64")].join("$");
}

/**
 * Constant-time verification. Returns false for malformed hashes rather than
 * throwing, so a corrupted row can't be distinguished from a wrong password.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;

    const [, n, r, p, saltB64, hashB64] = parts;
    const salt = Buffer.from(saltB64!, "base64");
    const expected = Buffer.from(hashB64!, "base64");
    if (salt.length === 0 || expected.length === 0) return false;

    const derived = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: MAX_MEM,
    });

    // Lengths are equal by construction above, but timingSafeEqual throws if not.
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** True when a stored hash used weaker parameters than the current policy. */
export function needsRehash(stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return true;
  return Number(parts[1]) < N || Number(parts[2]) < R;
}

/**
 * A deliberate dummy verification, run when an email doesn't exist.
 *
 * Without it, "no such user" returns in ~1 ms while a real user costs ~150 ms,
 * and that timing difference alone enumerates valid accounts.
 */
export async function fakeVerify(): Promise<void> {
  await scrypt("pmpl-timing-equaliser", randomBytes(SALT_LENGTH), KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: MAX_MEM,
  });
}

// ---------------------------------------------------------------------------
//  Strength assessment
// ---------------------------------------------------------------------------

/**
 * Re-exported from a runtime-agnostic module so the browser meter and this
 * server-side gate apply the identical rule. The scoring itself can't live here:
 * this file is `server-only` and imports `node:crypto`.
 */
export { assessPassword, isPasswordAcceptable, type PasswordStrength } from "@/lib/auth/password-strength";
