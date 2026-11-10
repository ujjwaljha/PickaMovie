import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

/** Fresh upstream calls per minute for the whole app. */
export const CATALOG_MINUTE_LIMIT = 20;
/** Fresh upstream calls per minute for one browser. */
export const CATALOG_CLIENT_MINUTE_LIMIT = 8;
/** Browsers that may make fresh lookups in the same minute. */
export const CATALOG_SPENDERS_PER_MINUTE = 2;
/** New browsers that may start spending in one minute. */
export const CATALOG_NEW_CLIENTS_PER_MINUTE = 2;
/** Browsers that may spend during one hour. */
export const CATALOG_ACTIVE_CLIENTS_PER_HOUR = 4;
/** Fresh upstream calls per hour for the whole app. */
export const CATALOG_HOUR_LIMIT = 200;
/** Fresh upstream calls per hour for one browser. */
export const CATALOG_CLIENT_HOUR_LIMIT = 40;

const NEW_CLIENTS_PER_HOUR = 4;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

const SCHEMA = `
create table if not exists catalog_bucket (
  kind text not null,
  bucket integer not null,
  spent integer not null,
  primary key (kind, bucket)
);
create table if not exists catalog_client_bucket (
  client_id text not null,
  kind text not null,
  bucket integer not null,
  spent integer not null,
  primary key (client_id, kind, bucket)
);
create table if not exists catalog_client (
  id text primary key,
  first_seen timestamptz not null
);
`;

type Row = Record<string, unknown>;
type Query = (text: string, params?: unknown[]) => Promise<{ rows: Row[] }>;

let clockNow: () => number = () => Date.now();
let schemaReady: Promise<void> | null = null;
let pool: pg.Pool | null = null;
let local: PGlite | null = null;
let localTail: Promise<unknown> = Promise.resolve();

export function setSpendClock(clock: (() => number) | null): void {
  clockNow = clock ?? (() => Date.now());
}

export async function resetSpendLimits(): Promise<void> {
  clockNow = () => Date.now();
  if (!schemaReady) return;
  await withSession(async (query) => {
    await query("truncate catalog_bucket, catalog_client_bucket, catalog_client");
  });
}

/** True when this browser must not make a fresh TMDB call. A database error blocks the call. */
export async function spendBlocked(client: string, weight: number): Promise<boolean> {
  if (!/^[0-9a-f]{16}$/.test(client) || !Number.isInteger(weight) || weight < 1 || weight > CATALOG_MINUTE_LIMIT) return true;
  try {
    return await reserve(client, weight);
  } catch {
    return true;
  }
}

async function reserve(client: string, weight: number): Promise<boolean> {
  const now = clockNow();
  const minute = Math.floor(now / MINUTE_MS);
  const hour = Math.floor(now / HOUR_MS);
  return withSession((query) => reserveIn(query, client, weight, now, minute, hour));
}

