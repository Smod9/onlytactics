import { describe, it, expect } from 'vitest'
import { createSeededRandom, seedFromString } from './rng'

describe('createSeededRandom', () => {
  it('returns values in [0, 1)', () => {
    const rand = createSeededRandom(12345)
    for (let i = 0; i < 100; i += 1) {
      const v = rand()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('is deterministic for same seed', () => {
    const rand1 = createSeededRandom(42)
    const rand2 = createSeededRandom(42)
    for (let i = 0; i < 10; i += 1) {
      expect(rand1()).toBe(rand2())
    }
  })

  it('produces different sequences for different seeds', () => {
    const rand1 = createSeededRandom(1)
    const rand2 = createSeededRandom(2)
    expect(rand1()).not.toBe(rand2())
  })
})

describe('seedFromString', () => {
  it('returns a number', () => {
    expect(typeof seedFromString('hello')).toBe('number')
  })

  it('returns same value for same string', () => {
    expect(seedFromString('test')).toBe(seedFromString('test'))
  })

  it('returns different values for different strings', () => {
    expect(seedFromString('a')).not.toBe(seedFromString('b'))
  })

  it('handles empty string', () => {
    expect(seedFromString('')).toBe(0)
  })
})
