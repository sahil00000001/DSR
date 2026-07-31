# Deployment

Deploying Cadence to Vercel with Supabase Postgres, Gmail SMTP, Google OAuth and
cron.

---

## 1. Database — Supabase Postgres

You need **two** connection strings. This is the step that most often goes wrong,
so it's worth being precise about why.

Both come from the **same pooler host**, differing only in port and flags:

| Variable | Port | Mode | Used by |
| --- | --- | --- | --- |
| `DATABASE_URL` | **6543** | transaction (pgbouncer) | the running app |
| `DIRECT_URL` | **5432** | session | `prisma migrate` / `db push` |

**Why two.** A serverless function opens a database connection per invocation, so a
direct connection limit is exhausted almost immediately under real traffic — and the
symptom is random 500s, not anything that looks like a configuration problem.
Transaction-mode pooling exists for exactly this. But transaction mode can't hold the
session state Prisma's DDL needs, so migrations use session mode on port 5432.

**`DIRECT_URL` is not optional.** `prisma/schema.prisma` references it as
`directUrl`, and Prisma errors when a referenced datasource variable is missing —
including during the Vercel build's `prisma generate`. Set it even if you never run a
migration on the server.

`lib/env.ts` warns at boot if `DATABASE_URL` doesn't look pooled in production.

### Getting the strings

Supabase dashboard → **Connect** (button at the top of the project page) →
**Connection pooling** tab. Copy the URI:

```
postgresql://postgres.<project-ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:6543/postgres
```

Then build both variables from it:

```bash
# runtime — append Prisma's pooler flags
DATABASE_URL=".../postgres?pgbouncer=true&connection_limit=1"     # port 6543

# migrations — same host, swap the port, no flags
DIRECT_URL="...:5432/postgres"
```

Note the username is `postgres.<project-ref>`, not plain `postgres` — the pooler
routes tenants by username.

The password is under **Project Settings → Database → Database password**. If you've
lost it, reset it there. The API keys (`sb_secret_…`, `sb_publishable_…`) are **not**
the database password.

> **Percent-encode special characters in the password**, or the URL won't parse:
> `@` → `%40`, `#` → `%23`, `:` → `%3A`, `/` → `%2F`, `?` → `%3F`, `&` → `%26`.
> A password like `Pass@word1` becomes `Pass%40word1`.

> **Don't use `db.<ref>.supabase.co`.** Newer Supabase projects don't publish that
> hostname at all — it has no DNS record — or publish it IPv6-only. The pooler on
> port 5432 replaces it completely.

### Create the schema

```bash
npm run db:push      # uses DIRECT_URL
npm run db:seed      # 20 people, ~95 days of history
```

For a real deployment, prefer versioned migrations over `db:push`:

```bash
npx prisma migrate dev --name init      # once, locally — commit the output
npx prisma migrate deploy               # in CI / on the server
```

---

## 2. Environment variables

Set these in **Vercel → Project → Settings → Environment Variables**.

### Required

```bash
DATABASE_URL="postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres:<PASSWORD>@<direct-host>:5432/postgres?sslmode=require"

# Generate a fresh one — never reuse the development value:
#   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
AUTH_SECRET="<48+ random bytes>"

NEXT_PUBLIC_APP_URL="https://your-app.vercel.app"
NEXT_PUBLIC_DEMO_MODE="false"
```

`NEXT_PUBLIC_DEMO_MODE="false"` hides the seeded credentials from the sign-in
screen. Leaving it `true` in production publishes three working logins.

### Email — Gmail SMTP

```bash
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="465"
SMTP_SECURE="true"
SMTP_USER="you@gmail.com"
SMTP_PASSWORD="<16-char app password, no spaces>"
EMAIL_FROM="Cadence <you@gmail.com>"
```

1. Enable 2-Step Verification on the Google account.
2. Create an app password at <https://myaccount.google.com/apppasswords>.
3. Enter it **without spaces** — Google displays it in groups of four.

`EMAIL_FROM` must use the same mailbox as `SMTP_USER`. Gmail rejects a `From`
address that isn't the authenticated account.

Gmail's relay allows roughly 500 messages/day and throttles bursts, which is why
`sendBulkEmail` sends in batches of five with a short pause. Comfortable for 20
people; for hundreds, move to a transactional provider (Resend, SES, Postmark) —
only `lib/email/mailer.ts` changes.

If SMTP is left unset the app still runs: messages are rendered and written to the
server log instead of sent, and the Settings screen says so.

### Google OAuth (optional)

```bash
GOOGLE_CLIENT_ID="<id>.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="<secret>"
GOOGLE_ALLOWED_DOMAINS="yourcompany.com"    # optional allow-list
```

In <https://console.cloud.google.com/apis/credentials>, create an **OAuth 2.0
Client ID** of type *Web application* and add the authorised redirect URI:

```
https://your-app.vercel.app/api/auth/google/callback
```

Add `http://localhost:3000/api/auth/google/callback` too if you want it locally.

The "Continue with Google" button only appears when both halves are set.
`GOOGLE_ALLOWED_DOMAINS` stops a personal Gmail signing in to a work workspace.

**OAuth never creates an account.** The email must already belong to an active
employee, so sign-in can't be used to self-provision access.

### Cron

