import type { BoatState, RaceState } from '@/types/race'

const hasPenalty = (boat: BoatState) => boat.penalties > 0 || boat.overEarly

export const compareBoats = (a: BoatState, b: BoatState) => {
  if (a.finished && b.finished) {
    const aFinish = a.finishTime ?? Number.POSITIVE_INFINITY
    const bFinish = b.finishTime ?? Number.POSITIVE_INFINITY
    if (aFinish !== bFinish) {
      return aFinish - bFinish
    }
  } else if (a.finished !== b.finished) {
    return a.finished ? -1 : 1
  }

  const aPenalty = hasPenalty(a)
  const bPenalty = hasPenalty(b)
  if (aPenalty !== bPenalty) {
    return aPenalty ? 1 : -1
  }

  if ((b.lap ?? 0) !== (a.lap ?? 0)) {
    return (b.lap ?? 0) - (a.lap ?? 0)
  }

  if ((b.nextMarkIndex ?? 0) !== (a.nextMarkIndex ?? 0)) {
    return (b.nextMarkIndex ?? 0) - (a.nextMarkIndex ?? 0)
  }

  return (a.distanceToNextMark ?? Number.POSITIVE_INFINITY) - (b.distanceToNextMark ?? Number.POSITIVE_INFINITY)
}

export const assignLeaderboard = (state: RaceState) => {
  const boats = Object.values(state.boats).sort(compareBoats)
  state.leaderboard = boats.map((boat) => boat.id)
}

