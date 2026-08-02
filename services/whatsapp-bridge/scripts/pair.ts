/**
 * Run with: npm run pair
 *
 * Serves a page at http://localhost:8099 showing the bridge's current QR code, refreshed
 * as WhatsApp rotates it.
 *
 * ## Why a page rather than printing to the terminal
 *
 * WhatsApp replaces the QR roughly every twenty seconds and gives up after a handful of
 * rotations. A code printed once to a log is stale before somebody has walked to the
 * phone, and a terminal that has scrolled is worse than no code at all. A page that
 * re-renders keeps a scannable code on screen for as long as it takes.
 *
 * It also keeps `BRIDGE_TOKEN` server-side. The bridge's own `/qr` needs the token, and
 * embedding that in a page — even a local one — puts the key to the WhatsApp account in
 * something a browser will happily cache and a screenshot will happily capture.
 *
 * Binds to loopback only. This renders credentials; it has no business on a network
 * interface.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import QRCode from "qrcode";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^["']|["']$/g, "")];
    }),
) as Record<string, string>;

const BRIDGE = `http://127.0.0.1:${env.PORT ?? "8080"}`;
const TOKEN = env.BRIDGE_TOKEN;
const PORT = Number(process.env.PAIR_PORT ?? 8099);

if (!TOKEN) {
  console.error("BRIDGE_TOKEN is not set in .env — cannot talk to the bridge.");
  process.exit(1);
}

async function bridge(path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${BRIDGE}${path}`, {
    headers: { authorization: `Bearer ${TOKEN}` },
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) as Record<string, unknown> };
  } catch {
    return { status: response.status, body: { error: text } };
  }
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pair WhatsApp</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #fbfbfa; --fg: #1a1a18; --muted: #6b6b66; --line: #e3e2de;
    --card: #ffffff; --ok: #1f7a4d; --warn: #8a5a00;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#141413; --fg:#eeeeec; --muted:#9a9a94; --line:#2c2c29; --card:#1c1c1a; }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 2rem 1rem;
    background: var(--bg); color: var(--fg);
    font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .card {
    width: 100%; max-width: 26rem; background: var(--card);
    border: 1px solid var(--line); border-radius: 14px; padding: 1.75rem; text-align: center;
  }
  h1 { margin: 0 0 .3rem; font-size: 1.0625rem; letter-spacing: -0.01em; }
  p  { margin: 0; color: var(--muted); font-size: .8125rem; }
  .qr {
    margin: 1.5rem auto; width: 268px; height: 268px; display: grid; place-items: center;
    border: 1px solid var(--line); border-radius: 10px; background: #fff; padding: 10px;
  }
  .qr img { width: 100%; height: 100%; image-rendering: pixelated; display: block; }
  ol { text-align: left; margin: 1.25rem 0 0; padding-left: 1.1rem; font-size: .8125rem; color: var(--muted); }
  li { margin: .3rem 0; }
  li b { color: var(--fg); font-weight: 600; }
  .state { margin-top: 1.25rem; font-size: .8125rem; font-variant-numeric: tabular-nums; }
  .ok { color: var(--ok); font-weight: 600; }
  .warn { color: var(--warn); }
  .done { font-size: 2.5rem; line-height: 1; margin-bottom: .75rem; }
  code { font: 12.5px ui-monospace, "Cascadia Code", Consolas, monospace; }
</style>
</head>
<body>
  <div class="card" id="card">
    <h1>Link WhatsApp</h1>
    <p>Scan with the phone whose number the portal should send from.</p>
    <div class="qr" id="qr"><p>Waiting for a code…</p></div>
    <ol>
      <li>Open <b>WhatsApp</b> on that phone</li>
      <li><b>Settings → Linked devices</b></li>
      <li>Tap <b>Link a device</b> and scan the square above</li>
    </ol>
    <div class="state" id="state">Connecting to the bridge…</div>
  </div>

<script>
const qrBox = document.getElementById("qr");
const state = document.getElementById("state");
let rotations = 0;
let lastQr = null;

async function tick() {
  try {
    const response = await fetch("/api/qr");
    const data = await response.json();

    if (data.connection === "open") {
      document.getElementById("card").innerHTML =
        '<div class="done">&#10003;</div><h1>Linked</h1>' +
        '<p>Paired as <b>' + (data.pairedNumber || "unknown") + '</b>. You can close this page.</p>';
      return; // stop polling
    }

    if (data.qr && data.qr !== lastQr) {
      lastQr = data.qr;
      rotations++;
      qrBox.innerHTML = '<img alt="WhatsApp pairing QR code" src="' + data.png + '">';
    }

    state.textContent = data.qr
      ? "Code " + rotations + " — refreshes automatically. Scan any one of them."
      : "Waiting for the bridge to issue a code…";
    state.className = "state";
  } catch (error) {
    state.textContent = "Cannot reach the pairing helper — is it still running?";
    state.className = "state warn";
  }
  setTimeout(tick, 1500);
}
tick();
</script>
</body>
</html>`;

const server = createServer((request, response) => {
  void (async () => {
    if (request.url === "/api/qr") {
      const [qr, status] = await Promise.all([bridge("/qr"), bridge("/status")]);

      const qrString = typeof qr.body.qr === "string" ? qr.body.qr : null;
      const png = qrString
        ? await QRCode.toDataURL(qrString, { margin: 0, width: 512, errorCorrectionLevel: "L" })
        : null;

      const payload = JSON.stringify({
        qr: qrString,
        png,
        connection: status.body.connection ?? "unknown",
        pairedNumber: status.body.pairedNumber ?? null,
      });

      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(payload);
      return;
    }

    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(PAGE);
  })().catch(() => {
    if (!response.headersSent) response.writeHead(502).end('{"error":"bridge unreachable"}');
  });
});

// Loopback only — this page renders credentials.
server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  Open  http://localhost:${PORT}  and scan the code with your phone.\n`);
});
