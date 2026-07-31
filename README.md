# Cadence

**The operating rhythm for your team.**

A team operations portal for a 15–20 person company: daily status reports,
attendance, leave, a people directory, and the analytics that come out of them.

Built as a production application rather than a prototype — real authentication,
role-based authorisation enforced server-side, transactional business rules, an
audit trail, transactional email, and exports that open cleanly in Excel.

---

## Quick start

```bash
# 1. Install
npm install

# 2. Configure — copy the example and fill in DATABASE_URL + AUTH_SECRET
cp .env.example .env

# 3. Create the schema
npm run db:push

# 4. Seed a workspace: 20 people, ~95 days of history
npm run db:seed

# 5. Run
npm run dev            # http://localhost:3000
```

### Demo accounts

The seed creates 20 employees. Three of them cover the three access levels:

| Email | Role | What they see |
| --- | --- | --- |
| `aisha.khan@cadence.dev` | Admin | Everything: people, approvals, analytics, audit log, settings |
| `rohan.mehta@cadence.dev` | Manager | Reviews reports and approves leave for their own reporting line |
| `diya.sharma@cadence.dev` | Employee | Their own reports, attendance and leave |

Password for every demo account: **`Cadence#2026`**

The sign-in screen lists these while `NEXT_PUBLIC_DEMO_MODE="true"`. Set it to
`false` for any real installation.

---

## What's in it

### Daily status reports — the core

- Markdown composer with a formatting toolbar, live preview, and list continuation
  on <kbd>Enter</kbd>
- **Offline drafts** — every keystroke is mirrored to `localStorage`, keyed by
  date, and offered back if the tab closes or the connection drops
- Draft and submit are separate verbs, so nobody is afraid of the save button
- Submitting a report marks that day present automatically, if nothing is recorded
- **Bulk review board**: filter by person, department, team, location, manager,
  status and date; group by person/day/department/status; expand or collapse;
  select many and review or flag in one action
- Every filter lives in the URL, so a view is shareable and survives a refresh
- Export the current filter to CSV or Excel; print any screen to PDF

### Attendance

- Present / WFH / half day self-service, with check-in and check-out times
- Month calendar with per-day status, colour **and** a letter (P/W/½/L/A)
- Team board: a people × days heat grid, with admin correction on any cell
- **Absence is inferred, never stored** — a past working day with no record and no
  approved leave *is* an absence, so no nightly job can silently corrupt the register

### Leave

- Casual / sick / earned (5 days each) plus unlimited unpaid
- Duration is **working days**: weekends and public holidays are never counted or
  deducted, and the form shows the exact figure before you submit
- Pending requests reserve balance, so two overlapping requests can't both be
  approved past the entitlement
- Approving writes the matching attendance rows; cancelling removes them again
- Nobody can approve their own request — at any role, including admin

### People & organisation

- Directory with card and table views, filters, and CSV/Excel export
- Departments, teams, office locations, reporting lines
- Onboarding sends an invitation to set a password — **no temporary password is
  ever generated, stored or emailed**
- Deactivation over deletion: signs the person out everywhere while keeping their
  history intact for reporting

### Analytics & reporting

- Completion trend, hours logged, attendance mix, leave by type, department activity
- Completion per person, with expected days adjusted for holidays **and** each
  person's own approved leave
- Six export datasets, each in CSV and Excel, all audited

### Everywhere

- **⌘K command palette** — global search across people, reports, departments and
  leave, plus jump-to-page. Results are scoped to what you're allowed to see.
- Notification tray, email notifications, announcements
- Team calendar: holidays, who's off, birthdays, work anniversaries
- Audit log of every state change, with secrets redacted before writing
- Light and dark themes, no flash on load
- Installable PWA with an offline fallback
- Full keyboard navigation, focus trapping in dialogs, `aria-live` announcements

---

## Stack

| | |
| --- | --- |
| Framework | Next.js 15 (App Router, Server Components, Server Actions) |
| Language | TypeScript, `strict` |
| Styling | Tailwind CSS v4 with a token-based design system |
| Database | PostgreSQL via Prisma 6 |
| Auth | Hand-rolled sessions: `jose` JWT in an httpOnly cookie + a server-side session registry |
| Passwords | Node's built-in `scrypt` (memory-hard, OWASP parameters) |
| Charts | Recharts, with a CVD-validated palette |
| Email | Nodemailer over Gmail SMTP |
| Exports | Zero-dependency CSV and XLSX writers |

