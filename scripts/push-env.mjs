/**
 * Pushes every variable in VERCEL-ENV.txt to Vercel in one command.
 *
 *   node scripts/push-env.mjs                  # production
 *   node scripts/push-env.mjs preview          # preview too
 *
 * Requires the Vercel CLI, signed in and linked:
 *   npm i -g vercel && vercel login && vercel link
 *
 * If this fails for any reason, the fallback is always available: open
 * VERCEL-ENV.txt and paste the whole block into
 * Vercel → Settings → Environment Variables (its input accepts a full .env).
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = join(ROOT, "VERCEL-ENV.txt");
const target = process.argv[2] ?? "production";

if (!existsSync(ENV_FILE)) {
  console.error("✗ VERCEL-ENV.txt not found. Nothing to push.");
  process.exit(1);
}

if (!existsSync(join(ROOT, ".vercel", "project.json"))) {
  console.error(
    "✗ This directory isn't linked to a Vercel project yet.\n" +
      "  Run:  vercel link      (then re-run this script)",
  );
  process.exit(1);
}

/**
 * Parses `KEY=VALUE` lines. Deliberately naive about the value: everything after
 * the first `=` is taken verbatim, because connection strings legitimately contain
 * `=`, `&` and `?`, and quoting them would be a source of silent corruption.
 */
const variables = readFileSync(ENV_FILE, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => {
    const separator = line.indexOf("=");
    return { key: line.slice(0, separator), value: line.slice(separator + 1) };
  })
  .filter((entry) => entry.key);

console.log(`\nPushing ${variables.length} variables to "${target}"…\n`);

let added = 0;
let failed = 0;

for (const { key, value } of variables) {
  // Remove any existing value first; `env add` on an existing key otherwise
  // errors rather than overwriting, which would abort the run halfway.
  spawnSync("vercel", ["env", "rm", key, target, "--yes"], {
    cwd: ROOT,
    stdio: "ignore",
    shell: true,
  });

  const result = spawnSync("vercel", ["env", "add", key, target], {
    cwd: ROOT,
    // The CLI reads the value from stdin when it isn't a TTY.
    input: `${value}\n`,
    encoding: "utf8",
    shell: true,
  });

  if (result.status === 0) {
    added += 1;
    // Never echo a secret back to the terminal.
    const preview = value.length > 12 ? `${value.slice(0, 6)}…(${value.length} chars)` : value;
    console.log(`  ✓ ${key.padEnd(24)} ${key.includes("SECRET") || key.includes("PASSWORD") || key.includes("URL") ? preview : value}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${key.padEnd(24)} ${(result.stderr || "").trim().split("\n")[0] ?? "failed"}`);
  }
}

console.log(
  `\n${failed === 0 ? "✓" : "⚠"} ${added} set${failed ? `, ${failed} failed` : ""}.\n` +
    (failed
      ? "  For the failures, paste VERCEL-ENV.txt into the Vercel dashboard instead.\n"
      : "  Next:  vercel --prod\n"),
);

process.exit(failed === 0 ? 0 : 1);
