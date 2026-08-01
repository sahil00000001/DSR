/**
 * Run with: npm run check:policy
 *
 * The gate that decides whether an email goes out now or waits for the end-of-day briefing.
 * Worth asserting rather than eyeballing, because both failure directions are invisible in
 * normal use: too permissive just looks like a busy mailbox, and too strict looks like
 * nothing happening at all until somebody misses an approval.
 *
 * `--conditions=react-server` is what lets this import a module carrying `server-only`.
 */
import { emailableNow, isDigestOnly, shouldEmailNow } from "../src/lib/email/policy";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) {
    pass += 1;
    console.log(`  OK  ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
};

const everything = { notifyByEmail: true, emailDigestOnly: false };
const digestOnly = { notifyByEmail: true, emailDigestOnly: true };
const noEmail = { notifyByEmail: false, emailDigestOnly: false };
const noEmailButDigest = { notifyByEmail: false, emailDigestOnly: true };

console.log("\n=== Email off wins over everything ===");
check("routine is withheld", shouldEmailNow(noEmail, "routine") === false);
check("and so is urgent", shouldEmailNow(noEmail, "urgent") === false);
check(
  "digest-only does not resurrect a disabled mailbox",
  shouldEmailNow(noEmailButDigest, "urgent") === false,
);

console.log("\n=== Digest-only holds back the routine, not the urgent ===");
check("routine waits for the briefing", shouldEmailNow(digestOnly, "routine") === false);
check("urgent still goes out at once", shouldEmailNow(digestOnly, "urgent") === true);

console.log("\n=== Everything-now is unaffected ===");
check("routine sends", shouldEmailNow(everything, "routine") === true);
check("urgent sends", shouldEmailNow(everything, "urgent") === true);

console.log("\n=== Routine is the default urgency ===");
/*
 * The default has to be the *cautious* one. A call site that forgets the argument should
 * quieten the mailbox, not bypass the preference — the whole point of the feature.
 */
check("an omitted urgency is treated as routine", shouldEmailNow(digestOnly) === false);
check("and still sends to somebody who wants everything", shouldEmailNow(everything) === true);

console.log("\n=== Filtering a list keeps the caller's own fields ===");
const people = [
  { id: "a", name: "Anil", email: "anil@example.test", ...digestOnly },
  { id: "b", name: "Bina", email: "bina@example.test", ...everything },
  { id: "c", name: "Chandra", email: "chandra@example.test", ...noEmail },
];

const routine = emailableNow(people, "routine");
check("only the everything-now person is left", routine.length === 1 && routine[0]!.id === "b", routine.map((p) => p.id).join(","));
check(
  "the returned objects are the originals, not narrowed to the interface",
  routine[0]!.email === "bina@example.test",
  routine[0]!.email,
);

const urgent = emailableNow(people, "urgent");
check(
  "urgent reaches both people who have email on",
  urgent.length === 2 && urgent.map((p) => p.id).join(",") === "a,b",
  urgent.map((p) => p.id).join(","),
);

console.log("\n=== isDigestOnly is about explaining the batching ===");
/*
 * Used only to decide whether the briefing email explains why things were held back. Somebody
 * with email switched off never receives that email, so their flag is immaterial — but it must
 * not report `true` for the everything-now person, who would be told about batching that is
 * not happening to them.
 */
check("true for the batched recipient", isDigestOnly(digestOnly) === true);
check("false for the everything-now recipient", isDigestOnly(everything) === false);

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
