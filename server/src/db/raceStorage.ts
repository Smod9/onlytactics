import type { ReplayRecording, RaceState } from '@/types/race'
import { withClient } from './index'

export type RaceSummary = {
  raceId: string
  finishedAt: string
  courseName?: string | null
  winnerId?: string | null
  leaderboard: string[]
}

export type AdminRaceEntry = {
  raceId: string
  finishedAt: string
  courseName: string | null
  fleetSize: number
  humanPlayerCount: number
  finisherCount: number
  totalPenalties: number
  raceDurationSeconds: number | null
  avgWindSpeedKts: number | null
  trainingApproved: boolean
}

export type AdminRaceFilters = {
  trainingApproved?: boolean
  courseName?: string
  limit?: number
  offset?: number
}

export type TrainingStats = {
  approvedRaces: number
  totalFrames: number
  estimatedRows: number
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
        JSON.stringify(finalState.leaderboard),
        winnerId,
        JSON.stringify(recording),
        JSON.stringify(metadata),
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

export const getAdminRaceList = async (
  filters: AdminRaceFilters,
): Promise<{ races: AdminRaceEntry[]; total: number }> => {
  const where: string[] = []
  const values: Array<string | number | boolean> = []

  if (filters.trainingApproved !== undefined) {
    values.push(filters.trainingApproved)
    where.push(`r.training_approved = $${values.length}`)
  }

  if (filters.courseName) {
    values.push(filters.courseName)
    where.push(`r.course_name = $${values.length}`)
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const limit = Math.min(Math.max(filters.limit ?? 25, 1), 100)
  const offset = Math.max(filters.offset ?? 0, 0)

  const countResult = await withClient((client) =>
    client.query(`SELECT COUNT(*)::int AS total FROM races r ${whereClause}`, values),
  )
  const total = countResult.rows[0]?.total ?? 0

  const queryValues = [...values, limit, offset]
  const result = await withClient((client) =>
    client.query(
      `
      SELECT
        r.race_id,
        r.finished_at,
        r.course_name,
        r.training_approved,
        COALESCE(rc.fleet_size, jsonb_array_length(r.leaderboard)) AS fleet_size,
        COALESCE(rc.race_duration_seconds, 0) AS race_duration_seconds,
        rc.avg_wind_speed_kts,
        COALESCE(rr_agg.finisher_count, 0) AS finisher_count,
        COALESCE(rr_agg.human_player_count, 0) AS human_player_count,
        COALESCE(rr_agg.total_penalties, 0) AS total_penalties
      FROM races r
      LEFT JOIN race_conditions rc ON rc.race_id = r.race_id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE NOT dnf) AS finisher_count,
          COUNT(*) FILTER (WHERE user_id IS NOT NULL) AS human_player_count,
          COALESCE(SUM(penalties + protest_penalties), 0) AS total_penalties
        FROM race_results
        WHERE race_results.race_id = r.race_id
      ) rr_agg ON true
      ${whereClause}
      ORDER BY r.finished_at DESC
      LIMIT $${queryValues.length - 1} OFFSET $${queryValues.length}
      `,
      queryValues,
    ),
  )

  const races: AdminRaceEntry[] = result.rows.map((row) => ({
    raceId: row.race_id,
    finishedAt: row.finished_at,
    courseName: row.course_name,
    fleetSize: Number(row.fleet_size) || 0,
    humanPlayerCount: Number(row.human_player_count) || 0,
    finisherCount: Number(row.finisher_count) || 0,
    totalPenalties: Number(row.total_penalties) || 0,
    raceDurationSeconds: row.race_duration_seconds ? Number(row.race_duration_seconds) : null,
    avgWindSpeedKts: row.avg_wind_speed_kts ? Number(row.avg_wind_speed_kts) : null,
    trainingApproved: row.training_approved,
  }))

  return { races, total }
}

export const setTrainingApproved = async (
  raceId: string,
  approved: boolean,
): Promise<boolean> => {
  const result = await withClient((client) =>
    client.query(
      'UPDATE races SET training_approved = $1 WHERE race_id = $2',
      [approved, raceId],
    ),
  )
  return (result.rowCount ?? 0) > 0
}

export const getTrainingStats = async (): Promise<TrainingStats> => {
  const result = await withClient((client) =>
    client.query(`
      SELECT
        COUNT(*)::int AS approved_races,
        COALESCE(SUM(jsonb_array_length(replay_data->'frames')), 0)::int AS total_frames
      FROM races
      WHERE training_approved = true
    `),
  )
  const row = result.rows[0]
  const approvedRaces = row?.approved_races ?? 0
  const totalFrames = row?.total_frames ?? 0
  return {
    approvedRaces,
    totalFrames,
    estimatedRows: totalFrames * 2,
  }
}
