import { withClient } from './index'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Regatta = {
  id: string
  name: string
  description: string
  numRaces: number
  throwoutCount: number
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export type RegattaRaceEntry = {
  raceId: string
  raceNumber: number
  createdAt: string
}

export type RegattaStandingEntry = {
  userId: string
  displayName: string
  racePoints: (number | null)[]
  droppedIndices: number[]
  totalPoints: number
  racesCompleted: number
}

export type RegattaDetail = Regatta & {
  races: RegattaRaceEntry[]
  standings: RegattaStandingEntry[]
  completedRaceCount: number
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export const createRegatta = async (
  name: string,
  description: string,
  numRaces: number,
  throwoutCount: number,
  createdBy: string | null,
): Promise<Regatta> => {
  return withClient(async (client) => {
    const result = await client.query(
      `INSERT INTO regattas (name, description, num_races, throwout_count, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, description, numRaces, throwoutCount, createdBy],
    )
    return rowToRegatta(result.rows[0])
  })
}

export const getRegatta = async (id: string): Promise<Regatta | null> => {
  return withClient(async (client) => {
    const result = await client.query('SELECT * FROM regattas WHERE id = $1', [id])
    if (result.rows.length === 0) return null
    return rowToRegatta(result.rows[0])
  })
}

export const listRegattas = async (): Promise<Regatta[]> => {
  return withClient(async (client) => {
    const result = await client.query('SELECT * FROM regattas ORDER BY created_at DESC')
    return result.rows.map(rowToRegatta)
  })
}

export const updateRegatta = async (
  id: string,
  fields: Partial<Pick<Regatta, 'name' | 'description' | 'numRaces' | 'throwoutCount'>>,
): Promise<Regatta | null> => {
  const sets: string[] = []
  const values: unknown[] = []
  let idx = 1

  if (fields.name !== undefined) {
    sets.push(`name = $${idx++}`)
    values.push(fields.name)
  }
  if (fields.description !== undefined) {
    sets.push(`description = $${idx++}`)
    values.push(fields.description)
  }
  if (fields.numRaces !== undefined) {
    sets.push(`num_races = $${idx++}`)
    values.push(fields.numRaces)
  }
  if (fields.throwoutCount !== undefined) {
    sets.push(`throwout_count = $${idx++}`)
    values.push(fields.throwoutCount)
  }

  if (sets.length === 0) return getRegatta(id)

  sets.push(`updated_at = now()`)
  values.push(id)

  return withClient(async (client) => {
    const result = await client.query(
      `UPDATE regattas SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    )
    if (result.rows.length === 0) return null
    return rowToRegatta(result.rows[0])
  })
}

// ---------------------------------------------------------------------------
// Regatta-race linking
// ---------------------------------------------------------------------------

export const addRaceToRegatta = async (
  regattaId: string,
  raceId: string,
  raceNumber: number,
): Promise<void> => {
  await withClient(async (client) => {
    await client.query(
      `INSERT INTO regatta_races (regatta_id, race_id, race_number)
       VALUES ($1, $2, $3)
       ON CONFLICT (regatta_id, race_id) DO UPDATE SET race_number = EXCLUDED.race_number`,
      [regattaId, raceId, raceNumber],
    )
  })
}

export const getNextRaceNumber = async (regattaId: string): Promise<number> => {
  return withClient(async (client) => {
    const result = await client.query(
      `SELECT COALESCE(MAX(race_number), 0) + 1 AS next_num FROM regatta_races WHERE regatta_id = $1`,
      [regattaId],
    )
    return Number(result.rows[0].next_num)
  })
}

export const removeRaceFromRegatta = async (
  regattaId: string,
  raceId: string,
): Promise<void> => {
  await withClient(async (client) => {
    await client.query(
      'DELETE FROM regatta_races WHERE regatta_id = $1 AND race_id = $2',
      [regattaId, raceId],
    )
  })
}

export const getRegattaRaces = async (regattaId: string): Promise<RegattaRaceEntry[]> => {
  return withClient(async (client) => {
    const result = await client.query(
      `SELECT race_id, race_number, created_at
       FROM regatta_races
       WHERE regatta_id = $1
       ORDER BY race_number ASC`,
      [regattaId],
    )
    return result.rows.map((row) => ({
      raceId: row.race_id,
      raceNumber: Number(row.race_number),
      createdAt: row.created_at,
    }))
  })
}

// ---------------------------------------------------------------------------
// Standings computation
// ---------------------------------------------------------------------------

export const getRegattaDetail = async (id: string): Promise<RegattaDetail | null> => {
  const regatta = await getRegatta(id)
  if (!regatta) return null

  const races = await getRegattaRaces(id)
  const standings = await computeStandings(id, regatta.throwoutCount, races)

  return {
    ...regatta,
    races,
    standings,
    completedRaceCount: races.length,
  }
}

const computeStandings = async (
  regattaId: string,
  throwoutCount: number,
  races: RegattaRaceEntry[],
): Promise<RegattaStandingEntry[]> => {
  if (races.length === 0) return []

  const raceIds = races.map((r) => r.raceId)

  return withClient(async (client) => {
    const result = await client.query(
      `SELECT
        rr.race_id,
        rr.user_id,
        rr.display_name,
        rr.points,
        rr.fleet_size
       FROM race_results rr
       WHERE rr.race_id = ANY($1)
         AND rr.user_id IS NOT NULL
       ORDER BY rr.race_id, rr.points ASC`,
      [raceIds],
    )

    // Group results by user
    const userMap = new Map<string, {
      displayName: string
      pointsByRace: Map<string, number>
    }>()

    for (const row of result.rows) {
      const userId = row.user_id as string
      let entry = userMap.get(userId)
      if (!entry) {
        entry = { displayName: row.display_name, pointsByRace: new Map() }
        userMap.set(userId, entry)
      }
      entry.displayName = row.display_name
      entry.pointsByRace.set(row.race_id, Number(row.points))
    }

    const standings: RegattaStandingEntry[] = []

    for (const [userId, data] of userMap) {
      const racePoints: (number | null)[] = raceIds.map(
        (rId) => data.pointsByRace.get(rId) ?? null,
      )

      const { total, droppedIndices } = computeWithThrowouts(racePoints, throwoutCount)

      standings.push({
        userId,
        displayName: data.displayName,
        racePoints,
        droppedIndices,
        totalPoints: total,
        racesCompleted: racePoints.filter((p) => p !== null).length,
      })
    }

    standings.sort((a, b) => a.totalPoints - b.totalPoints || b.racesCompleted - a.racesCompleted)
    return standings
  })
}

/**
 * Low-point scoring with throwouts: drop the N worst results and sum the rest.
 * Races the sailor did not participate in are scored as null (not counted).
 */
const computeWithThrowouts = (
  racePoints: (number | null)[],
  throwoutCount: number,
): { total: number; droppedIndices: number[] } => {
  const scored: { points: number; index: number }[] = []
  for (let i = 0; i < racePoints.length; i++) {
    if (racePoints[i] !== null) {
      scored.push({ points: racePoints[i]!, index: i })
    }
  }

  if (scored.length === 0) return { total: 0, droppedIndices: [] }

  // Sort descending so worst scores come first
  const sorted = [...scored].sort((a, b) => b.points - a.points)
  const toDrop = Math.min(throwoutCount, Math.max(0, scored.length - 1))
  const droppedIndices = sorted.slice(0, toDrop).map((s) => s.index)
  const droppedSet = new Set(droppedIndices)

  let total = 0
  for (const s of scored) {
    if (!droppedSet.has(s.index)) {
      total += s.points
    }
  }

  return { total, droppedIndices }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const rowToRegatta = (row: Record<string, unknown>): Regatta => ({
  id: row.id as string,
  name: row.name as string,
  description: (row.description as string) ?? '',
  numRaces: Number(row.num_races),
  throwoutCount: Number(row.throwout_count),
  createdBy: (row.created_by as string) ?? null,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
})
