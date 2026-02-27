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
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
})

pool.on('error', (err) => {
  const pgErr = err as Error & { code?: string }
  console.warn('[db] idle pool client error (non-fatal)', { message: pgErr.message, code: pgErr.code })
})

export const getPool = () => pool

const TRANSIENT_CODES = new Set(['08P01', '08006', '08001', '08003', '57P01', 'ECONNRESET'])
const MAX_RETRIES = 2
const RETRY_DELAY_MS = 500

const isTransient = (err: unknown): boolean => {
  if (!(err instanceof Error)) return false
  const code = (err as Error & { code?: string }).code
  if (code && TRANSIENT_CODES.has(code)) return true
  return /connection terminated|ECONNRESET/i.test(err.message)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const withClient = async <T>(fn: (client: PoolClient) => Promise<T>) => {
  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const client = await pool.connect()
    try {
      return await fn(client)
    } catch (err) {
      lastError = err
      client.release(err instanceof Error ? err : true)
      if (!isTransient(err) || attempt === MAX_RETRIES) throw err
      console.warn('[db] transient error, retrying', { attempt: attempt + 1, message: (err as Error).message })
      await sleep(RETRY_DELAY_MS * (attempt + 1))
      continue
    }
    client.release()
  }
  throw lastError
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
  { filename: '003_race_stats.sql' },
  { filename: '004_drop_fk_constraints.sql' },
  { filename: '005_seed_bigint.sql' },
  { filename: '006_regattas.sql' },
  { filename: '007_user_theme.sql' },
  { filename: '008_regatta_status.sql' },
  { filename: '009_training_flag.sql' },
]

const MIGRATION_LOCK_ID = 839_201_741

export const runMigrations = async () => {
  const client = await pool.connect()
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID])
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
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {})
    client.release()
  }
}
