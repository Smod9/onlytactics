import { describe, it, expect } from 'vitest'
import {
  angleDiff,
  clamp,
  degToRad,
  headingFromAwa,
  normalizeDeg,
  quantizeHeading,
  computeVmgAngles,
} from './physics'

describe('clamp', () => {
  it('returns value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })
  it('returns min when below', () => expect(clamp(-1, 0, 10)).toBe(0))
  it('returns max when above', () => expect(clamp(11, 0, 10)).toBe(10))
})

describe('degToRad', () => {
  it('converts 0 to 0', () => expect(degToRad(0)).toBe(0))
  it('converts 180 to Math.PI', () => expect(degToRad(180)).toBeCloseTo(Math.PI))
  it('converts 360 to 2*Math.PI', () => expect(degToRad(360)).toBeCloseTo(2 * Math.PI))
})

describe('normalizeDeg', () => {
  it('keeps 0 as 0', () => expect(normalizeDeg(0)).toBe(0))
  it('wraps 360 to 0', () => expect(normalizeDeg(360)).toBe(0))
  it('wraps -45 to 315', () => expect(normalizeDeg(-45)).toBe(315))
  it('wraps 370 to 10', () => expect(normalizeDeg(370)).toBe(10))
})

describe('angleDiff', () => {
  it('returns 0 when equal', () => expect(angleDiff(90, 90)).toBe(0))
  it('returns positive for right turn', () => expect(angleDiff(100, 90)).toBe(10))
  it('returns negative for left turn', () => expect(angleDiff(80, 90)).toBe(-10))
  it('wraps across 0/360', () => expect(angleDiff(10, 350)).toBe(20))
})

describe('headingFromAwa', () => {
  it('adds awa to wind direction', () => {
    expect(headingFromAwa(0, 45)).toBe(45)
  })
  it('handles negative awa', () => {
    expect(headingFromAwa(90, -45)).toBe(45)
  })
})

describe('quantizeHeading', () => {
  it('rounds to nearest degree', () => {
    expect(quantizeHeading(90.4)).toBe(90)
    expect(quantizeHeading(90.6)).toBe(91)
  })
  it('normalizes to 0-360', () => {
    expect(quantizeHeading(370)).toBe(10)
  })
})

describe('computeVmgAngles', () => {
  it('returns upwind and downwind angles', () => {
    const v = computeVmgAngles(10)
    expect(v).toHaveProperty('upwindAwa')
    expect(v).toHaveProperty('downwindAwa')
    expect(v.upwindAwa).toBeGreaterThanOrEqual(30)
    expect(v.upwindAwa).toBeLessThanOrEqual(60)
    expect(v.downwindAwa).toBeGreaterThanOrEqual(100)
    expect(v.downwindAwa).toBeLessThanOrEqual(180)
  })
})
