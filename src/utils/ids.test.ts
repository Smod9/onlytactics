import { describe, it, expect } from 'vitest'
import { createId } from './ids'

describe('createId', () => {
  it('returns string starting with default prefix', () => {
    const id = createId()
    expect(id).toMatch(/^id-/)
  })

  it('returns string starting with custom prefix', () => {
    const id = createId('boat')
    expect(id).toMatch(/^boat-/)
  })

  it('returns unique ids', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 100; i += 1) {
      ids.add(createId())
    }
    expect(ids.size).toBe(100)
  })
})
