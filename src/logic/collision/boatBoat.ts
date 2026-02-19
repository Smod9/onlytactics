import type { RaceState, Vec2 } from '@/types/race'
import { boatCapsuleCircles, type BoatCircle } from '@/logic/boatGeometry'

export type BoatBoatCollisionResult = {
  correctedPositions: Map<string, Vec2>
  collidedPairs: Array<[string, string]>
}

/**
 * Resolve boat-to-boat penetrations by pushing overlapping capsule circles apart.
 * Each boat accumulates push vectors from all its overlapping circle pairs with
 * every other boat. The push is split 50/50 between the two boats.
 */
export const resolveBoatBoatCollisions = (
  state: RaceState,
): BoatBoatCollisionResult => {
  const boats = Object.values(state.boats)
  const pushes = new Map<string, Vec2>()
  const collidedPairs: Array<[string, string]> = []

  for (let i = 0; i < boats.length; i += 1) {
    for (let j = i + 1; j < boats.length; j += 1) {
      const a = boats[i]
      const b = boats[j]
      const circlesA = boatCapsuleCircles(a)
      const circlesB = boatCapsuleCircles(b)

      let pairCollided = false

      for (const cA of circlesA) {
        for (const cB of circlesB) {
          const push = circlePenetration(cA, cB)
          if (!push) continue
          pairCollided = true
          accumPush(pushes, a.id, push.x * 0.5, push.y * 0.5)
          accumPush(pushes, b.id, -push.x * 0.5, -push.y * 0.5)
        }
      }

      if (pairCollided) {
        collidedPairs.push([a.id, b.id])
      }
    }
  }

  const correctedPositions = new Map<string, Vec2>()
  pushes.forEach((push, boatId) => {
    const boat = state.boats[boatId]
    if (!boat) return
    if (push.x === 0 && push.y === 0) return
    correctedPositions.set(boatId, {
      x: boat.pos.x + push.x,
      y: boat.pos.y + push.y,
    })
  })

  return { correctedPositions, collidedPairs }
}

function circlePenetration(
  a: BoatCircle,
  b: BoatCircle,
): Vec2 | null {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const minDist = a.r + b.r
  const distSq = dx * dx + dy * dy
  if (distSq >= minDist * minDist) return null

  const dist = Math.sqrt(distSq)
  if (dist < 0.001) {
    const penetration = minDist
    return { x: penetration, y: 0 }
  }

  const penetration = minDist - dist
  const nx = dx / dist
  const ny = dy / dist
  return { x: nx * penetration, y: ny * penetration }
}

function accumPush(pushes: Map<string, Vec2>, id: string, x: number, y: number) {
  const existing = pushes.get(id)
  if (existing) {
    existing.x += x
    existing.y += y
  } else {
    pushes.set(id, { x, y })
  }
}
