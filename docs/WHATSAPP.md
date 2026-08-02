# WhatsApp order summaries

The works manager wanted one thing: at the end of the day, on WhatsApp, where every order
stands. This document is how that is set up, what it costs, and why it is built the way it
is.

---

## What it costs — the short version

**₹0 to ₹4 a month.** Not a promotional rate; it falls out of how Meta prices the
platform.

| Situation | Cost |
| --- | --- |
| Admin texts `STATUS`, app replies | **₹0** — unlimited, forever |
| 6pm push on a day the admin has messaged | **₹0** |
| 6pm push on a day he has not | ₹0.115 + 18% GST = **₹0.1357** |
| Worst case: 30 pushes, admin never replies | **₹4.07/month** (₹49/year) |

Two rules from [Meta's pricing docs](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
make this work:

> "All non-template messages are free"
>
> "Utility templates delivered within an open customer service window are free"

A **24-hour customer service window** opens the moment the admin messages the business
number. Inside it, anything we send is free. So the app is built to prefer that path:

```
window open   → the full multi-line report, free-form text        ₹0
window closed → a short template with counts + "reply STATUS"     ₹0.1357
                └─ his reply opens a window, so tomorrow is free
```

That is also why the closed-window message is deliberately a teaser rather than the whole
report: paying to cram everything into a template is worse value than paying once for a
nudge that makes the next fortnight free.

---

## Two routes, both supported

There is an official channel and an unofficial one, and the choice is a real trade rather
than a right answer. Both are implemented; switching is one environment variable.

| | `cloud` — Meta official | `baileys` — self-hosted |
|---|---|---|
| Per message | ₹0 in-window, ~₹0.115 outside | ₹0 |
| Hosting | none, runs from Vercel | a box, ~₹350–550/month |
| To set up | business verification, a template | scan a QR |
| Number can be banned | no | **yes** |
| Content limits | templates outside the 24h window | none |

**`cloud` is the safer default** and stays the recommendation for anyone who can complete
Meta's verification: at one summary a day the bill is a few rupees a month, and nothing
can cost the company its WhatsApp number.

**`baileys` is the right answer when** verification is a blocker, message volume would make
per-message pricing hurt, or a box is being paid for anyway. It is genuinely free and has
no content restrictions.

If you take the Baileys route, **use a dedicated prepaid SIM**. If it gets restricted you
buy another; if it was the proprietor's personal number, he loses his contacts, groups and
history, with nobody to appeal to.

Setup, hosting and pairing: [services/whatsapp-bridge/README.md](../services/whatsapp-bridge/README.md).

### A note on OpenWA

A third provider, [OpenWA](https://github.com/rmyndharis/OpenWA), is still wired up and
still not recommended:

- **It cannot run on Vercel.** Its own docs describe a headless Chromium at 300–500 MB per
  session, a scanned QR session held on disk, and Postgres + Redis + S3 alongside it.
  Vercel functions are ephemeral and read-only outside `/tmp`. It needs a separate
  always-on host.
- **Free hosting for it got worse.** Oracle halved its Always Free tier in June 2026,
  Fly.io removed its free tier in 2024, and Render's free tier spins down — which kills the
  QR session. Realistically ₹450–550/month, or a scarce Oracle instance.
- **It risks the number.** OpenWA's own documentation says its Baileys engine carries
  "higher account-restriction risk". That is the company's WhatsApp number — the one
  dealers use.

It stays supported (`MESSAGING_PROVIDER=openwa`) because a channel that can break should
not be a one-way door. But the Baileys bridge does the same job with a fraction of the
footprint — no Chromium, no Redis, no S3 — so there is little reason to pick it now.

---

## Setup — about an hour, once

### 1. The one real gotcha, first

**The phone number cannot be active on the regular WhatsApp app.** Either use a spare SIM,
or delete the business number from the WhatsApp app before registering it here. Everything
else is straightforward; people get stuck on this.

### 2. Meta app and number

1. Create a [Meta Business account](https://business.facebook.com) if there isn't one.
2. At [developers.facebook.com](https://developers.facebook.com/apps), create an app of
   type **Business**, then add the **WhatsApp** product.
3. Under *WhatsApp → API Setup*, add and verify your phone number.
4. Copy the **Phone number ID** — this is `WHATSAPP_PHONE_ID`.

No business verification is needed at this volume: unverified accounts may message 250
unique recipients per 24 hours, and this feature messages one.

### 3. A permanent token

The token shown on the API Setup page expires in 24 hours. For a real deployment:

1. *Business Settings → Users → System Users* → add a system user with an **Admin** role.
2. Assign it your app with full control.
3. Generate a token with `whatsapp_business_messaging` and
   `whatsapp_business_management`. Choose **never expires**.
4. That is `WHATSAPP_TOKEN`.

### 4. Approve one utility template

Under *WhatsApp → Message Templates*, create:

- **Name:** `order_daily_summary`
- **Category:** **Utility** — not Marketing. Utility is ~₹0.115; marketing is ~₹0.86.
- **Language:** English
- **Body:**

  ```
  Orders as at {{1}}: {{2}} open, {{3}} needing attention. Worst: {{4}}. Reply STATUS for the full list.
  ```

Sample values for review: `1 Aug`, `6`, `2`, `ORD-0001 (3d)`.

Every parameter is a short single-line string on purpose — that keeps it clear of Meta's
formatting rules for parameters, and the multi-line report goes out free-form anyway.

Approval is usually minutes for a utility template.

### 5. Webhook

1. Under *WhatsApp → Configuration → Webhook*, set the callback URL to:

   ```
   https://<your-app>.vercel.app/api/whatsapp
   ```

2. Set the **Verify token** to any string, and put the same value in
   `WHATSAPP_VERIFY_TOKEN`. Meta calls `GET` with it and expects the challenge echoed back.
3. Subscribe to the **`messages`** field. Nothing else is needed.
4. Copy the app secret from *App Settings → Basic* into `WHATSAPP_APP_SECRET`. Inbound
   requests are rejected unless their `X-Hub-Signature-256` verifies against it.

### 6. Environment variables

```bash
MESSAGING_PROVIDER=cloud
MESSAGING_ADMIN_NUMBER=919876543210      # country code, digits only, no +
WHATSAPP_TOKEN=EAAG...                   # permanent system-user token
WHATSAPP_PHONE_ID=123456789012345
WHATSAPP_APP_SECRET=...                  # App Settings → Basic
WHATSAPP_VERIFY_TOKEN=any-string-you-choose
WHATSAPP_SUMMARY_TEMPLATE=order_daily_summary
```

Set them in *Vercel → Settings → Environment Variables*, then redeploy.

### 7. Check it works

Open **Orders** as an admin and press **Send summary**. The toast reports whether it went
out free or as a template, so the cost model is visible rather than a mystery.

Then text `STATUS` to the number from the admin's phone. The reply should arrive in a few
seconds, and it is free.

---

## What gets sent, and when

| Trigger | Message | Cost |
| --- | --- | --- |
| Admin texts `STATUS` | Every open order, worst first | ₹0 |
| Admin texts `LATE` | Only orders behind or forecast behind | ₹0 |
| Admin texts anything else | Short help text | ₹0 |
| Daily cron | The full summary | ₹0 in-window, else ₹0.1357 |
| An order newly forecasts late | A three-line alert naming the stuck stage | ₹0.1357 |

The at-risk alert fires **once per crossing**, guarded by `Order.riskNotifiedAt`. An order
that is late stays late, and being told nightly that yesterday's problem persists is how
alerts get muted — the standing state belongs in the daily summary.

The cron runs from `vercel.json` at `30 12 * * 1-5` (6:00 pm IST, Mon–Fri) and skips
weekends and company holidays.

---

## Switching channel

One env var, then redeploy. The digest, the alerts and the inbound commands all work the
same way on each.

```bash
MESSAGING_PROVIDER=cloud      # Meta official. Recommended. Runs from Vercel.
MESSAGING_PROVIDER=baileys    # Self-hosted bridge. Free, unofficial, needs a box.
                              # Needs BAILEYS_BRIDGE_URL, BAILEYS_BRIDGE_TOKEN,
                              # BAILEYS_WEBHOOK_SECRET.
MESSAGING_PROVIDER=openwa     # Older self-hosted gateway. Needs OPENWA_BASE_URL,
                              # OPENWA_API_KEY, OPENWA_SESSION_ID, OPENWA_WEBHOOK_SECRET.
MESSAGING_PROVIDER=telegram   # Free forever, no approval. Needs TELEGRAM_BOT_TOKEN
                              # and TELEGRAM_CHAT_ID.
MESSAGING_PROVIDER=none       # Log only. The default.
```

Only `cloud` has a service window and templates. On `baileys`, `openwa` and `telegram` the
full digest simply goes out every time, at no cost — which is why `sendSummary` special-cases
only `cloud`.

With `none`, everything still runs and every message is written to `MessageLog` — so the
feature can be developed and reviewed with no channel at all.

---

## When it goes wrong

Every send is logged to `MessageLog` before it is attempted and updated after, with the
provider's error string. That log is the first place to look.

| Symptom | Cause |
| --- | --- |
| `131047` in the log | Sent free-form with no open window. The app falls back to the template automatically; seeing this repeatedly means the window detection and Meta disagree. |
| `132000` | Template parameter count does not match the approved template. Check `order_daily_summary` still has four. |
| `Bad signature`, 401 | `WHATSAPP_APP_SECRET` is wrong or unset. |
| Webhook handshake fails | `WHATSAPP_VERIFY_TOKEN` does not match what is in the Meta console. |
| Nothing sent, no errors | `MESSAGING_PROVIDER` is `none`, or a credential is missing. `isMessagingEnabled` checks the ones the chosen provider needs. |
| Messages stop after 24h | The token was the temporary one from the API Setup page. Use a system-user token that never expires. |

A malformed or unrecognised inbound payload is acknowledged with a `200` on purpose: Meta
retries non-2xx responses for days and eventually disables the subscription, and a bad
afternoon in the summary builder should not switch the integration off. An *unverified*
signature is the exception — that gets a `401`.

---

## Cost, in one line

At one recipient and one summary a day, this costs **between nothing and about fifty rupees
a year**, and it is nothing on any day the admin texts the number first.
