import { describe, it, expect } from 'vitest'
import { boatCapsuleCircles, headingForward } from '@/logic/boatGeometry'
import type { BoatState } from '@/types/race'
import {
  BOAT_BOW_OFFSET,
  BOAT_BOW_RADIUS,
  BOAT_STERN_OFFSET,
  BOAT_STERN_RADIUS,
} from '@/logic/constants'

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

describe('headingForward', () => {
  it('heading 0° (north) gives {0, -1}', () => {
    const v = headingForward(0)
    expect(v.x).toBeCloseTo(0, 10)
    expect(v.y).toBeCloseTo(-1, 10)
  })

  it('heading 90° (east) gives {1, 0}', () => {
    const v = headingForward(90)
    expect(v.x).toBeCloseTo(1, 10)
    expect(v.y).toBeCloseTo(0, 10)
  })

  it('heading 180° (south) gives {0, 1}', () => {
    const v = headingForward(180)
    expect(v.x).toBeCloseTo(0, 10)
    expect(v.y).toBeCloseTo(1, 10)
  })

  it('heading 270° (west) gives {-1, 0}', () => {
    const v = headingForward(270)
    expect(v.x).toBeCloseTo(-1, 10)
    expect(v.y).toBeCloseTo(0, 10)
  })
})

describe('boatCapsuleCircles', () => {
  it('heading north: bow is ahead (negative y), stern is behind (positive y)', () => {
    const boat = makeBoat({ id: 'a', pos: { x: 100, y: 200 }, headingDeg: 0 })
    const [bow, stern] = boatCapsuleCircles(boat)

    expect(bow.r).toBe(BOAT_BOW_RADIUS)
    expect(stern.r).toBe(BOAT_STERN_RADIUS)

    // Heading north: forward = {0, -1}
    expect(bow.x).toBeCloseTo(100, 5)
    expect(bow.y).toBeCloseTo(200 - BOAT_BOW_OFFSET, 5)

    expect(stern.x).toBeCloseTo(100, 5)
    expect(stern.y).toBeCloseTo(200 - BOAT_STERN_OFFSET, 5) // 200 + 6
  })

  it('heading east: bow is to the right (positive x)', () => {
    const boat = makeBoat({ id: 'a', pos: { x: 100, y: 200 }, headingDeg: 90 })
    const [bow, stern] = boatCapsuleCircles(boat)

    expect(bow.x).toBeCloseTo(100 + BOAT_BOW_OFFSET, 5)
    expect(bow.y).toBeCloseTo(200, 5)

    expect(stern.x).toBeCloseTo(100 + BOAT_STERN_OFFSET, 5) // 100 - 6
    expect(stern.y).toBeCloseTo(200, 5)
  })

  it('uses custom position when provided', () => {
    const boat = makeBoat({ id: 'a', pos: { x: 0, y: 0 }, headingDeg: 0 })
    const customPos = { x: 50, y: 60 }
    const [bow] = boatCapsuleCircles(boat, customPos)

    expect(bow.x).toBeCloseTo(50, 5)
    expect(bow.y).toBeCloseTo(60 - BOAT_BOW_OFFSET, 5)
  })
})
