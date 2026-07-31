/**
 * Password strength assessment — shared by the client meter and the server gate.
 *
 * Split out of `password.ts` on purpose: that module imports `node:crypto` and is
 * marked `server-only`, so a client component can't touch it. Keeping the pure
 * scoring here means the browser and the server apply *exactly* the same rule,
 * rather than two implementations that drift apart.
 */

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: "Too weak" | "Weak" | "Fair" | "Good" | "Strong";
  /** The single most useful next improvement. */
  suggestion?: string;
}

/** The most-abused passwords — rejected regardless of length or composition. */
const BANNED = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "qwerty123",
  "letmein",
  "welcome1",
  "admin123",
  "iloveyou",
  "changeme",
  "pooja123",
  "poojamachines",
]);

const LABELS: Record<PasswordStrength["score"], PasswordStrength["label"]> = {
  0: "Too weak",
  1: "Weak",
  2: "Fair",
  3: "Good",
  4: "Strong",
};

export function assessPassword(password: string): PasswordStrength {
  const value = password.trim();

  if (value.length < 8) {
    return { score: 0, label: "Too weak", suggestion: "Use at least 8 characters." };
  }
  if (BANNED.has(value.toLowerCase())) {
    return { score: 0, label: "Too weak", suggestion: "That password is too common." };
  }

  let score = 0;
  // Length carries the most weight — it's the property that actually matters.
  if (value.length >= 10) score += 1;
  if (value.length >= 14) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^\w\s]/.test(value)) score += 1;
  // Repeats and keyboard runs add length without adding entropy.
  if (/(.)\1{2,}/.test(value) || /(abc|123|qwe)/i.test(value)) score -= 1;

  const clamped = Math.max(0, Math.min(4, score)) as PasswordStrength["score"];

  const suggestion =
    clamped >= 3
      ? undefined
      : value.length < 14
        ? "A longer passphrase is the easiest way to strengthen this."
        : !/[^\w\s]/.test(value)
          ? "Add a symbol."
          : "Mix in upper and lower case.";

  return { score: clamped, label: LABELS[clamped], suggestion };
}

/** The minimum the server is willing to store. */
export function isPasswordAcceptable(password: string): boolean {
  return assessPassword(password).score >= 2;
}
