# Architecture

How Cadence is put together, and why the decisions that could reasonably have gone
another way went the way they did.

---

## 1. Layering

```
Server Component (page)
        │  awaits
        ▼
lib/services/*          ← read side. Queries + role scoping. `server-only`.
        │
        ▼
     Prisma  ──────────────────────────────►  PostgreSQL
        ▲
        │
server/actions/*        ← write side. Validate → authorise → transact → audit → revalidate.
        ▲  invoked by
        │
Client Component (form / table / chart)
```

Four rules hold this together:

1. **Reads go through `lib/services`, writes go through `server/actions`.** No page
   queries Prisma directly, and no service mutates. When you want to know "what can
   this person see", there is one place to look.
2. **Every service takes an `Actor`** and applies its own scoping. Scoping is never
   the caller's responsibility — that's how a new list view ends up leaking rows.
3. **Every action validates with Zod before doing anything else.** `parseFormData`
   is the single entry point for form payloads.
4. **DTOs that cross to the client live in `src/types`.** `lib/services` is
   `server-only`; putting the shapes in a neutral module makes the boundary
   explicit rather than incidental.

---

## 2. Authentication: two gates, on purpose

```
Request
  │
  ├─ Edge middleware ─── verify JWT signature ─── no DB ─── bounce anonymous traffic
  │
  └─ (app)/layout.tsx ── getCurrentUser() ────── DB ────── the real authorisation boundary
```

Middleware runs on the edge and only checks the cookie's **signature**. That's
cheap and correct for what it does: turn "anonymous user hits /dashboard" into a
redirect instead of a wasted render.

It is deliberately *not* the authorisation boundary. `getCurrentUser()` additionally
loads the `Session` row and the user's current status, which is what makes two
things work:

- **Revocation is immediate.** "Sign out everywhere" and disabling an account take
  effect on the next request, not whenever the token happens to expire.
- **Role changes are immediate.** The JWT carries a role for display, but no
  decision is ever made from it.

A stateless-JWT-only design would have been less code and would have made both of
those impossible.

### Why hand-rolled rather than a framework

The session model needed to be a pointer to a revocable row, and the flow needed
to work with Server Actions and Edge middleware. Wiring an adapter to do that
meant carrying a second source of truth about who is signed in. Doing it directly
is roughly 300 lines across four files (`jwt`, `session`, `password`, `google`),
each of which does exactly one thing.

### Why scrypt rather than bcrypt

The realistic choices without a native build step were pure-JS bcrypt or Node's
built-in `scrypt`.

Pure-JS bcrypt at a *safe* cost factor takes over a second per hash, which pushes
implementers toward unsafely low cost factors. `scrypt` ships in Node's standard
library, runs natively, and is memory-hard — the property that makes GPU cracking
expensive and that PBKDF2 lacks. Parameters (N=2¹⁶, r=8, p=1) travel with each
hash, so they can be raised later and `needsRehash()` upgrades rows transparently
on next sign-in.

---

## 3. Calendar days are UTC midnight, always

DSR, attendance and leave are keyed by *calendar day*, not by an instant. Storing
those as local-midnight timestamps is the classic source of off-by-one-day bugs: a
record written at midnight IST reads back as the previous day for a viewer in
New York.

So: **every calendar day is normalised to UTC midnight, and only ever read back
with UTC accessors.** All arithmetic in `lib/utils/date.ts` is pure UTC
millisecond maths, which also makes it immune to DST transitions. Display goes
through `Intl.DateTimeFormat` with `timeZone: "UTC"`.

The distinction is enforced by the API surface: `formatDay()` for calendar days,
`formatDateTime()` for instants. Mixing them is a visible mistake rather than a
silent one.

---

## 4. Business rules that live in the database, not in prose

### Balance invariant

```
allocated = used + pending + available
```

Requesting leave moves days into `pending`; approving moves them `pending → used`;
rejecting or cancelling releases them. Each transition runs inside a
`$transaction` **with** the status change, so a crash can't leave balance reserved
against a request that no longer exists.

`pending` is what stops two overlapping requests from both being approved past the
entitlement — a pure `allocated - used` model can't.

### Absence is inferred

There is no "absent" row. A past working day with no attendance record, no public
holiday and no approved leave *is* an absence, resolved by `resolveDay()` in
`lib/services/attendance.ts`.

This removes an entire class of failure: no midnight job has to run to mark people
absent, and a job that fails can't corrupt the register. It also means holidays
added retroactively immediately correct the history.

### One report per person per day

A composite unique index on `(userId, date)`, which makes `upsert` the natural
operation and makes concurrent submissions safe without application locking.

### Self-approval is refused, not hidden

`can.decideLeave()` returns false for your own request at every role, including
admin. In a 20-person org where the admin is also staff, the separation matters
more than the convenience — and the server refuses it rather than relying on a
hidden button.

---

## 5. Server state in the URL, device state in localStorage

A rule applied consistently:

| Kind of state | Where it lives | Why |
| --- | --- | --- |
| Filters, grouping, sort, page, date range | URL search params | Shareable, survives refresh, back button correct, and the *server* does the filtering |
| Sidebar collapsed, directory card-vs-table | Cookie / localStorage | A per-device preference nobody wants in a shared link |
| Report drafts | localStorage, keyed by date | Must survive a closed tab and a dropped connection |
| Theme | Cookie **and** a user column | Cookie so the server renders the right class with no flash; column so a new device inherits the choice |