```bash
CRON_SECRET="<random string>"
```

Required. Without it the reminder endpoint refuses every request rather than
running open — anyone who guessed the path could otherwise email the whole team.

---

## 3. Function region — co-locate with the database

`vercel.json` pins `"regions": ["bom1"]` (Mumbai) to match the Supabase project in
`ap-south-1`. **This is the single largest performance factor in this app.**

Vercel defaults to `iad1` (Washington DC). With the database in Mumbai, that
configuration produced:

```
X-Vercel-Id: bom1::iad1::...     request entered at Mumbai, executed in Washington
GET /api/health -> latencyMs: 187    for a single SELECT 1
```

187 ms for one trivial query is not query cost, it is 12,000 km of fibre. Pages here
issue tens of queries, and while they are batched with `Promise.all`, the waves are
serialised by the pool size — so the round trip is paid several times per page. That
is what "the whole app feels slow" was.

Co-located, the same query is ~2–5 ms.

**If you move the database, change this too.** The two must agree; a mismatch is
invisible in the code and shows up only as uniform slowness. Confirm with:

```bash
curl -sI https://<your-app>.vercel.app/api/health | grep -i x-vercel-id
# want both segments equal, e.g. bom1::bom1::...
```

Region can also be set in Vercel → Settings → Functions → Function Region; the
`vercel.json` value is authoritative when present.

Available regions are listed at https://vercel.com/docs/regions — pick the one
matching your Supabase project (Supabase → Settings → General → Region).

---

## 3. Deploy

```bash
npm i -g vercel
vercel link
vercel --prod
```

Or connect the Git repository in the Vercel dashboard and push.

`vercel.json` already sets the build command (`prisma generate && next build`), so
the Prisma client is generated with the deployment's own environment.

---

## 4. Deploy

_(previously section 3)_

## 5. Scheduled reminders

`vercel.json` registers one cron job:

```json
{ "path": "/api/cron/reminders", "schedule": "30 12 * * 1-5" }
```

**12:30 UTC, Monday–Friday** — 6:00 pm IST, late enough in the working day for a
report reminder to be useful. Adjust for your timezone; Vercel Cron always
schedules in UTC.

The job:
- skips weekends and public/company holidays entirely
- notifies only people with no submitted report for the day, who aren't on leave
  and haven't opted out
- sends a separate attendance nudge to anyone with no attendance record
- prunes read notifications older than 60 days and expired tokens

It's idempotent — safe to run twice. A retry after a partial failure sends the
remainder rather than duplicating.

Test it manually:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.vercel.app/api/cron/reminders
```

> Cron is a Vercel Pro feature. On Hobby, call the same endpoint from any external
> scheduler (GitHub Actions, cron-job.org) with the same `Authorization` header.

---

## 5. Post-deploy checklist

- [ ] `/login` renders and the demo credentials block is **hidden**
- [ ] Sign in with the seeded admin
- [ ] Settings → *About this workspace* reports email as **configured**
- [ ] Submit a status report; confirm attendance is marked automatically
- [ ] Request leave as an employee, approve it as their manager, confirm the email
      arrives and the balance moved
- [ ] Export DSR to Excel; confirm it opens and dates are real dates, not numbers
- [ ] ⌘K finds a person
- [ ] Install the PWA on a phone; confirm the icon and the offline page
- [ ] Audit log shows your sign-in and the export
- [ ] Trigger the cron endpoint manually and check the response counts

---

## 6. First-run setup for a real team

The seeded demo data is not a starting point for a real installation.

```bash
# Point at the production database, then:
npx prisma migrate deploy       # schema only — no seed
```

Then create the first admin. The quickest safe route is Prisma Studio:

```bash
npx prisma studio
```

1. **Location** → add your office(s).
2. **Department** → add your departments.
3. **User** → create yourself: `role = ADMIN`, `status = ACTIVE`, a unique
   `employeeCode`, and leave `passwordHash` empty.
4. On the deployed app use **Forgot password** to set your own password. That path
   issues a hashed single-use token and emails it — no password is ever typed into
   the database.

From there, add everyone through **People → Add** in the app. Each person receives
an invitation to choose their own password.

Finally, populate **Settings → Holiday calendar**. It isn't cosmetic: those dates
determine what counts as a working day, and therefore leave durations, expected
report counts and attendance inference.

---

## 7. Troubleshooting

| Symptom | Cause |
| --- | --- |
| `Invalid environment configuration` at boot | A required variable is missing or `AUTH_SECRET` is under 32 characters. The error names the field. |
| `Can't reach database server` | Wrong host, or the password isn't percent-encoded |
| Random 500s under light load | `DATABASE_URL` is the direct connection, not the pooler |
| `prisma migrate` hangs or errors on DDL | Migrating through the pooler — use `DIRECT_URL` |
| Emails silently not arriving | App password entered with spaces, or `EMAIL_FROM` doesn't match `SMTP_USER` |
| Google sign-in returns `oauth_state` | Redirect URI mismatch, or the 10-minute state cookie expired |
| Google returns `oauth_no_account` | Working as intended — the address has no employee record |
| Everyone signed out after deploy | `AUTH_SECRET` changed. Existing session tokens can no longer be verified. |
| Cron returns 401 | `CRON_SECRET` not set in the environment, or header mismatch |