**Runtime dependencies: 11.** No component library, no auth framework, no state
manager, no spreadsheet library, no date library beyond what's needed. Each
omission is a deliberate call documented at the point it was made.

---

## Scripts

```bash
npm run dev          # Development server
npm run build        # prisma generate && next build
npm run start        # Serve the production build
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run format       # Prettier

npm run db:push      # Apply the schema (no migration files)
npm run db:seed      # Seed demo data
npm run db:reset     # Wipe, re-apply, re-seed
npm run db:studio    # Prisma Studio
```

Regenerate the PWA icons after changing the brand mark:

```bash
node scripts/generate-icons.mjs
```

---

## Project layout

```
prisma/
  schema.prisma          Data model — provider-portable by design
  seed.ts                Deterministic demo-data generator
  seed-data.ts           The content it draws from

src/
  app/
    (auth)/              Sign in, forgot/reset password — split-panel layout
    (app)/               Everything behind authentication
    api/                 OAuth callbacks, search, notifications, exports, cron
    layout.tsx           Root: fonts, theme, providers, skip link

  components/
    ui/                  Design-system primitives (button, dialog, table, …)
    charts/              Chart frame, trend/bar/donut, sparkline, heat grid
    layout/              Sidebar, top bar, command palette, navigation
    dsr/ leave/ …        Feature components

  lib/
    auth/                Sessions, scrypt, RBAC policy, OAuth, rate limiting
    services/            Read-side queries, one module per domain
    validation/          Zod schemas — every write passes through here
    export/              CSV + XLSX writers, dataset definitions
    charts/              Validated colour palette
    utils/               Calendar days, formatting, Markdown

  server/actions/        Server Actions — the entire write surface
  types/                 DTOs shared across the server/client boundary
```

---

## Documentation

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — how it's put together, and
  why the notable decisions went the way they did
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — deploying to Vercel with
  Supabase, Gmail SMTP, Google OAuth and cron

---

## Security posture

| Concern | How it's handled |
| --- | --- |
| Password storage | `scrypt`, N=2¹⁶, r=8 (≈64 MB per hash); parameters stored with the hash so they can be raised later |
| Sessions | Signed JWT pointing at a database row — revocation and account disabling take effect on the *next request*, not at token expiry |
| Authorisation | One policy module (`lib/auth/rbac.ts`); enforced server-side in every action and query. Hidden buttons are presentation, never the gate. |
| Account enumeration | Wrong password, unknown email and disabled account return an identical message, and the unknown-email path burns equivalent CPU so timing doesn't leak either |
| Brute force | Per-email+IP rate limiting, plus ~150 ms of scrypt per attempt |
| XSS | User Markdown is parsed to a typed AST and rendered as React elements. `dangerouslySetInnerHTML` appears exactly once, on a fixed literal (the no-flash theme script). |
| CSRF | Server Actions carry Next's origin check; hand-written mutating endpoints assert it explicitly; `SameSite=Lax` cookies |
| Reset tokens | Only a SHA-256 hash is stored; single-use consumption is an atomic conditional update |
| Spreadsheet injection | CSV cells beginning `= + - @` are prefixed so Excel treats them as text |
| Open redirect | Post-login and OAuth destinations are validated as same-site paths |
| Audit trail | Every state change recorded; password, token and hash fields redacted before writing |

---

## Known limits

Stated plainly, because a "production-ready" claim is only worth something with
the boundaries attached:

1. **Rate limiting is per-instance.** In-memory counters, so on serverless the
   effective limit is `limit × warm instances`. Enough to blunt a casual script,
   not a distributed one. `lib/auth/rate-limit.ts` is the single file to swap for
   Redis.
2. **Notifications poll, they don't push.** Every 45 s while the tab is visible,
   paused when hidden. A deliberate trade at this team size; swapping in SSE means
   changing one hook.
3. **PDF export is the browser's print pipeline**, driven by a print stylesheet —
   not a server-side renderer. Keeps a ~50 MB headless Chromium out of the
   deployment; the trade is that page breaks follow the browser's judgement.
4. **DSR attachments are modelled but not wired to storage.** The `Attachment`
   table and relations exist; the upload endpoint is intentionally absent rather
   than half-built. Supabase Storage credentials are already validated in
   `lib/env.ts` for when it's added.
5. **No automated test suite.** The XLSX writer and the colour palette were
   verified by running them (see ARCHITECTURE); everything else was verified by
   `tsc`, ESLint and a production build. Adding Vitest is the first thing I'd do
   with more time.
