import type { BoatState, RaceState } from '@/types/race'

const defaultDistance = Number.POSITIVE_INFINITY

const getLap = (boat: BoatState) => boat.lap ?? 0

const getNextMarkIndex = (boat: BoatState) => boat.nextMarkIndex ?? 0

const getDistanceToNext = (boat: BoatState) => boat.distanceToNextMark ?? defaultDistance

const compareFinished = (a: BoatState, b: BoatState) => {
  const finishA = a.finishTime ?? Number.POSITIVE_INFINITY
  const finishB = b.finishTime ?? Number.POSITIVE_INFINITY
  if (finishA === finishB) return 0
  return finishA < finishB ? -1 : 1
}

const compareInFlight = (a: BoatState, b: BoatState) => {
  const lapDiff = getLap(b) - getLap(a)
  if (lapDiff !== 0) return lapDiff

  const markDiff = getNextMarkIndex(b) - getNextMarkIndex(a)
  if (markDiff !== 0) return markDiff

  const distDiff = getDistanceToNext(a) - getDistanceToNext(b)
  if (distDiff !== 0) return distDiff

  return (b.speed ?? 0) - (a.speed ?? 0)
}

export const assignLeaderboard = (state: RaceState) => {
  const boats = Object.values(state.boats)
  const sorted = boats.sort((a, b) => {
    const aFinished = Boolean(a.finished)
    const bFinished = Boolean(b.finished)
    if (aFinished && bFinished) return compareFinished(a, b)
    if (aFinished) return -1
    if (bFinished) return 1
    return compareInFlight(a, b)
  })
  state.leaderboard = sorted.map((boat) => boat.id)
}


