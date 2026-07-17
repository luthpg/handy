/**
 * Neon serverless PostgreSQL client.
 * Falls back to an in-memory store when DATABASE_URL is not set so the app
 * stays functional without a database configured.
 */
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { logger } from "./logger.js";

let sql: NeonQueryFunction<false, false> | null = null;

// In-memory fallback (lost on restart)
const memStore = new Map<string, string>();

function getSql(): NeonQueryFunction<false, false> | null {
  if (sql) return sql;
  const url = process.env["DATABASE_URL"];
  if (!url) return null;
  sql = neon(url);
  return sql;
}

export async function initDb(): Promise<void> {
  const db = getSql();
  if (!db) {
    logger.warn("DATABASE_URL not set — using in-memory config store (not persistent)");
    return;
  }
  try {
    await db`
      CREATE TABLE IF NOT EXISTS ide_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    logger.info("Neon database initialised");
  } catch (err) {
    logger.error({ err }, "Failed to initialise Neon database");
  }
}

export async function getConfig(key: string): Promise<string | null> {
  const db = getSql();
  if (!db) return memStore.get(key) ?? null;
  try {
    const rows = await db`SELECT value FROM ide_config WHERE key = ${key}`;
    return (rows[0] as { value: string } | undefined)?.value ?? null;
  } catch {
    return memStore.get(key) ?? null;
  }
}

export async function setConfig(key: string, value: string): Promise<void> {
  memStore.set(key, value);
  const db = getSql();
  if (!db) return;
  try {
    await db`
      INSERT INTO ide_config (key, value)
      VALUES (${key}, ${value})
      ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = NOW()
    `;
  } catch (err) {
    logger.error({ err }, "Failed to persist config to Neon");
  }
}

export async function deleteConfig(key: string): Promise<void> {
  memStore.delete(key);
  const db = getSql();
  if (!db) return;
  try {
    await db`DELETE FROM ide_config WHERE key = ${key}`;
  } catch (err) {
    logger.error({ err }, "Failed to delete config from Neon");
  }
}
