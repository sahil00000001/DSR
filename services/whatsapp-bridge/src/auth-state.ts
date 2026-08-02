import { BufferJSON, initAuthCreds, proto } from "@whiskeysockets/baileys";
import type {
  AuthenticationCreds,
  AuthenticationState,
  SignalDataTypeMap,
} from "@whiskeysockets/baileys";
import type { Pool } from "pg";

/**
 * Baileys auth state, kept in Postgres.
 *
 * ## What this replaces and why
 *
 * The documented starting point is `useMultiFileAuthState("./auth")`, which writes the
 * credentials plus a few hundred Signal protocol keys into a folder. That is the right
 * thing on a laptop and the wrong thing on every container platform: the filesystem is
 * rebuilt on each deploy, so the pairing is lost and somebody has to physically re-scan a
 * QR code to restore a service that was working ten minutes ago.
 *
 * The failure is also silent. The container starts, the health check passes, and the
 * socket simply never authenticates — which is discovered at 6pm when the summary does
 * not arrive. Storing the session in the database the app already has removes the whole
 * class of problem: a redeploy reconnects on its own.
 *
 * ## The two details that break a hand-rolled version of this
 *
 *  1. **`BufferJSON`.** Half of what Baileys stores is raw `Buffer`. Plain `JSON.stringify`
 *     turns those into `{"type":"Buffer","data":[…]}` and plain `JSON.parse` leaves them as
 *     that object, so decryption fails later with an error that points nowhere near here.
 *     Baileys exports a matched replacer/reviver pair; both must be used.
 *
 *  2. **`app-state-sync-key` must be revived into a protobuf.** It is the one type the
 *     caller gets back as a plain object and Baileys expects a
 *     `proto.Message.AppStateSyncKeyData`. Miss it and app-state sync fails intermittently
 *     — the kind of bug that looks like a network problem for a week.
 *
 * Both are why this is a deliberate adapter rather than a thin `JSON.stringify` wrapper.
 */

export interface AuthStateStore {
  state: AuthenticationState;
  /** Persist the credentials. Call on every `creds.update`. */
  saveCreds: () => Promise<void>;
  /** Forget the pairing entirely — used when WhatsApp says we are logged out. */
  clear: () => Promise<void>;
}

/** `CREATE TABLE` is owned by the app's Prisma schema; this only checks it arrived. */
export async function assertSessionTable(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'WhatsappSession'
     ) AS exists`,
  );

  if (!rows[0]?.exists) {
    throw new Error(
      'The "WhatsappSession" table is missing. Run `npm run db:push` in the main app — ' +
        "the bridge stores its pairing there and cannot start without it.",
    );
  }
}

export async function usePostgresAuthState(
  pool: Pool,
  sessionId: string,
): Promise<AuthStateStore> {
  async function read<T>(key: string): Promise<T | null> {
    const { rows } = await pool.query<{ data: string }>(
      `SELECT data FROM "WhatsappSession" WHERE id = $1`,
      [`${sessionId}:${key}`],
    );

    const raw = rows[0]?.data;
    if (raw === undefined) return null;

    try {
      return JSON.parse(raw, BufferJSON.reviver) as T;
    } catch {
      // A corrupt row must not take the process down on boot. Treating it as absent
      // makes Baileys regenerate that key, which is recoverable; throwing here is not.
      return null;
    }
  }

  async function write(key: string, category: string, value: unknown): Promise<void> {
    await pool.query(
      `INSERT INTO "WhatsappSession" (id, "sessionId", category, data, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, now(), now())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, "updatedAt" = now()`,
      [`${sessionId}:${key}`, sessionId, category, JSON.stringify(value, BufferJSON.replacer)],
    );
  }

  async function remove(key: string): Promise<void> {
    await pool.query(`DELETE FROM "WhatsappSession" WHERE id = $1`, [`${sessionId}:${key}`]);
  }

  const stored = await read<AuthenticationCreds>("creds");
  const creds = stored ?? initAuthCreds();

  /**
   * Persist a brand-new identity immediately, before anything asks us to.
   *
   * Baileys only emits `creds.update` when credentials *change*, and nothing changes
   * between generating them and completing a pairing. So a first boot holds its noise key
   * and identity key in memory only — and a restart while the admin is walking to his
   * phone silently invalidates the QR he is about to scan. He sees "couldn't link device"
   * and no reason for it.
   *
   * One write on first boot removes that. It also means the row always exists, so a
   * missing one is unambiguous evidence the store is broken rather than merely unused.
   */
  if (!stored) {
    await write("creds", "creds", creds);
  }

  return {
    state: {
      creds,
      keys: {
        async get(type, ids) {
          const found: { [id: string]: SignalDataTypeMap[typeof type] } = {};

          /*
           * One statement for the whole batch. Baileys asks for keys in groups — decrypting
           * a single message can want a dozen — and a query each turned every inbound
           * message into a burst of round trips to a database in another region.
           */
          const keys = ids.map((id) => `${sessionId}:${type}-${id}`);
          const { rows } = await pool.query<{ id: string; data: string }>(
            `SELECT id, data FROM "WhatsappSession" WHERE id = ANY($1::text[])`,
            [keys],
          );

          const byId = new Map(rows.map((row) => [row.id, row.data]));

          for (const id of ids) {
            const raw = byId.get(`${sessionId}:${type}-${id}`);
            if (raw === undefined) continue;

            let value: unknown;
            try {
              value = JSON.parse(raw, BufferJSON.reviver);
            } catch {
              continue;
            }

            // The one type Baileys hands back as a plain object but expects as a protobuf.
            if (type === "app-state-sync-key" && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(
                value as Record<string, unknown>,
              );
            }

            found[id] = value as SignalDataTypeMap[typeof type];
          }

          return found;
        },

        async set(data) {
          const writes: Array<Promise<void>> = [];

          for (const type of Object.keys(data) as Array<keyof SignalDataTypeMap>) {
            const entries = data[type];
            if (!entries) continue;

            for (const [id, value] of Object.entries(entries)) {
              const key = `${type}-${id}`;
              // A null value is a deletion, not a value to store — Baileys prunes used
              // pre-keys this way, and keeping them would grow the table without bound.
              writes.push(value ? write(key, String(type), value) : remove(key));
            }
          }

          await Promise.all(writes);
        },
      },
    },

    saveCreds: () => write("creds", "creds", creds),

    clear: async () => {
      await pool.query(`DELETE FROM "WhatsappSession" WHERE "sessionId" = $1`, [sessionId]);
    },
  };
}