async function reserveIn(query: Query, client: string, weight: number, now: number, minute: number, hour: number): Promise<boolean> {
  await query("delete from catalog_bucket where (kind = 'm' and bucket < $1) or (kind = 'h' and bucket < $2)", [minute - 180, hour - 48]);
  await query("delete from catalog_client_bucket where (kind = 'm' and bucket < $1) or (kind = 'h' and bucket < $2)", [minute - 180, hour - 48]);
  await query("delete from catalog_client where first_seen < $1", [new Date(now - 48 * HOUR_MS).toISOString()]);
  await query(
    "insert into catalog_bucket (kind, bucket, spent) values ('m', $1, 0), ('h', $2, 0) on conflict (kind, bucket) do nothing",
    [minute, hour],
  );
  const minuteSpent = await spent(query, "select spent from catalog_bucket where kind = 'm' and bucket = $1 for update", [minute]);
  const hourSpent = await spent(query, "select spent from catalog_bucket where kind = 'h' and bucket = $1 for update", [hour]);
  if (minuteSpent + weight > CATALOG_MINUTE_LIMIT || hourSpent + weight > CATALOG_HOUR_LIMIT) return true;

  const known = await query("select id from catalog_client where id = $1", [client]);
  const isNew = known.rows.length === 0;
  if (isNew) {
    const freshMinute = await total(
      query,
      "select count(*)::int as total from catalog_client where first_seen >= $1 and first_seen < $2",
      [new Date(minute * MINUTE_MS).toISOString(), new Date((minute + 1) * MINUTE_MS).toISOString()],
    );
    const freshHour = await total(
      query,
      "select count(*)::int as total from catalog_client where first_seen >= $1 and first_seen < $2",
      [new Date(hour * HOUR_MS).toISOString(), new Date((hour + 1) * HOUR_MS).toISOString()],
    );
    if (freshMinute >= CATALOG_NEW_CLIENTS_PER_MINUTE || freshHour >= NEW_CLIENTS_PER_HOUR) return true;
  }

  const ownMinute = await query("select spent from catalog_client_bucket where client_id = $1 and kind = 'm' and bucket = $2", [client, minute]);
  if (ownMinute.rows.length === 0) {
    const spenders = await total(
      query,
      "select count(*)::int as total from catalog_client_bucket where kind = 'm' and bucket = $1 and spent > 0",
      [minute],
    );
    if (spenders >= CATALOG_SPENDERS_PER_MINUTE) return true;
  }
  const ownHour = await query("select spent from catalog_client_bucket where client_id = $1 and kind = 'h' and bucket = $2", [client, hour]);
  if (ownHour.rows.length === 0) {
    const active = await total(
      query,
      "select count(*)::int as total from catalog_client_bucket where kind = 'h' and bucket = $1 and spent > 0",
      [hour],
    );
    if (active >= CATALOG_ACTIVE_CLIENTS_PER_HOUR) return true;
  }
  const clientMinute = Number(ownMinute.rows[0]?.spent ?? 0);
  const clientHour = Number(ownHour.rows[0]?.spent ?? 0);
  if (clientMinute + weight > CATALOG_CLIENT_MINUTE_LIMIT || clientHour + weight > CATALOG_CLIENT_HOUR_LIMIT) return true;

  if (isNew) await query("insert into catalog_client (id, first_seen) values ($1, $2)", [client, new Date(now).toISOString()]);
  await query(
    `insert into catalog_client_bucket (client_id, kind, bucket, spent) values ($1, 'm', $2, $3), ($1, 'h', $4, $3)
     on conflict (client_id, kind, bucket) do update set spent = catalog_client_bucket.spent + excluded.spent`,
    [client, minute, weight, hour],
  );
  await query("update catalog_bucket set spent = spent + $1 where kind = 'm' and bucket = $2", [weight, minute]);
  await query("update catalog_bucket set spent = spent + $1 where kind = 'h' and bucket = $2", [weight, hour]);
  return false;
}

async function spent(query: Query, text: string, params: unknown[]): Promise<number> {
  const result = await query(text, params);
  return Number(result.rows[0]?.spent ?? 0);
}

async function total(query: Query, text: string, params: unknown[]): Promise<number> {
  const result = await query(text, params);
  return Number(result.rows[0]?.total ?? 0);
}

async function withSession<T>(fn: (query: Query) => Promise<T>): Promise<T> {
  await ensure();
  if (pool) return withPg(fn);
  return withLocal(fn);
}

function withLocal<T>(fn: (query: Query) => Promise<T>): Promise<T> {
  const run = localTail.then(() => runLocal(fn));
  localTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function runLocal<T>(fn: (query: Query) => Promise<T>): Promise<T> {
  if (!local) throw new Error("catalog limit store is not open");
  await local.query("begin");
  try {
    const result = await fn((text, params) => local!.query(text, params));
    await local.query("commit");
    return result;
  } catch (error) {
    await local.query("rollback").catch(() => undefined);
    throw error;
  }
}

async function withPg<T>(fn: (query: Query) => Promise<T>): Promise<T> {
  if (!pool) throw new Error("catalog limit store is not open");
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn((text, params) => client.query(text, params));
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function ensure(): Promise<void> {
  schemaReady ??= createSchema().catch((error: unknown) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

async function createSchema(): Promise<void> {
  const url = readDatabaseUrl();
  if (url) {
    const next = new pg.Pool({ connectionString: url, max: 2 });
    try {
      for (const statement of SCHEMA.split(";")) {
        const sql = statement.trim();
        if (sql) await next.query(sql);
      }
    } catch (error) {
      await next.end().catch(() => undefined);
      throw error;
    }
    pool = next;
    return;
  }
  const memory = new PGlite();
  await memory.exec(SCHEMA);
  local = memory;
}

function readDatabaseUrl(): string {
  const env = (globalThis as { process?: { env?: { DATABASE_URL?: string } } }).process?.env;
  return env?.DATABASE_URL?.trim() ?? "";
}
