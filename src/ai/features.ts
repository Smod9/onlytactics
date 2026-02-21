import type { RaceState, BoatState, Vec2 } from '@/types/race'

export type BoatFeatures = {
  twaSin: number
  twaCos: number
  windSpeed: number
  boatSpeed: number
  bearingToMarkSin: number
  bearingToMarkCos: number
  distToMark: number
  legUpwind: number
  legDownwind: number
  tack: number
  raceTime: number
  stallTimer: number
  tackTimer: number
  near1Bearing: number
  near1Dist: number
  near2Bearing: number
  near2Dist: number
  near3Bearing: number
  near3Dist: number
}

export type TrainingRow = {
  features: BoatFeatures
  targetTwaSin: number
  targetTwaCos: number
}

export const FEATURE_NAMES: (keyof BoatFeatures)[] = [
  'twaSin', 'twaCos', 'windSpeed', 'boatSpeed',
  'bearingToMarkSin', 'bearingToMarkCos', 'distToMark',
  'legUpwind', 'legDownwind', 'tack', 'raceTime',
  'stallTimer', 'tackTimer',
  'near1Bearing', 'near1Dist',
  'near2Bearing', 'near2Dist',
  'near3Bearing', 'near3Dist',
]

const DEG2RAD = Math.PI / 180

const normalizeDeg = (deg: number) => {
  const wrapped = deg % 360
  return wrapped < 0 ? wrapped + 360 : wrapped
}

const angleDiff = (targetDeg: number, currentDeg: number) => {
  let diff = targetDeg - currentDeg
  diff = ((((diff + 180) % 360) + 360) % 360) - 180
  return diff
}

const distance = (a: Vec2, b: Vec2) =>
  Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)

const bearingDeg = (from: Vec2, to: Vec2) => {
  const dx = to.x - from.x
  const dy = to.y - from.y
  return normalizeDeg((Math.atan2(dx, -dy) * 180) / Math.PI)
}

function getNextMark(state: RaceState, boat: BoatState): Vec2 | null {
  const idx = boat.nextMarkIndex
  if (idx >= 0 && idx < state.marks.length) return state.marks[idx]
  return state.marks[0] ?? null
}

function isUpwindLeg(state: RaceState, boat: BoatState): boolean {
  const mark = getNextMark(state, boat)
  if (!mark) return true
  const bearing = bearingDeg(boat.pos, mark)
  const relToWind = Math.abs(angleDiff(bearing, state.wind.directionDeg))
  return relToWind < 90
}

function getNearestBoats(state: RaceState, boatId: string, count: number) {
  const boat = state.boats[boatId]
  if (!boat) return []

  const others = Object.values(state.boats)
    .filter((b) => b.id !== boatId)
    .map((b) => ({ boat: b, dist: distance(boat.pos, b.pos) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, count)

  return others
}

export function extractFeatures(state: RaceState, boat: BoatState): BoatFeatures {
  const windDir = state.wind.directionDeg
  const twa = angleDiff(boat.headingDeg, windDir)
  const twaRad = twa * DEG2RAD

  const mark = getNextMark(state, boat)
  let bearingToMarkRelWind = 0
  let dist = 0
  if (mark) {
    const bearing = bearingDeg(boat.pos, mark)
    bearingToMarkRelWind = angleDiff(bearing, windDir) * DEG2RAD
    dist = distance(boat.pos, mark)
  }

  const upwind = isUpwindLeg(state, boat)
  const tackSide = twa >= 0 ? 1 : -1

  const nearest = getNearestBoats(state, boat.id, 3)
  const nearFeats: number[] = []
  for (let i = 0; i < 3; i++) {
    if (i < nearest.length) {
      const relBearing = angleDiff(
        bearingDeg(boat.pos, nearest[i].boat.pos),
        windDir,
      ) * DEG2RAD
      nearFeats.push(Math.sin(relBearing), Math.min(nearest[i].dist / 500, 1))
    } else {
      nearFeats.push(0, 1)
    }
  }

  return {
    twaSin: Math.sin(twaRad),
    twaCos: Math.cos(twaRad),
    windSpeed: Math.min(state.wind.speed / 30, 1),
    boatSpeed: Math.min(boat.speed / 30, 1),
    bearingToMarkSin: Math.sin(bearingToMarkRelWind),
    bearingToMarkCos: Math.cos(bearingToMarkRelWind),
    distToMark: Math.min(dist / 1000, 1),
    legUpwind: upwind ? 1 : 0,
    legDownwind: upwind ? 0 : 1,
    tack: tackSide,
    raceTime: Math.min(Math.max(state.t, 0) / 600, 1),
    stallTimer: Math.min(boat.stallTimer / 3, 1),
    tackTimer: Math.min(boat.tackTimer / 3, 1),
    near1Bearing: nearFeats[0],
    near1Dist: nearFeats[1],
    near2Bearing: nearFeats[2],
    near2Dist: nearFeats[3],
    near3Bearing: nearFeats[4],
    near3Dist: nearFeats[5],
  }
}

export function extractTrainingRow(state: RaceState, boat: BoatState): TrainingRow {
  const features = extractFeatures(state, boat)
  const desiredTwa = angleDiff(boat.desiredHeadingDeg, state.wind.directionDeg) * DEG2RAD
  return {
    features,
    targetTwaSin: Math.sin(desiredTwa),
    targetTwaCos: Math.cos(desiredTwa),
  }
}

export function featuresToArray(f: BoatFeatures): number[] {
  return FEATURE_NAMES.map((k) => f[k])
}
