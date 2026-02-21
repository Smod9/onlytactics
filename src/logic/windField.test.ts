import { describe, it, expect } from 'vitest'
import { getWindFieldConfig, sampleWindDeltaKts, sampleWindSpeed } from './windField'
import type { RaceState } from '@/types/race'

const makeState = (overrides: Partial<RaceState['windField']> = {}): RaceState =>
  ({
    t: 0,
    meta: { raceId: 't', courseName: 't', createdAt: 0, seed: 123 },
    wind: { directionDeg: 0, speed: 10 },
    baselineWindDeg: 0,
    windField: {
      enabled: true,
      count: 8,
      intensityKts: 2,
      sizeWorld: 100,
      domainLengthWorld: 500,
      domainWidthWorld: 200,
      advectionFactor: 0.5,
      tileSizeWorld: 36,
      ...overrides,
    },
    boats: {},
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
  }) as RaceState

describe('getWindFieldConfig', () => {
  it('returns null when windField disabled', () => {
    const state = makeState({ enabled: false })
    expect(getWindFieldConfig(state)).toBeNull()
  })

  it('returns null when count is 0', () => {
    const state = makeState({ count: 0 })
    expect(getWindFieldConfig(state)).toBeNull()
  })

  it('returns config when valid', () => {
    const state = makeState()
    const cfg = getWindFieldConfig(state)
    expect(cfg).not.toBeNull()
    expect(cfg?.enabled).toBe(true)
    expect(cfg?.count).toBe(8)
    expect(cfg?.intensityKts).toBe(2)
  })
})

describe('sampleWindDeltaKts', () => {
  it('returns 0 when wind field disabled', () => {
    const state = makeState({ enabled: false })
    expect(sampleWindDeltaKts(state, { x: 0, y: 0 })).toBe(0)
  })

  it('returns value in bounded range', () => {
    const state = makeState()
    const delta = sampleWindDeltaKts(state, { x: 100, y: 50 })
    expect(Math.abs(delta)).toBeLessThanOrEqual(2)
  })

  it('is deterministic for same inputs', () => {
    const state = makeState()
    const a = sampleWindDeltaKts(state, { x: 10, y: 20 })
    const b = sampleWindDeltaKts(state, { x: 10, y: 20 })
    expect(a).toBe(b)
  })
})

describe('sampleWindSpeed', () => {
  it('returns base wind speed when no field', () => {
    const state = makeState({ enabled: false })
    expect(sampleWindSpeed(state, { x: 0, y: 0 })).toBe(10)
  })

  it('returns non-negative value', () => {
    const state = makeState()
    for (let x = -100; x <= 100; x += 50) {
      for (let y = -100; y <= 100; y += 50) {
        expect(sampleWindSpeed(state, { x, y })).toBeGreaterThanOrEqual(0)
      }
    }
  })
})
