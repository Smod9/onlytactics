import type { ReplayRecording, RaceState, ReplayFrame } from '@/types/race'
import { withClient } from './index'

// ---------------------------------------------------------------------------
// Wind stats computation
// ---------------------------------------------------------------------------

export type WindStats = {
  avgSpeed: number
  minSpeed: number
  maxSpeed: number
  baselineWindDeg: number
  directionStddev: number
}

export const computeWindStats = (frames: ReplayFrame[]): WindStats | null => {
  const running = frames.filter((f) => f.state.phase === 'running')
  if (running.length === 0) return null

  let sumSpeed = 0
  let minSpeed = Infinity
  let maxSpeed = -Infinity
  let sumDir = 0
  let sumDirSq = 0
  const baseline = running[0].state.baselineWindDeg

  for (const frame of running) {
    const { speed, directionDeg } = frame.state.wind
    sumSpeed += speed
    if (speed < minSpeed) minSpeed = speed
    if (speed > maxSpeed) maxSpeed = speed
    const shift = directionDeg - baseline
    sumDir += shift
    sumDirSq += shift * shift
  }

  const n = running.length
  const avgSpeed = sumSpeed / n
  const meanShift = sumDir / n
  const variance = sumDirSq / n - meanShift * meanShift
  const directionStddev = Math.sqrt(Math.max(0, variance))

  return {
    avgSpeed,
    minSpeed: minSpeed === Infinity ? 0 : minSpeed,
    maxSpeed: maxSpeed === -Infinity ? 0 : maxSpeed,
    baselineWindDeg: baseline,
    directionStddev,
  }
}

// ---------------------------------------------------------------------------
// Low-point scoring
// ---------------------------------------------------------------------------

type BoatResult = {
  boatId: string
  userId: string | null
  displayName: string
  finishPosition: number | null
  finishTimeSeconds: number | null
  dnf: boolean
  ocs: boolean
  penalties: number
  protestPenalties: number
}

