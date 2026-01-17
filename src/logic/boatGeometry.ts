import type { BoatState, Vec2 } from '@/types/race'
import {
  BOAT_BOW_OFFSET,
  BOAT_BOW_RADIUS,
  BOAT_STERN_OFFSET,
  BOAT_STERN_RADIUS,
} from '@/logic/constants'

export type BoatCircle = { x: number; y: number; r: number }

export const headingForward = (headingDeg: number) => {
  const rad = (headingDeg * Math.PI) / 180
  // Matches scene coords (same convention used throughout physics + rules):
  // headingDeg=0 => north (negative y)
  return { x: Math.sin(rad), y: -Math.cos(rad) }
}

export const boatCapsuleCircles = (
  boat: BoatState,
  pos: Vec2 = boat.pos,
): BoatCircle[] => {
  const dir = headingForward(boat.headingDeg)
  const bow: BoatCircle = {
    x: pos.x + dir.x * BOAT_BOW_OFFSET,
    y: pos.y + dir.y * BOAT_BOW_OFFSET,
    r: BOAT_BOW_RADIUS,
  }
  const stern: BoatCircle = {
    x: pos.x + dir.x * BOAT_STERN_OFFSET,
    y: pos.y + dir.y * BOAT_STERN_OFFSET,
    r: BOAT_STERN_RADIUS,
  }
  return [bow, stern]
}
