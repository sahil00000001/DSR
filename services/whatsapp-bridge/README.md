# WhatsApp bridge

Holds the WhatsApp connection for the portal, using
[Baileys](https://github.com/WhiskeySockets/Baileys). Sends the end-of-day order summary
and answers `STATUS` from the admin.

**This does not run on Vercel, and no configuration will make it.** Baileys speaks
WhatsApp's real multi-device protocol over a WebSocket it must hold open, with a paired
device session it mutates as messages flow. Vercel functions are frozen between requests
and have no durable disk. So this runs as a small always-on service beside the app, and
the app calls it over HTTP.

---

## What you are choosing

Baileys is **unofficial**. It pairs as a linked device — the same mechanism as WhatsApp
Web — so from WhatsApp's side this is a person's account being automated, which its terms
do not permit. The practical consequences:

| | Baileys (this) | Meta Cloud API |
|---|---|---|
| Cost | ₹0 per message | ₹0 in-window, ~₹0.115 outside |
| Hosting | a box, ~₹350–550/month | none — runs from Vercel |
| Approval | none | Business verification, a template |
| Number can be banned | **yes** | no |
| Message content limits | none | templates outside the 24h window |

**Use a dedicated SIM.** A cheap prepaid number that exists only for this. If it gets
restricted you buy another one; if you used the proprietor's personal number, he loses his
WhatsApp — contacts, groups, history — and there is no support line to appeal to.

The app keeps both channels working. `MESSAGING_PROVIDER=cloud` switches to the official
one with a redeploy and no code change, so this is not a one-way door.

---

## The pinned version, and why

```json
"@whiskeysockets/baileys": "6.7.24"
```

Exact, with no `^`. There is a version `6.17.16` on npm that is **semver-higher than
6.7.24 but was published seventeen months earlier**, with a completely different
dependency tree. A normal `^6.7.24` range resolves to it. Do not add a caret here.

`7.0.0-rc14` is currently npm's `latest` tag, but it is a release candidate and pulls
`whatsapp-rust-bridge`, a native binary. 6.7.24 is the `legacy` tag, is built by the
project's own CI, and is pure JavaScript — so the image builds on any architecture with no
compiler.

---

## Setup

### 1. The table

The pairing lives in Postgres, not on disk. From the **main app**:

```bash
npm run db:push
```

That creates `WhatsappSession`. The bridge refuses to start without it.

> **Why not the disk?** Baileys' documented `useMultiFileAuthState` writes to a folder.
> Every container platform rebuilds its filesystem on deploy, so the pairing is lost and
> somebody has to walk to the office and re-scan a QR. Worse, it fails silently: the
> service starts, health checks pass, and it simply never delivers — discovered at 6pm.

### 2. Configuration

```bash
cp .env.example .env
```

Fill in:

- **`DATABASE_URL`** — the same Supabase database, in **session mode: port 5432**, not the
  6543 transaction pooler. Percent-encode the password (`@` → `%40`).
- **`BRIDGE_TOKEN`** — generate a fresh one. This is the only thing between the internet
  and your WhatsApp account:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
  ```
- **`BRIDGE_WEBHOOK_SECRET`** — a second, different secret. It signs messages travelling
  the other way. One leaking must not compromise the other.
- **`ADMIN_NUMBER`** — digits with country code, no `+`. Only this number is forwarded.
  Leave it empty and every stranger who messages the number gets the order book read back
  to them.

### 3. Run it

```bash
npm install
npm start
```

### 4. Pair the device

**By code** — preferred. Nothing sensitive moves through a chat app:

```bash
curl -X POST http://localhost:8080/pair \
  -H "Authorization: Bearer $BRIDGE_TOKEN" \
  -H "content-type: application/json" \
  -d '{"phone":"919876543210"}'
```

Then on the phone: **WhatsApp → Settings → Linked devices → Link a device → Link with
phone number instead**, and type the code.

**By QR** — if the code path gives trouble:

```bash
curl http://localhost:8080/qr -H "Authorization: Bearer $BRIDGE_TOKEN"
```

Render the returned string as a QR code and scan it from the same screen. Treat it like a
password: whoever scans it links a device to the account.

### 5. Confirm

```bash
curl http://localhost:8080/health          # {"status":"open",…}
```

`open` means paired and connected. Then point the app at it (below) and reply `STATUS` to
the number from the admin's phone.

---

## Telling the app about it

In the **app's** environment (Vercel):

```bash
MESSAGING_PROVIDER=baileys
BAILEYS_BRIDGE_URL=https://your-bridge.example.com
BAILEYS_BRIDGE_TOKEN=<the same BRIDGE_TOKEN>
BAILEYS_WEBHOOK_SECRET=<the same BRIDGE_WEBHOOK_SECRET>
MESSAGING_ADMIN_NUMBER=919876543210
```

And in the **bridge's** environment:

```bash
APP_WEBHOOK_URL=https://your-app.vercel.app/api/whatsapp
```

The two secrets must match on both sides.

---

## Where to host it

Anything that runs a container and does not sleep. It idles at roughly 150 MB.

| | Notes |
|---|---|
| **Railway** | Simplest. Deploy from this directory, set the variables, done. ~$5/month. |
| **Render** | Works, but **not the free tier** — it spins down when idle, which drops the socket and burns reconnects. |
| **Fly.io** | Good. Set `min_machines_running = 1`; the default scale-to-zero defeats the purpose. |
| **A ₹400/month VPS** | Hetzner, DigitalOcean, Contabo. `docker build` and run. |

Whatever you pick, it must **not** scale to zero and must **not** run more than one
instance. Two containers sharing one session fight over the socket, and WhatsApp reads
that as a conflicting device.

```bash
docker build -t pmpl-whatsapp-bridge .
docker run -d --restart unless-stopped --env-file .env -p 8080:8080 pmpl-whatsapp-bridge
```

---

## The API

Everything except `/health` needs `Authorization: Bearer $BRIDGE_TOKEN`.

| Route | Does |
|---|---|
| `GET /health` | Public. `200` when connected, `503` otherwise. Deliberately does not reveal the paired number. |
| `GET /status` | Connection state, paired number, pending QR, reconnect count. |
| `GET /qr` | The QR string, while unpaired. |
| `POST /pair` | `{"phone":"91…"}` → an eight-character pairing code. |
| `POST /send` | `{"to":"91…","text":"…"}`. `502` means WhatsApp refused, not that the bridge is broken. |
| `POST /logout` | Unpairs and forgets the session. The next boot needs a fresh scan. |

---

## Checks

```bash
npm run typecheck
npm run check:auth     # 16 assertions against the session store
```

`check:auth` is the one worth running after any change to `auth-state.ts`. Every way that
file can break is quiet — a `Buffer` that comes back as a plain object does not throw
until decryption, and a missing protobuf revival never throws at all, it just makes
app-state sync fail intermittently. It uses a scratch session id and cleans up, so it is
safe against the live database.

---

## When it goes wrong

**`The "WhatsappSession" table is missing`** — run `npm run db:push` in the main app.

**Reconnect loop in the logs** — normal in small numbers; WhatsApp drops the socket
routinely and the bridge backs off exponentially to a minute. A *continuous* loop means
either two instances are sharing one session, or the pairing was revoked.

**`logged out` and a QR reappears** — the device was unlinked, from the phone's
linked-devices screen or by WhatsApp. The session is cleared automatically; pair again. If
it happens repeatedly and unprompted, the number is being restricted — move to the Cloud
API rather than pairing a third time.

**Sends fail with `is not on WhatsApp`** — the recipient number is wrong, or missing its
country code. `MESSAGING_ADMIN_NUMBER=9876543210` is not valid; it needs `91` in front.

**Everything looks healthy but nothing arrives** — check `MessageLog` in the app. Every
attempt is a row with a status and the error string.
