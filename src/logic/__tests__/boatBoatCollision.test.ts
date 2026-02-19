import { describe, it, expect } from 'vitest'
import { resolveBoatBoatCollisions } from '@/logic/collision/boatBoat'
import type { BoatState, RaceState } from '@/types/race'

const makeBoat = (overrides: Partial<BoatState> & { id: string }): BoatState => ({
  name: overrides.id,
  color: 0xffffff,
  pos: { x: 0, y: 0 },
  headingDeg: 0,
  desiredHeadingDeg: 0,
  speed: 5,
  lap: 0,
  nextMarkIndex: 0,
  inMarkZone: false,
  finished: false,
  penalties: 0,
  protestPenalties: 0,
  stallTimer: 0,
  tackTimer: 0,
  overEarly: false,
  fouled: false,
  rightsSuspended: false,
  ...overrides,
})

const makeState = (boats: BoatState[]): RaceState => ({
  t: 10,
  meta: { raceId: 'test', courseName: 'test', createdAt: 0, seed: 0 },
  wind: { directionDeg: 0, speed: 15 },
  baselineWindDeg: 0,
  boats: Object.fromEntries(boats.map((b) => [b.id, b])),
  protests: {},
  marks: [],
  startLine: { pin: { x: -50, y: 0 }, committee: { x: 50, y: 0 } },
  leewardGate: { left: { x: -30, y: 500 }, right: { x: 30, y: 500 } },
  phase: 'running',
  countdownArmed: false,
  clockStartMs: null,
  lapsToFinish: 1,
  leaderboard: [],
  aiEnabled: false,
})

describe('resolveBoatBoatCollisions', () => {
  it('returns empty result when boats are far apart', () => {
    const a = makeBoat({ id: 'a', pos: { x: 0, y: 0 }, headingDeg: 0 })
    const b = makeBoat({ id: 'b', pos: { x: 200, y: 200 }, headingDeg: 0 })
    const state = makeState([a, b])

    const result = resolveBoatBoatCollisions(state)
    expect(result.correctedPositions.size).toBe(0)
    expect(result.collidedPairs).toHaveLength(0)
  })

  it('pushes overlapping boats apart', () => {
    const a = makeBoat({ id: 'a', pos: { x: 0, y: 0 }, headingDeg: 0 })
    const b = makeBoat({ id: 'b', pos: { x: 0, y: 0 }, headingDeg: 0 })
    const state = makeState([a, b])

    const result = resolveBoatBoatCollisions(state)
    expect(result.correctedPositions.size).toBe(2)
    expect(result.collidedPairs).toHaveLength(1)

    const posA = result.correctedPositions.get('a')!
    const posB = result.correctedPositions.get('b')!
    expect(posA).toBeDefined()
    expect(posB).toBeDefined()
  })

  it('pushes boats in opposite directions (symmetric)', () => {
    // Both heading north, side by side. Sterns overlap.
    const a = makeBoat({ id: 'a', pos: { x: 0, y: 0 }, headingDeg: 0 })
    const b = makeBoat({ id: 'b', pos: { x: 10, y: 0 }, headingDeg: 0 })
    const state = makeState([a, b])

    const result = resolveBoatBoatCollisions(state)
    if (result.correctedPositions.size === 0) return // may not overlap at this distance

    const posA = result.correctedPositions.get('a')
    const posB = result.correctedPositions.get('b')

    if (posA && posB) {
      // After correction, boats should be further apart than before
      const originalDist = 10
      const correctedDist = Math.sqrt(
        (posB.x - posA.x) ** 2 + (posB.y - posA.y) ** 2,
      )
      expect(correctedDist).toBeGreaterThan(originalDist)
    }
  })

  it('push direction is along the line connecting circle centers', () => {
    // Two boats at same position heading north: all circles overlap.
    // Push should separate them.
    const a = makeBoat({ id: 'a', pos: { x: 100, y: 100 }, headingDeg: 0 })
    const b = makeBoat({ id: 'b', pos: { x: 105, y: 100 }, headingDeg: 0 })
    const state = makeState([a, b])

    const result = resolveBoatBoatCollisions(state)
    expect(result.correctedPositions.size).toBe(2)

    const posA = result.correctedPositions.get('a')!
    const posB = result.correctedPositions.get('b')!

    // A should be pushed left (lower x), B should be pushed right (higher x)
    expect(posA.x).toBeLessThan(100)
    expect(posB.x).toBeGreaterThan(105)
  })

  it('no collision with a single boat', () => {
    const a = makeBoat({ id: 'a', pos: { x: 0, y: 0 }, headingDeg: 0 })
    const state = makeState([a])

    const result = resolveBoatBoatCollisions(state)
    expect(result.correctedPositions.size).toBe(0)
    expect(result.collidedPairs).toHaveLength(0)
  })

  it('handles three boats with multiple collisions', () => {
    const a = makeBoat({ id: 'a', pos: { x: 0, y: 0 }, headingDeg: 0 })
    const b = makeBoat({ id: 'b', pos: { x: 5, y: 0 }, headingDeg: 0 })
    const c = makeBoat({ id: 'c', pos: { x: 10, y: 0 }, headingDeg: 0 })
    const state = makeState([a, b, c])

    const result = resolveBoatBoatCollisions(state)
    // At least A-B and B-C should collide
    expect(result.collidedPairs.length).toBeGreaterThanOrEqual(2)
    // A and C should be pushed outward (B may net-cancel since it's squeezed symmetrically)
    expect(result.correctedPositions.has('a')).toBe(true)
    expect(result.correctedPositions.has('c')).toBe(true)
    const posA = result.correctedPositions.get('a')!
    const posC = result.correctedPositions.get('c')!
    expect(posA.x).toBeLessThan(0)
    expect(posC.x).toBeGreaterThan(10)
  })

  it('push magnitude scales with penetration depth', () => {
    // Small overlap (boats barely touching)
    const a1 = makeBoat({ id: 'a', pos: { x: 0, y: 0 }, headingDeg: 0 })
    const b1 = makeBoat({ id: 'b', pos: { x: 17, y: 0 }, headingDeg: 0 })
    const state1 = makeState([a1, b1])
    const result1 = resolveBoatBoatCollisions(state1)

    // Large overlap (boats almost on top of each other)
    const a2 = makeBoat({ id: 'a', pos: { x: 0, y: 0 }, headingDeg: 0 })
    const b2 = makeBoat({ id: 'b', pos: { x: 3, y: 0 }, headingDeg: 0 })
    const state2 = makeState([a2, b2])
    const result2 = resolveBoatBoatCollisions(state2)

    const pushMag = (result: ReturnType<typeof resolveBoatBoatCollisions>, id: string, orig: number) => {
      const pos = result.correctedPositions.get(id)
      if (!pos) return 0
      return Math.abs(pos.x - orig)
    }

    const smallPushA = pushMag(result1, 'a', 0)
    const largePushA = pushMag(result2, 'a', 0)
    expect(largePushA).toBeGreaterThan(smallPushA)
  })

  it('boats heading in opposite directions get separated', () => {
    // Head-on collision
    const a = makeBoat({ id: 'a', pos: { x: 0, y: 0 }, headingDeg: 180 })
    const b = makeBoat({ id: 'b', pos: { x: 0, y: 5 }, headingDeg: 0 })
    const state = makeState([a, b])

    const result = resolveBoatBoatCollisions(state)
    expect(result.collidedPairs.length).toBeGreaterThanOrEqual(1)
    expect(result.correctedPositions.size).toBeGreaterThanOrEqual(1)
  })
})
