import type { ReplayRecording, RaceState } from '@/types/race'
import { withClient } from './index'

export type RaceSummary = {
  raceId: string
  finishedAt: string
  courseName?: string | null
  winnerId?: string | null
  leaderboard: string[]
}

export type RaceQueryFilters = {
  winnerId?: string
  courseName?: string
  dateFrom?: string | Date
  dateTo?: string | Date
  limit?: number
}

const buildMetadata = (state: RaceState) => {
  const boatNames = Object.fromEntries(
    Object.values(state.boats).map((boat) => [boat.id, boat.name]),
  )
  const finishTimes = Object.fromEntries(
    Object.values(state.boats)
      .filter((boat) => typeof boat.finishTime === 'number')
      .map((boat) => [boat.id, boat.finishTime]),
  )

  return {
    boatNames,
    finishTimes,
    lapsToFinish: state.lapsToFinish,
  }
}

const toIso = (value: string | Date | undefined) => {
  if (!value) return undefined
  const d = typeof value === 'string' ? new Date(value) : value
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

export const saveRace = async (recording: ReplayRecording, finalState: RaceState) => {
  const winnerId = finalState.leaderboard[0] ?? null
  const finishedAt = new Date().toISOString()
  const metadata = buildMetadata(finalState)

  await withClient(async (client) => {
    await client.query(
      `
      INSERT INTO races (
        race_id, created_at, finished_at, course_name, seed, leaderboard, winner_id, replay_data, metadata
      ) VALUES ($1, to_timestamp($2 / 1000.0), $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (race_id) DO UPDATE SET
        finished_at = EXCLUDED.finished_at,
        course_name = EXCLUDED.course_name,
        seed = EXCLUDED.seed,
        leaderboard = EXCLUDED.leaderboard,
        winner_id = EXCLUDED.winner_id,
        replay_data = EXCLUDED.replay_data,
        metadata = EXCLUDED.metadata
      `,
      [
        recording.meta.raceId,
        recording.meta.createdAt,
        finishedAt,
        recording.meta.courseName,
        recording.meta.seed,
        finalState.leaderboard,
        winnerId,
        recording,
        metadata,
      ],
    )
  })
}

export const getRace = async (raceId: string): Promise<ReplayRecording | null> => {
  const result = await withClient((client) =>
    client.query('SELECT replay_data FROM races WHERE race_id = $1 LIMIT 1', [raceId]),
  )
  return (result.rows[0]?.replay_data as ReplayRecording | undefined) ?? null
}

export const getRecentRaces = async (limit = 25): Promise<RaceSummary[]> => {
  const result = await withClient((client) =>
    client.query(
      `
      SELECT race_id, finished_at, course_name, winner_id, leaderboard
      FROM races
      ORDER BY finished_at DESC
      LIMIT $1
      `,
      [limit],
    ),
  )

  return result.rows.map((row) => ({
    raceId: row.race_id,
    finishedAt: row.finished_at,
    courseName: row.course_name,
    winnerId: row.winner_id,
    leaderboard: row.leaderboard ?? [],
  }))
}

export const queryRaces = async (filters: RaceQueryFilters): Promise<RaceSummary[]> => {
  const where: string[] = []
  const values: Array<string | number> = []

  if (filters.winnerId) {
    values.push(filters.winnerId)
    where.push(`winner_id = $${values.length}`)
  }

  if (filters.courseName) {
    values.push(filters.courseName)
    where.push(`course_name = $${values.length}`)
  }

  const fromIso = toIso(filters.dateFrom)
  if (fromIso) {
    values.push(fromIso)
    where.push(`finished_at >= $${values.length}`)
  }

  const toIsoDate = toIso(filters.dateTo)
  if (toIsoDate) {
    values.push(toIsoDate)
    where.push(`finished_at <= $${values.length}`)
  }

  const limit = Number.isFinite(filters.limit) ? Number(filters.limit) : 50
  values.push(limit)

  const result = await withClient((client) =>
    client.query(
      `
      SELECT race_id, finished_at, course_name, winner_id, leaderboard
      FROM races
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY finished_at DESC
      LIMIT $${values.length}
      `,
      values,
    ),
  )

  return result.rows.map((row) => ({
    raceId: row.race_id,
    finishedAt: row.finished_at,
    courseName: row.course_name,
    winnerId: row.winner_id,
    leaderboard: row.leaderboard ?? [],
  }))
}


