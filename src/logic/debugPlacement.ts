import type { BoatState, RaceState } from '@/types/race'
import { normalizeDeg } from '@/logic/physics'

const APPROACH_OFFSET_METERS = 35
const PREV_POS_OFFSET_SCALE = 0.6

const cloneVec = (x: number, y: number) => ({ x, y })

export const placeBoatNearNextMark = (boat: BoatState, state: RaceState) => {
  const marks = state.marks
  if (!marks.length) return false
  const nextIndex = Math.max(0, boat.nextMarkIndex ?? 0) % marks.length
  const mark = marks[nextIndex]
  if (!mark) return false

  const approachDir = mark.y < boat.pos.y ? -1 : 1
  const targetY = mark.y - approachDir * APPROACH_OFFSET_METERS
  const prevY = targetY + approachDir * APPROACH_OFFSET_METERS * PREV_POS_OFFSET_SCALE

  boat.prevPos = cloneVec(mark.x, prevY)
  boat.pos = cloneVec(mark.x, targetY)

  const heading = approachDir < 0 ? 0 : 180
  boat.headingDeg = normalizeDeg(heading)
  boat.desiredHeadingDeg = boat.headingDeg
  boat.speed = Math.max(boat.speed, 6)
  boat.distanceToNextMark = Math.abs(mark.y - boat.pos.y)
  boat.inMarkZone = false
  boat.rightsSuspended = false

  return true
}

