import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import adminRoutes from './adminRoutes'

vi.mock('../auth/authMiddleware', () => ({
  authenticate: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    const authHeader = req.headers.authorization
    if (authHeader === 'Bearer admin-token') {
      req.user = { sub: 'admin-user-id', role: 'admin', email: 'admin@test.com' } as never
    } else {
      _res.status(401).json({ error: 'unauthorized' })
      return
    }
    next()
  },
  requireRole:
    (role: string) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (req.user?.role !== role) {
        res.status(403).json({ error: 'forbidden' })
        return
      }
      next()
    },
}))

vi.mock('../auth/userService', () => ({
  listUsers: vi.fn(async () => ({ users: [], total: 0 })),
  findUserById: vi.fn(async () => null),
  updateUser: vi.fn(async () => null),
  deleteUser: vi.fn(async () => false),
  updateUserPassword: vi.fn(async () => {}),
}))

vi.mock('../auth/tokenService', () => ({
  revokeAllUserRefreshTokens: vi.fn(async () => {}),
}))

vi.mock('../auth/emailService', () => ({
  sendAdminPasswordResetEmail: vi.fn(async () => {}),
}))

const mockRaces = [
  {
    raceId: 'race-1',
    finishedAt: '2025-01-01T00:00:00Z',
    courseName: 'Course A',
    fleetSize: 5,
    humanPlayerCount: 3,
    finisherCount: 4,
    totalPenalties: 1,
    raceDurationSeconds: 120,
    avgWindSpeedKts: 10,
    trainingApproved: false,
  },
]

vi.mock('../db/raceStorage', () => ({
  getAdminRaceList: vi.fn(async () => ({ races: mockRaces, total: 1 })),
  setTrainingApproved: vi.fn(async () => true),
  getTrainingStats: vi.fn(async () => ({
    approvedRaces: 0,
    totalFrames: 0,
    estimatedRows: 0,
  })),
}))

const createApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/api/admin', adminRoutes)
  return app
}

describe('GET /api/admin/races', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 without auth', async () => {
    const app = createApp()
    const res = await request(app).get('/api/admin/races')
    expect(res.status).toBe(401)
  })

  it('returns race list for admin', async () => {
    const app = createApp()
    const res = await request(app)
      .get('/api/admin/races')
      .set('Authorization', 'Bearer admin-token')
    expect(res.status).toBe(200)
    expect(res.body.races).toHaveLength(1)
    expect(res.body.races[0].raceId).toBe('race-1')
    expect(res.body.total).toBe(1)
    expect(res.body.limit).toBe(25)
    expect(res.body.offset).toBe(0)
  })

  it('respects limit and offset query params', async () => {
    const { getAdminRaceList } = await import('../db/raceStorage')
    const app = createApp()
    await request(app)
      .get('/api/admin/races?limit=10&offset=5')
      .set('Authorization', 'Bearer admin-token')
    expect(getAdminRaceList).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, offset: 5 }),
    )
  })

  it('passes trainingApproved filter', async () => {
    const { getAdminRaceList } = await import('../db/raceStorage')
    const app = createApp()
    await request(app)
      .get('/api/admin/races?trainingApproved=true')
      .set('Authorization', 'Bearer admin-token')
    expect(getAdminRaceList).toHaveBeenCalledWith(
      expect.objectContaining({ trainingApproved: true }),
    )
  })
})

describe('PATCH /api/admin/races/:raceId', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 when trainingApproved is not boolean', async () => {
    const app = createApp()
    const res = await request(app)
      .patch('/api/admin/races/race-1')
      .set('Authorization', 'Bearer admin-token')
      .send({ trainingApproved: 'yes' })
    expect(res.status).toBe(400)
  })

  it('toggles training approval', async () => {
    const app = createApp()
    const res = await request(app)
      .patch('/api/admin/races/race-1')
      .set('Authorization', 'Bearer admin-token')
      .send({ trainingApproved: true })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.trainingApproved).toBe(true)
  })

  it('returns 404 for unknown race', async () => {
    const { setTrainingApproved } = await import('../db/raceStorage')
    vi.mocked(setTrainingApproved).mockResolvedValueOnce(false)
    const app = createApp()
    const res = await request(app)
      .patch('/api/admin/races/unknown')
      .set('Authorization', 'Bearer admin-token')
      .send({ trainingApproved: false })
    expect(res.status).toBe(404)
  })
})

describe('GET /api/admin/races/training-stats', () => {
  it('returns training stats for admin', async () => {
    const app = createApp()
    const res = await request(app)
      .get('/api/admin/races/training-stats')
      .set('Authorization', 'Bearer admin-token')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('approvedRaces')
    expect(res.body).toHaveProperty('totalFrames')
    expect(res.body).toHaveProperty('estimatedRows')
  })
})
