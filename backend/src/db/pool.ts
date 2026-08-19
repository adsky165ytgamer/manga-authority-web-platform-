import pg from "pg";
import { env } from "../config/env";

const { Pool } = pg;

export const pool = env.databaseUrl
  ? new Pool({
      connectionString: env.databaseUrl,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: "school-notice-backend",
      ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
    })
  : null;

export type DbClient = pg.PoolClient;

export function requirePool(): pg.Pool {
  if (!pool) throw new Error("DATABASE_URL is not configured");
  return pool;
}

export async function withTransaction<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
  const db = requirePool();
  const client = await db.connect();
  try {
    await client.query("begin");
    const value = await fn(client);
    await client.query("commit");
    return value;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool?.end();
}