const computeResults = (
  finalState: RaceState,
  userBoatMap: Map<string, string | null>,
  dnfMode: 'dnf' | 'position' = 'dnf',
): BoatResult[] => {
  const results: BoatResult[] = []

  for (let i = 0; i < finalState.leaderboard.length; i++) {
    const boatId = finalState.leaderboard[i]
    const boat = finalState.boats[boatId]
    if (!boat) continue
    const hasFinishTime = typeof boat.finishTime === 'number' && boat.finishTime > 0
    const userId = userBoatMap.get(boatId) ?? null

    if (dnfMode === 'position') {
      results.push({
        boatId,
        userId,
        displayName: boat.name,
        finishPosition: i + 1,
        finishTimeSeconds: hasFinishTime ? boat.finishTime! : null,
        dnf: false,
        ocs: Boolean(boat.overEarly),
        penalties: boat.penalties ?? 0,
        protestPenalties: boat.protestPenalties ?? 0,
      })
    } else {
      const dnf = !hasFinishTime
      results.push({
        boatId,
        userId,
        displayName: boat.name,
        finishPosition: dnf ? null : results.filter((r) => !r.dnf).length + 1,
        finishTimeSeconds: hasFinishTime ? boat.finishTime! : null,
        dnf,
        ocs: Boolean(boat.overEarly),
        penalties: boat.penalties ?? 0,
        protestPenalties: boat.protestPenalties ?? 0,
      })
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// Save race stats
// ---------------------------------------------------------------------------

export const saveRaceStats = async (
  recording: ReplayRecording,
  finalState: RaceState,
  userBoatMap: Map<string, string | null>,
  dnfMode: 'dnf' | 'position' = 'dnf',
) => {
  const raceId = recording.meta.raceId
  const windStats = computeWindStats(recording.frames)
  const fleetSize = Object.keys(finalState.boats).length
  if (fleetSize === 0) return

  const results = computeResults(finalState, userBoatMap, dnfMode)
  const dnfPoints = fleetSize + 1

  // Race duration: time of the last running frame
  const runningFrames = recording.frames.filter((f) => f.state.phase === 'running')
  const raceDuration =
    runningFrames.length > 0
      ? runningFrames[runningFrames.length - 1].state.t - runningFrames[0].state.t
      : null

  await withClient(async (client) => {
    await client.query('BEGIN')
    try {
      // Insert race_conditions
      await client.query(
        `INSERT INTO race_conditions (
          race_id, fleet_size, laps,
          avg_wind_speed_kts, min_wind_speed_kts, max_wind_speed_kts,
          baseline_wind_deg, wind_direction_stddev,
          wind_field_enabled, wind_field_intensity_kts,
          course_name, race_duration_seconds
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (race_id) DO UPDATE SET
          fleet_size = EXCLUDED.fleet_size,
          laps = EXCLUDED.laps,
          avg_wind_speed_kts = EXCLUDED.avg_wind_speed_kts,
          min_wind_speed_kts = EXCLUDED.min_wind_speed_kts,
          max_wind_speed_kts = EXCLUDED.max_wind_speed_kts,
          baseline_wind_deg = EXCLUDED.baseline_wind_deg,
          wind_direction_stddev = EXCLUDED.wind_direction_stddev,
          wind_field_enabled = EXCLUDED.wind_field_enabled,
          wind_field_intensity_kts = EXCLUDED.wind_field_intensity_kts,
          course_name = EXCLUDED.course_name,
          race_duration_seconds = EXCLUDED.race_duration_seconds`,
        [
          raceId,
          fleetSize,
          finalState.lapsToFinish,
          windStats?.avgSpeed ?? null,
          windStats?.minSpeed ?? null,
          windStats?.maxSpeed ?? null,
          windStats?.baselineWindDeg ?? null,
          windStats?.directionStddev ?? null,
          Boolean(finalState.windField?.enabled),
          finalState.windField?.intensityKts ?? null,
          finalState.meta.courseName,
          raceDuration,
        ],
      )

      // Insert race_results
      for (const result of results) {
        const points =
          result.dnf || result.ocs ? dnfPoints : (result.finishPosition ?? dnfPoints)

        await client.query(
          `INSERT INTO race_results (
            race_id, user_id, boat_id, display_name,
            finish_position, finish_time_seconds, fleet_size, points,
            dnf, ocs, penalties, protest_penalties
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          ON CONFLICT (race_id, boat_id) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            display_name = EXCLUDED.display_name,
            finish_position = EXCLUDED.finish_position,
            finish_time_seconds = EXCLUDED.finish_time_seconds,
            fleet_size = EXCLUDED.fleet_size,
            points = EXCLUDED.points,
            dnf = EXCLUDED.dnf,
            ocs = EXCLUDED.ocs,
            penalties = EXCLUDED.penalties,
            protest_penalties = EXCLUDED.protest_penalties`,
          [
            raceId,
            result.userId,
            result.boatId,
            result.displayName,
            result.finishPosition,
            result.finishTimeSeconds,
            fleetSize,
            points,
            result.dnf,
            result.ocs,
            result.penalties,
            result.protestPenalties,
          ],
        )
      }

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    }
  })
}

// ---------------------------------------------------------------------------
// Query: user stats
// ---------------------------------------------------------------------------

export type UserStats = {
  userId: string
  totalRaces: number
  wins: number
  avgPoints: number
  bestPosition: number | null
  fastestTimeSeconds: number | null
  avgFinishPct: number | null
  byWindBand: {
    band: 'light' | 'medium' | 'heavy'
    races: number
    avgPoints: number
    wins: number
  }[]
  byShiftiness: {
    band: 'steady' | 'moderate' | 'shifty'
    races: number
    avgPoints: number
  }[]
}

export const getUserStats = async (userId: string): Promise<UserStats | null> => {
  return withClient(async (client) => {
    const base = await client.query(
      `SELECT
        count(*)::int AS total_races,
        count(*) FILTER (WHERE finish_position = 1)::int AS wins,
        coalesce(avg(points), 0) AS avg_points,
        min(finish_position) AS best_position,
        min(finish_time_seconds) AS fastest_time,
        coalesce(avg(
          CASE WHEN finish_position IS NOT NULL
            THEN 1.0 - (finish_position - 1.0) / NULLIF(fleet_size - 1.0, 0)
          END
        ), 0) AS avg_finish_pct
      FROM race_results
      WHERE user_id = $1`,
      [userId],
    )

    if (!base.rows[0] || Number(base.rows[0].total_races) === 0) return null
    const row = base.rows[0]

    const windBands = await client.query(
      `SELECT
        CASE
          WHEN c.avg_wind_speed_kts < 14 THEN 'light'
          WHEN c.avg_wind_speed_kts <= 18 THEN 'medium'
          ELSE 'heavy'
        END AS band,
        count(*)::int AS races,
        coalesce(avg(r.points), 0) AS avg_points,
        count(*) FILTER (WHERE r.finish_position = 1)::int AS wins
      FROM race_results r
      JOIN race_conditions c ON c.race_id = r.race_id
      WHERE r.user_id = $1 AND c.avg_wind_speed_kts IS NOT NULL
      GROUP BY band
      ORDER BY band`,
      [userId],
    )

    const shiftBands = await client.query(
      `SELECT
        CASE
          WHEN c.wind_direction_stddev < 4 THEN 'steady'
          WHEN c.wind_direction_stddev <= 8 THEN 'moderate'
          ELSE 'shifty'
        END AS band,
        count(*)::int AS races,
        coalesce(avg(r.points), 0) AS avg_points
      FROM race_results r
      JOIN race_conditions c ON c.race_id = r.race_id
      WHERE r.user_id = $1 AND c.wind_direction_stddev IS NOT NULL
      GROUP BY band
      ORDER BY band`,
      [userId],
    )

    return {
      userId,
      totalRaces: Number(row.total_races),
      wins: Number(row.wins),
      avgPoints: Number(Number(row.avg_points).toFixed(2)),
      bestPosition: row.best_position != null ? Number(row.best_position) : null,
      fastestTimeSeconds:
        row.fastest_time != null ? Number(Number(row.fastest_time).toFixed(2)) : null,
      avgFinishPct:
        row.avg_finish_pct != null
          ? Number(Number(row.avg_finish_pct).toFixed(3))
          : null,
      byWindBand: windBands.rows.map((r) => ({
        band: r.band as 'light' | 'medium' | 'heavy',
        races: Number(r.races),
        avgPoints: Number(Number(r.avg_points).toFixed(2)),
        wins: Number(r.wins),
      })),
      byShiftiness: shiftBands.rows.map((r) => ({
        band: r.band as 'steady' | 'moderate' | 'shifty',
        races: Number(r.races),
        avgPoints: Number(Number(r.avg_points).toFixed(2)),
      })),
    }
  })
}

// ---------------------------------------------------------------------------
// Query: leaderboard
// ---------------------------------------------------------------------------

export type LeaderboardEntry = {
  userId: string
  displayName: string
  totalRaces: number
  wins: number
  avgPoints: number
  bestPosition: number | null
}

export type LeaderboardOptions = {
  minRaces?: number
  limit?: number
}

export const getLeaderboard = async (
  options: LeaderboardOptions = {},
): Promise<LeaderboardEntry[]> => {
  const minRaces = options.minRaces ?? 3
  const limit = options.limit ?? 50

  return withClient(async (client) => {
    const result = await client.query(
      `SELECT
        r.user_id,
        (array_agg(r.display_name ORDER BY r.created_at DESC))[1] AS display_name,
        count(*)::int AS total_races,
        count(*) FILTER (WHERE r.finish_position = 1)::int AS wins,
        avg(r.points) AS avg_points,
        min(r.finish_position) AS best_position
      FROM race_results r
      WHERE r.user_id IS NOT NULL
      GROUP BY r.user_id
      HAVING count(*) >= $1
      ORDER BY avg(r.points) ASC, count(*) DESC
      LIMIT $2`,
      [minRaces, limit],
    )

    return result.rows.map((row) => ({
      userId: row.user_id,
      displayName: row.display_name,
      totalRaces: Number(row.total_races),
      wins: Number(row.wins),
      avgPoints: Number(Number(row.avg_points).toFixed(2)),
      bestPosition: row.best_position != null ? Number(row.best_position) : null,
    }))
  })
}

// ---------------------------------------------------------------------------
// Query: user race history
// ---------------------------------------------------------------------------

export type RaceHistoryEntry = {
  raceId: string
  finishedAt: string
  courseName: string | null
  finishPosition: number | null
  finishTimeSeconds: number | null
  timeBehindFirst: number | null
  fleetSize: number
  points: number
  dnf: boolean
  avgWindSpeedKts: number | null
  windDirectionStddev: number | null
}

export type RaceHistoryOptions = {
  page?: number
  limit?: number
}

export const getUserRaceHistory = async (
  userId: string,
  options: RaceHistoryOptions = {},
): Promise<RaceHistoryEntry[]> => {
  const limit = options.limit ?? 20
  const page = options.page ?? 1
  const offset = (page - 1) * limit

  return withClient(async (client) => {
    const result = await client.query(
      `SELECT
        r.race_id,
        races.finished_at,
        r.finish_position,
        r.finish_time_seconds,
        r.fleet_size,
        r.points,
        r.dnf,
        c.course_name,
        c.avg_wind_speed_kts,
        c.wind_direction_stddev,
        r.finish_time_seconds - first_place.finish_time_seconds AS time_behind_first
      FROM race_results r
      LEFT JOIN race_conditions c ON c.race_id = r.race_id
      LEFT JOIN races ON races.race_id = r.race_id
      LEFT JOIN LATERAL (
        SELECT finish_time_seconds FROM race_results
        WHERE race_id = r.race_id AND finish_position = 1
        LIMIT 1
      ) first_place ON true
      WHERE r.user_id = $1
      ORDER BY r.created_at DESC
      LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    )

    return result.rows.map((row) => ({
      raceId: row.race_id,
      finishedAt: row.finished_at,
      courseName: row.course_name ?? null,
      finishPosition: row.finish_position != null ? Number(row.finish_position) : null,
      finishTimeSeconds:
        row.finish_time_seconds != null ? Number(row.finish_time_seconds) : null,
      timeBehindFirst:
        row.time_behind_first != null ? Number(Number(row.time_behind_first).toFixed(2)) : null,
      fleetSize: Number(row.fleet_size),
      points: Number(row.points),
      dnf: Boolean(row.dnf),
      avgWindSpeedKts:
        row.avg_wind_speed_kts != null ? Number(row.avg_wind_speed_kts) : null,
      windDirectionStddev:
        row.wind_direction_stddev != null ? Number(row.wind_direction_stddev) : null,
    }))
  })
}
