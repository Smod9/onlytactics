import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import regattaRoutes from './regattaRoutes'

vi.mock('../auth/authMiddleware', () => ({
  authenticate: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    const authHeader = req.headers.authorization
    if (!authHeader) {
      _res.status(401).json({ error: 'unauthorized' })
      return
    }
    if (authHeader === 'Bearer admin-token') {
      req.user = { sub: 'admin-user-id', role: 'admin', email: 'admin@test.com' } as never
    } else if (authHeader === 'Bearer creator-token') {
      req.user = { sub: 'creator-user-id', role: 'player', email: 'creator@test.com' } as never
    } else if (authHeader === 'Bearer other-token') {
      req.user = { sub: 'other-user-id', role: 'player', email: 'other@test.com' } as never
    } else {
      _res.status(401).json({ error: 'unauthorized' })
      return
    }
    next()
  },
}))

const mockRegatta = {
  id: 'regatta-1',
  name: 'Test Regatta',
  description: '',
  num_races: 3,
  throwout_count: 0,
  status: 'active',
  created_by: 'creator-user-id',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
}

vi.mock('../db/regattaStorage', () => ({
  createRegatta: vi.fn(async (name: string) => ({
    id: 'new-regatta',
    name,
    description: '',
    numRaces: 3,
    throwoutCount: 0,
    status: 'active',
    createdBy: 'creator-user-id',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  })),
  listRegattas: vi.fn(async () => []),
  getRegattaDetail: vi.fn(async (id: string) => {
    if (id === 'regatta-1') {
      return {
        ...mockRegatta,
        id: mockRegatta.id,
        name: mockRegatta.name,
        description: mockRegatta.description,
        numRaces: mockRegatta.num_races,
        throwoutCount: mockRegatta.throwout_count,
        status: mockRegatta.status,
        createdBy: mockRegatta.created_by,
        createdAt: mockRegatta.created_at,
        updatedAt: mockRegatta.updated_at,
        races: [],
        standings: [],
        completedRaceCount: 0,
      }
    }
    return null
  }),
  updateRegatta: vi.fn(async () => ({
    id: 'regatta-1',
    name: 'Updated',
    description: '',
    numRaces: 3,
    throwoutCount: 0,
    status: 'active',
    createdBy: 'creator-user-id',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  })),
  deleteRegatta: vi.fn(async () => true),
  getRegattaOwner: vi.fn(async (id: string) => {
    if (id === 'regatta-1') return { createdBy: 'creator-user-id' }
    return null
  }),
  addRaceToRegatta: vi.fn(async () => {}),
  removeRaceFromRegatta: vi.fn(async () => {}),
  getNextRaceNumber: vi.fn(async () => 1),
}))

const createApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/api/regattas', regattaRoutes)
  return app
}

describe('POST /api/regattas', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 without auth', async () => {
    const app = createApp()
    const res = await request(app).post('/api/regattas').send({ name: 'Test' })
    expect(res.status).toBe(401)
  })

  it('returns 400 when name is missing', async () => {
    const app = createApp()
    const res = await request(app)
      .post('/api/regattas')
      .set('Authorization', 'Bearer creator-token')
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('bad_request')
  })

  it('creates a regatta with valid data', async () => {
    const app = createApp()
    const res = await request(app)
      .post('/api/regattas')
      .set('Authorization', 'Bearer creator-token')
      .send({ name: 'My Regatta' })
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('My Regatta')
  })
})

describe('PATCH /api/regattas/:id', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 for non-creator non-admin', async () => {
    const app = createApp()
    const res = await request(app)
      .patch('/api/regattas/regatta-1')
      .set('Authorization', 'Bearer other-token')
      .send({ name: 'New Name' })
    expect(res.status).toBe(403)
  })

  it('allows creator to update', async () => {
    const app = createApp()
    const res = await request(app)
      .patch('/api/regattas/regatta-1')
      .set('Authorization', 'Bearer creator-token')
      .send({ name: 'New Name' })
    expect(res.status).toBe(200)
  })

  it('allows admin to update', async () => {
    const app = createApp()
    const res = await request(app)
      .patch('/api/regattas/regatta-1')
      .set('Authorization', 'Bearer admin-token')
      .send({ name: 'Admin Edit' })
    expect(res.status).toBe(200)
  })

  it('returns 404 for unknown regatta', async () => {
    const app = createApp()
    const res = await request(app)
      .patch('/api/regattas/unknown-id')
      .set('Authorization', 'Bearer admin-token')
      .send({ name: 'X' })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/regattas/:id', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 for non-creator non-admin', async () => {
    const app = createApp()
    const res = await request(app)
      .delete('/api/regattas/regatta-1')
      .set('Authorization', 'Bearer other-token')
    expect(res.status).toBe(403)
  })

  it('allows creator to delete', async () => {
    const app = createApp()
    const res = await request(app)
      .delete('/api/regattas/regatta-1')
      .set('Authorization', 'Bearer creator-token')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('allows admin to delete', async () => {
    const app = createApp()
    const res = await request(app)
      .delete('/api/regattas/regatta-1')
      .set('Authorization', 'Bearer admin-token')
    expect(res.status).toBe(200)
  })
})

describe('GET /api/regattas', () => {
  it('returns list of regattas', async () => {
    const app = createApp()
    const res = await request(app).get('/api/regattas')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('GET /api/regattas/:id', () => {
  it('returns regatta detail', async () => {
    const app = createApp()
    const res = await request(app).get('/api/regattas/regatta-1')
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('regatta-1')
  })

  it('returns 404 for unknown regatta', async () => {
    const app = createApp()
    const res = await request(app).get('/api/regattas/unknown')
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/regattas/:id/races/:raceId', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 for non-creator non-admin', async () => {
    const app = createApp()
    const res = await request(app)
      .delete('/api/regattas/regatta-1/races/race-1')
      .set('Authorization', 'Bearer other-token')
    expect(res.status).toBe(403)
  })

  it('allows creator to remove race', async () => {
    const app = createApp()
    const res = await request(app)
      .delete('/api/regattas/regatta-1/races/race-1')
      .set('Authorization', 'Bearer creator-token')
    expect(res.status).toBe(200)
  })
})
