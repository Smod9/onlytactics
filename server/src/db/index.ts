import fs from 'node:fs'
import path from 'node:path'
import { Pool, type PoolClient } from 'pg'
import { appEnv } from '@/config/env'

const fallbackMigration = `
CREATE TABLE IF NOT EXISTS races (
  race_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ NOT NULL,
  course_name TEXT,
  seed INTEGER,
  leaderboard JSONB NOT NULL DEFAULT '[]'::jsonb,
  winner_id TEXT,
  replay_data JSONB NOT NULL,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_races_finished_at ON races (finished_at DESC);
CREATE INDEX IF NOT EXISTS idx_races_winner ON races (winner_id);
CREATE INDEX IF NOT EXISTS idx_races_course ON races (course_name);
`

if (!appEnv.databaseUrl) {
  throw new Error('DATABASE_URL or POSTGRES_URL is required for replay storage')
}

const pool = new Pool({
  connectionString: appEnv.databaseUrl || undefined,
  max: appEnv.databasePoolMax,
  min: appEnv.databasePoolMin,
  connectionTimeoutMillis: appEnv.databaseConnectTimeoutMs,
  idleTimeoutMillis: appEnv.databaseIdleTimeoutMs,
  ssl: appEnv.databaseSsl ? { rejectUnauthorized: false } : undefined,
})

export const getPool = () => pool

export const withClient = async <T>(fn: (client: PoolClient) => Promise<T>) => {
  const client = await pool.connect()
  try {
    return await fn(client)
  } finally {
    client.release()
  }
}

const readMigration = (filename: string, fallback?: string) => {
  const migrationPath = path.join(__dirname, 'migrations', filename)
  try {
    return fs.readFileSync(migrationPath, 'utf8')
  } catch (error) {
    if (fallback) {
      console.warn('[db] failed to read migration file, using fallback SQL', {
        migrationPath,
        error,
      })
      return fallback
    }
    throw error
  }
}

const MIGRATIONS = [
  { filename: '001_initial.sql', fallback: fallbackMigration },
  { filename: '002_users.sql' },
]

export const runMigrations = async () => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const migration of MIGRATIONS) {
      const sql = readMigration(migration.filename, migration.fallback)
      await client.query(sql)
      console.log(`[db] applied migration: ${migration.filename}`)
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
