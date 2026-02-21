import { describe, it, expect, vi } from 'vitest'

vi.mock('./index', () => ({
  withClient: vi.fn(),
}))

import { computeWithThrowouts, rowToRegatta } from './regattaStorage'

describe('computeWithThrowouts', () => {
  it('returns zero total and no drops for empty points', () => {
    const result = computeWithThrowouts([], 0)
    expect(result).toEqual({ total: 0, droppedIndices: [] })
  })

  it('returns zero total and no drops for all-null points', () => {
    const result = computeWithThrowouts([null, null, null], 1)
    expect(result).toEqual({ total: 0, droppedIndices: [] })
  })

  it('sums all points when throwoutCount is 0', () => {
    const result = computeWithThrowouts([1, 3, 5], 0)
    expect(result.total).toBe(9)
    expect(result.droppedIndices).toEqual([])
  })

  it('drops the single worst result with 1 throwout', () => {
    const result = computeWithThrowouts([1, 3, 7, 2], 1)
    expect(result.total).toBe(6) // 1+3+2, drop 7
    expect(result.droppedIndices).toEqual([2])
  })

  it('drops two worst results with 2 throwouts', () => {
    const result = computeWithThrowouts([2, 10, 1, 8, 3], 2)
    // Drop 10 (index 1) and 8 (index 3), keep 2+1+3 = 6
    expect(result.total).toBe(6)
    expect(result.droppedIndices.sort()).toEqual([1, 3])
  })

  it('never drops all scored races (keeps at least one)', () => {
    const result = computeWithThrowouts([5], 3)
    expect(result.total).toBe(5)
    expect(result.droppedIndices).toEqual([])
  })

  it('handles mixed null and scored entries', () => {
    const result = computeWithThrowouts([2, null, 5, null, 1], 1)
    // Scored: [2, 5, 1]. Drop worst (5 at index 2). Keep 2+1 = 3
    expect(result.total).toBe(3)
    expect(result.droppedIndices).toEqual([2])
  })

  it('handles a single race with 0 throwouts', () => {
    const result = computeWithThrowouts([4], 0)
    expect(result.total).toBe(4)
    expect(result.droppedIndices).toEqual([])
  })

  it('caps throwouts to scored.length - 1', () => {
    const result = computeWithThrowouts([3, 7], 5)
    // Only 2 scored, can drop at most 1. Drop 7, keep 3
    expect(result.total).toBe(3)
    expect(result.droppedIndices).toEqual([1])
  })

  it('handles equal scores correctly', () => {
    const result = computeWithThrowouts([3, 3, 3], 1)
    expect(result.total).toBe(6) // Drop one 3, keep two 3s
    expect(result.droppedIndices).toHaveLength(1)
  })
})

describe('rowToRegatta', () => {
  it('maps a database row to Regatta type', () => {
    const row = {
      id: 'abc-123',
      name: 'Test Regatta',
      description: 'A description',
      num_races: 5,
      throwout_count: 1,
      status: 'active',
      created_by: 'user-1',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-02T00:00:00Z',
    }
    const regatta = rowToRegatta(row)
    expect(regatta).toEqual({
      id: 'abc-123',
      name: 'Test Regatta',
      description: 'A description',
      numRaces: 5,
      throwoutCount: 1,
      status: 'active',
      createdBy: 'user-1',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-02T00:00:00Z',
    })
  })

  it('handles null created_by', () => {
    const row = {
      id: 'abc',
      name: 'R',
      description: null,
      num_races: 3,
      throwout_count: 0,
      status: 'completed',
      created_by: null,
      created_at: '2025-01-01',
      updated_at: '2025-01-01',
    }
    const regatta = rowToRegatta(row)
    expect(regatta.createdBy).toBeNull()
    expect(regatta.description).toBe('')
    expect(regatta.status).toBe('completed')
  })

  it('defaults status to active when missing', () => {
    const row = {
      id: 'abc',
      name: 'R',
      description: '',
      num_races: 3,
      throwout_count: 0,
      created_by: null,
      created_at: '2025-01-01',
      updated_at: '2025-01-01',
    }
    const regatta = rowToRegatta(row)
    expect(regatta.status).toBe('active')
  })
})
