/**
 * Bullet Time - Mark Rounding Slow-Motion
 *
 * Implements per-boat time scaling based on distance to the boat's next mark.
 * Only boats within the "bullet time zone" slow down, with the slowdown
 * proportional to how deep they are in the zone.
 *
 * The gradient prevents compression: boats closer to the mark move slower,
 * so trailing boats don't unfairly catch up during the transition.
 */

import {
  BOAT_LENGTH,
  BULLET_TIME_ENABLED,
  BULLET_TIME_OUTER_RADIUS_BL,
  BULLET_TIME_INNER_RADIUS_BL,
  BULLET_TIME_MIN_SCALE,
} from './constants'
import { distanceBetween } from '@/utils/geometry'
import type { RaceState } from '@/types/race'

/**
 * Smooth hermite interpolation (ease in/out)
 * Maps t from [0,1] to [0,1] with smooth acceleration/deceleration
 */
const smoothstep = (t: number): number => t * t * (3 - 2 * t)

/**
 * Compute per-boat time scales based on distance to each boat's next mark.
 *
 * @param state - Current race state
 * @returns Record mapping boat ID to time scale (1.0 = normal, lower = slower)
 */
export function computeBoatTimeScales(state: RaceState): Record<string, number> {
  const scales: Record<string, number> = {}

  if (!BULLET_TIME_ENABLED) {
    Object.keys(state.boats).forEach((id) => {
      scales[id] = 1
    })
    return scales
  }

  const outerRadius = BULLET_TIME_OUTER_RADIUS_BL * BOAT_LENGTH
  const innerRadius = BULLET_TIME_INNER_RADIUS_BL * BOAT_LENGTH

  // Start/finish line mark indices (committee boat and pin) - no bullet time for these
  const startFinishMarkIndices = new Set([1, 2])

  Object.values(state.boats).forEach((boat) => {
    // Skip bullet time for start/finish line approaches
    if (startFinishMarkIndices.has(boat.nextMarkIndex)) {
      scales[boat.id] = 1
      return
    }

    // Get the boat's next mark
    const nextMark = state.marks[boat.nextMarkIndex]
    if (!nextMark) {
      scales[boat.id] = 1
      return
    }

    const dist = distanceBetween(boat.pos, nextMark)

    if (dist >= outerRadius) {
      // Outside zone: normal speed
      scales[boat.id] = 1
    } else if (dist <= innerRadius) {
      // Deep in zone: max slowdown
      scales[boat.id] = BULLET_TIME_MIN_SCALE
    } else {
      // Gradual transition with smooth easing
      // t=0 at inner radius, t=1 at outer radius
      const t = (dist - innerRadius) / (outerRadius - innerRadius)
      const eased = smoothstep(t)
      scales[boat.id] = BULLET_TIME_MIN_SCALE + eased * (1 - BULLET_TIME_MIN_SCALE)
    }
  })

  return scales
}
