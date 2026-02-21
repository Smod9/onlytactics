import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/config/env', () => ({
  appEnv: { colyseusEndpoint: 'ws://localhost:2567' },
}))

import { regattaService } from './regattaService'

const createMockResponse = (data: unknown, ok = true, status = 200) =>
  Promise.resolve({
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
  } as Response)

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
})

describe('regattaService.listRegattas', () => {
  it('fetches all regattas without filter', async () => {
    fetchSpy.mockResolvedValueOnce(createMockResponse([]))
    const result = await regattaService.listRegattas()
    expect(result).toEqual([])
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][0]).toBe('http://localhost:2567/api/regattas')
  })

  it('appends status query param when filter provided', async () => {
    fetchSpy.mockResolvedValueOnce(createMockResponse([]))
    await regattaService.listRegattas('active')
    expect(fetchSpy.mock.calls[0][0]).toBe('http://localhost:2567/api/regattas?status=active')
  })

  it('throws on non-ok response', async () => {
    fetchSpy.mockResolvedValueOnce(createMockResponse(null, false, 500))
    await expect(regattaService.listRegattas()).rejects.toThrow('Failed to list regattas')
  })
})

describe('regattaService.createRegatta', () => {
  it('sends POST with auth header and body', async () => {
    const created = { id: '1', name: 'Test' }
    fetchSpy.mockResolvedValueOnce(createMockResponse(created))
    const result = await regattaService.createRegatta({ name: 'Test', numRaces: 5 }, 'my-token')
    expect(result).toEqual(created)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const call = fetchSpy.mock.calls[0]
    expect(call[0]).toBe('http://localhost:2567/api/regattas')
    expect(call[1].method).toBe('POST')
    expect(call[1].headers.Authorization).toBe('Bearer my-token')
    expect(JSON.parse(call[1].body)).toEqual({ name: 'Test', numRaces: 5 })
  })

  it('throws on failure', async () => {
    fetchSpy.mockResolvedValueOnce(createMockResponse({ error: 'bad' }, false, 400))
    await expect(regattaService.createRegatta({ name: '' }, null)).rejects.toThrow('Failed to create regatta')
  })
})

describe('regattaService.getRegatta', () => {
  it('fetches regatta detail by id', async () => {
    const detail = { id: 'r1', name: 'R', races: [], standings: [] }
    fetchSpy.mockResolvedValueOnce(createMockResponse(detail))
    const result = await regattaService.getRegatta('r1')
    expect(result).toEqual(detail)
    expect(fetchSpy.mock.calls[0][0]).toBe('http://localhost:2567/api/regattas/r1')
  })
})

describe('regattaService.updateRegatta', () => {
  it('sends PATCH with fields and auth', async () => {
    fetchSpy.mockResolvedValueOnce(createMockResponse({ id: 'r1', name: 'Updated' }))
    await regattaService.updateRegatta('r1', { name: 'Updated' }, 'tok')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const call = fetchSpy.mock.calls[0]
    expect(call[0]).toBe('http://localhost:2567/api/regattas/r1')
    expect(call[1].method).toBe('PATCH')
    expect(call[1].headers.Authorization).toBe('Bearer tok')
  })
})

describe('regattaService.deleteRegatta', () => {
  it('sends DELETE with auth header', async () => {
    fetchSpy.mockResolvedValueOnce(createMockResponse({ success: true }))
    await regattaService.deleteRegatta('r1', 'tok')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const call = fetchSpy.mock.calls[0]
    expect(call[0]).toBe('http://localhost:2567/api/regattas/r1')
    expect(call[1].method).toBe('DELETE')
    expect(call[1].headers.Authorization).toBe('Bearer tok')
  })

  it('throws on failure', async () => {
    fetchSpy.mockResolvedValueOnce(createMockResponse(null, false, 403))
    await expect(regattaService.deleteRegatta('r1', 'tok')).rejects.toThrow('Failed to delete regatta')
  })
})

describe('regattaService.addRace', () => {
  it('sends POST to add race', async () => {
    fetchSpy.mockResolvedValueOnce(createMockResponse({}))
    await regattaService.addRace('regatta-1', 'race-1', 2, 'tok')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const call = fetchSpy.mock.calls[0]
    expect(call[0]).toBe('http://localhost:2567/api/regattas/regatta-1/races')
    expect(call[1].method).toBe('POST')
    expect(JSON.parse(call[1].body)).toEqual({ raceId: 'race-1', raceNumber: 2 })
  })
})
