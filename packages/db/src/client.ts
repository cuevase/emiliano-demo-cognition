import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";

export interface DbContext {
  userId: string | null;
  roles: string[];
  requestId: string;
  app: string;
}

export interface Tx {
  ctx: DbContext;
  client: pg.PoolClient;
  db: NodePgDatabase;
  query<R extends Record<string, unknown> = Record<string, unknown>>(text: string, params?: unknown[]): Promise<R[]>;
}

const globalForPool = globalThis as unknown as { __platformPool?: pg.Pool };

/** Runtime connection string for the restricted `app_rw` role (never the owner). */
export function appDatabaseUrl(): string {
  if (process.env.APP_DATABASE_URL) return process.env.APP_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  const password = process.env.APP_DB_PASSWORD;
  if (!base || !password) throw new Error("Set APP_DATABASE_URL, or DATABASE_URL + APP_DB_PASSWORD");
  const url = new URL(base);
  url.username = "app_rw";
  url.password = password;
  return url.toString();
}

export function getPool(): pg.Pool {
  if (!globalForPool.__platformPool) {
    globalForPool.__platformPool = new pg.Pool({ connectionString: appDatabaseUrl(), max: 5 });
  }
  return globalForPool.__platformPool;
}

export async function closePool(): Promise<void> {
  await globalForPool.__platformPool?.end();
  globalForPool.__platformPool = undefined;
}

function pgArray(values: string[]): string {
  return `{${values.map((v) => `"${v.replace(/["\\]/g, "")}"`).join(",")}}`;
}

/**
 * Runs `fn` in a transaction as `app_rw` with the request context set
 * transaction-locally, so row-level security sees the right user and roles
 * and values never leak between pooled connections.
 */
export async function withTx<T>(ctx: DbContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query(
      `select set_config('app.user_id', $1, true), set_config('app.roles', $2, true),
              set_config('app.request_id', $3, true), set_config('app.app', $4, true)`,
      [ctx.userId ?? "", pgArray(ctx.roles), ctx.requestId, ctx.app],
    );
    const tx: Tx = {
      ctx,
      client,
      db: drizzle(client),
      query: async (text, params) => (await client.query(text, params)).rows,
    };
    const result = await fn(tx);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Platform-internal operations (persona bootstrap, lazy expiry). Never for user-initiated writes. */
export function withSystemTx<T>(app: string, requestId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withTx({ userId: "system", roles: ["platform_system"], requestId, app }, fn);
}
