/**
 * Run with: npm run check:auth
 *
 * Proves the Postgres session store round-trips what Baileys actually puts in it.
 *
 * This is the piece worth testing above all others here, because every way it can fail is
 * quiet. A Buffer that comes back as `{"type":"Buffer","data":[…]}` does not throw — it
 * throws later, inside decryption, as an error about the protocol. A missing protobuf
 * revival does not throw at all; app-state sync just stops working some of the time. And
 * none of it shows up until a device has been paired, which is a person walking to a phone
 * with a QR code, so "try it and see" is an expensive test loop.
 *
 * Runs against a scratch session id and deletes it afterwards, so it is safe to run
 * against the live database and will not disturb a paired device.
 */
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { initAuthCreds, proto } from "@whiskeysockets/baileys";
import { usePostgresAuthState, assertSessionTable } from "../src/auth-state.js";

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

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
const sessionId = `test-${randomBytes(6).toString("hex")}`;

try {
  await assertSessionTable(pool);
  console.log(`\n=== Scratch session ${sessionId} ===`);

  const store = await usePostgresAuthState(pool, sessionId);

  // --- creds are written on first boot, not left in memory -------------------
  const { rows: credRows } = await pool.query(
    `SELECT data FROM "WhatsappSession" WHERE id = $1`,
    [`${sessionId}:creds`],
  );
  check("a new identity is persisted immediately", credRows.length === 1);

  // --- binary survives the trip ----------------------------------------------
  /*
   * The whole reason BufferJSON exists. `creds.noiseKey.private` is a Uint8Array; plain
   * JSON turns it into an object of numbers and hands that back, which fails later and
   * elsewhere.
   */
  const reopened = await usePostgresAuthState(pool, sessionId);
  const original = store.state.creds.noiseKey.private;
  const restored = reopened.state.creds.noiseKey.private;

  check("the noise key comes back as bytes, not a plain object", Buffer.isBuffer(restored) || restored instanceof Uint8Array, restored?.constructor?.name);
  check(
    "and byte-for-byte identical",
    Buffer.from(restored).equals(Buffer.from(original)),
    `${restored.length} bytes`,
  );
  check(
    "the registration id survives",
    reopened.state.creds.registrationId === store.state.creds.registrationId,
    String(reopened.state.creds.registrationId),
  );

  // --- signal keys: set, batch get, delete ------------------------------------
  console.log("\n=== Signal key store ===");
  const preKey = { public: randomBytes(32), private: randomBytes(32) };

  await store.state.keys.set({ "pre-key": { "1": preKey, "2": preKey } });

  const got = await store.state.keys.get("pre-key", ["1", "2", "3"]);
  check("two stored keys come back", Object.keys(got).length === 2, Object.keys(got).join(","));
  check(
    "a key that was never stored is simply absent",
    got["3"] === undefined,
    "not null, not an error",
  );
  check(
    "the stored key is byte-identical",
    Buffer.from(got["1"]!.private).equals(preKey.private),
  );

  /*
   * Baileys prunes a used pre-key by setting it to null. If that were stored as the
   * literal null instead of deleting the row, the table would grow without bound and
   * `get` would hand back a null where a key is expected.
   */
  await store.state.keys.set({ "pre-key": { "1": null } });
  const afterDelete = await store.state.keys.get("pre-key", ["1", "2"]);
  check("setting a key to null deletes it", afterDelete["1"] === undefined);
  check("and leaves its neighbours alone", afterDelete["2"] !== undefined);

  // --- the protobuf revival ----------------------------------------------------
  console.log("\n=== app-state-sync-key is revived as a protobuf ===");
  await store.state.keys.set({
    "app-state-sync-key": {
      test: proto.Message.AppStateSyncKeyData.fromObject({
        keyData: randomBytes(32),
        fingerprint: { rawId: 1, currentIndex: 1, deviceIndexes: [0, 1] },
        timestamp: 1_700_000_000_000,
      }),
    },
  });

  const synced = await store.state.keys.get("app-state-sync-key", ["test"]);
  const value = synced.test;
  check("the key comes back", value !== undefined);
  check(
    "as an AppStateSyncKeyData, not a bare object",
    value instanceof proto.Message.AppStateSyncKeyData,
    value?.constructor?.name,
  );
  check("with its nested fingerprint intact", value?.fingerprint?.rawId === 1);

  // --- clear -------------------------------------------------------------------
  console.log("\n=== Clearing forgets the whole pairing ===");
  await store.clear();
  const { rows: left } = await pool.query(
    `SELECT count(*)::int AS n FROM "WhatsappSession" WHERE "sessionId" = $1`,
    [sessionId],
  );
  check("no rows remain", left[0]?.n === 0, `${left[0]?.n} rows`);

  const fresh = await usePostgresAuthState(pool, sessionId);
  check(
    "and a new identity is generated, not the old one",
    fresh.state.creds.registrationId !== store.state.creds.registrationId,
  );

  // --- sessions do not see each other -------------------------------------------
  console.log("\n=== Sessions are isolated ===");
  const other = `${sessionId}-other`;
  const second = await usePostgresAuthState(pool, other);
  await second.state.keys.set({ "pre-key": { "1": preKey } });
  const notMine = await fresh.state.keys.get("pre-key", ["1"]);
  check("one session cannot read another's keys", notMine["1"] === undefined);

  await pool.query(`DELETE FROM "WhatsappSession" WHERE "sessionId" = ANY($1::text[])`, [
    [sessionId, other],
  ]);

  const initial = initAuthCreds();
  check("initAuthCreds still produces a usable identity", typeof initial.registrationId === "number");
} finally {
  // Never leave scratch rows behind, whatever failed.
  await pool.query(`DELETE FROM "WhatsappSession" WHERE "sessionId" LIKE $1`, [`${sessionId}%`]);
  await pool.end();
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
