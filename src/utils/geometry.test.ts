import { describe, it, expect } from 'vitest'
import { distanceBetween } from './geometry'

describe('distanceBetween', () => {
  it('returns 0 for identical points', () => {
    expect(distanceBetween({ x: 5, y: 10 }, { x: 5, y: 10 })).toBe(0)
  })

  it('returns horizontal distance', () => {
    expect(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(3)
  })

  it('returns vertical distance', () => {
    expect(distanceBetween({ x: 0, y: 0 }, { x: 0, y: 4 })).toBe(4)
  })

  it('returns hypotenuse for diagonal', () => {
    expect(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })

  it('is symmetric', () => {
    const a = { x: 1, y: 2 }
    const b = { x: -3, y: 5 }
    expect(distanceBetween(a, b)).toBe(distanceBetween(b, a))
  })
})