The sidebar uses a cookie rather than localStorage specifically so the server
renders the correct width on first paint — with localStorage it would visibly snap
from 252 px to 68 px after hydration on every load.

---

## 6. XSS is structurally impossible in report bodies

DSR bodies are Markdown. Rather than a parser plus a sanitiser plus
`dangerouslySetInnerHTML` — and the ongoing question of whether the sanitiser is
configured correctly — `lib/utils/markdown.ts` parses a deliberate subset into a
**typed AST**, and `components/markdown-view.tsx` renders it as ordinary React
elements.

User-authored text only ever becomes a text node or a known element type. Link
`href`s are restricted to `http(s):`, `mailto:` and root-relative paths.

`dangerouslySetInnerHTML` appears exactly once in the codebase: the no-flash theme
script, on a fixed literal with no interpolation.

---

## 7. Colour was computed, not chosen

The categorical chart palette isn't eyeballed. The eight hues were run through a
CVD validator (Machado–Oliveira–Fernandes simulation at severity 1.0, ΔE measured
in OKLab ×100), and the **assignment order** was chosen by exhaustive search over
orderings to maximise the worst adjacent-pair separation.

```
Order:  indigo → emerald → violet → amber → teal → orange → sky → rose

Worst adjacent ΔE:   15.1 (light)   15.4 (dark)     target ≥ 8.0
```

Dark mode was re-stepped from the same hues rather than flipped — the dark
lightness band (0.48–0.67) is different, and the naive inversion failed both the
band check and CVD separation.

Two consequences in the code:

- `seriesColorFor(key)` hashes a **stable entity id**, so filtering a series out
  never repaints the survivors.
- Slots are never cycled. Past eight categories, `withOtherBucket()` folds the tail
  into "Other" rather than reusing an indistinguishable hue.

Light-mode amber sits at 2.35:1 against white — below the 3:1 relief threshold.
Every chart therefore ships a legend **and** a table view (`ChartFrame`), which is
the required mitigation, not a nice-to-have.

Stacked bars are avoided where separation matters: SVG stacking can only be
separated with a stroke around each segment, and a stroke adds ink that isn't data.
Grouped bars get a real 2 px surface gap; part-to-whole uses `CompositionBar`,
built from flex children with genuine gaps.

---

## 8. Dependencies not taken

Eleven runtime dependencies. The omissions were each a decision:

| Not used | Instead | Reasoning |
| --- | --- | --- |
| Radix / shadcn / MUI | ~20 primitives in `components/ui` | Every one is used and understood; no unused surface, no theme-override fight. Accessibility contracts implemented directly: focus trap, roving tabindex, type-ahead menus, `aria-live`. |
| NextAuth / Auth.js | `lib/auth/*` | The session model had to be a revocable row (§2) |
| bcrypt / bcryptjs | `node:crypto` scrypt | Native speed without a native build (§2) |
| `xlsx` / `exceljs` | `lib/export/xlsx.ts` | ~150 lines for one sheet with typed cells, against ~1 MB and a history of advisories in published builds |
| `sharp` | `scripts/generate-icons.mjs` | PNG is a signature plus three chunks; `zlib` does the rest. Avoids a ~30 MB native dependency for six build-time files. |
| Puppeteer / Playwright | Print stylesheet | A headless Chromium would push the function past its size limit |
| TanStack Table | `components/ui/data-table.tsx` | Sorting, selection and responsive column hiding, on a real `<table>` |
| A state manager | Server Components + `useActionState` | The server is the state |

Both hand-rolled writers were **verified by running them**, not assumed: the XLSX
output was unzipped and its sheet XML parsed to confirm valid structure, Unicode
preservation and the correct Excel date serial; the PNGs were decoded and rendered.

---

## 9. Portability

The Prisma schema avoids native enums and JSON columns, using `String` plus
application-level unions (`lib/constants/enums.ts`) validated by Zod at every write
boundary. The guarantee a database enum would give you is preserved in the layer
where the error message is actually useful to the person filling in the form.

The practical benefit: the schema runs unchanged on PostgreSQL and on SQLite
(`provider = "sqlite"`, `DATABASE_URL="file:./dev.db"`) for offline development,
with no migration rewrite. `containsInsensitive()` in `lib/db/prisma.ts` resolves
the one behavioural difference that matters — `LIKE` case sensitivity — so search
code doesn't need to know which database it's talking to.

---

## 10. Failure is designed for

- **Side effects never fail the operation.** `recordAudit` and `notify` swallow
  their errors and report to the logger. A logging outage that blocked leave
  approvals would be a worse bug than the missing log line.
- **Email never throws.** `sendEmail` retries with backoff, gives up on permanent
  5xx, and returns a result. A notification failing to send doesn't roll back the
  request that triggered it.
- **Errors are translated at the boundary.** `toUserMessage()` returns the safe
  message for known errors and a generic one for anything else, logging the
  original. Route boundaries show the `digest` — the server-side correlation id —
  so a report is actionable without exposing a stack trace.
- **Filters degrade, they don't crash.** `parseSearchParams` falls back to defaults,
  so a hand-edited URL shows the default view rather than an error page.
- **`redirect()` is always called outside `try/catch`.** Next implements it by
  throwing a control-flow signal; catching it would turn a successful sign-in into
  a generic error.
