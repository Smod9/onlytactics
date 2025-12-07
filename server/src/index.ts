import { Server as ColyseusServer } from 'colyseus'
import express from 'express'
import { createServer } from 'http'
import { performance } from 'node:perf_hooks'
import { env } from './lib/env'
import { runMigrations } from './db'
import { getRace, getRecentRaces, queryRaces } from './db/raceStorage'
import { RaceRoom } from './rooms/RaceRoom'

const attachGlobalPolyfills = () => {
  const globalAny = globalThis as typeof globalThis & {
    window?: typeof globalThis
    performance?: typeof performance
  }
  if (!globalAny.window) {
    globalAny.window = globalAny
  }
  if (!globalAny.performance) {
    globalAny.performance = performance
  }
}

attachGlobalPolyfills()

const expressApp = express()

expressApp.get('/', (_req, res) => {
  res.json({
    service: 'Only Tactics Colyseus Server',
    room: env.hardcodedRoomId,
    status: 'ok',
  })
})

expressApp.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})

expressApp.get('/api/replays/:raceId', async (req, res) => {
  try {
    const raceId = req.params.raceId
    const replay = await getRace(raceId)
    if (!replay) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    res.json(replay)
  } catch (error) {
    console.error('[api] failed to fetch replay', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

expressApp.get('/api/replays', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 25
    const races = await getRecentRaces(limit)
    res.json(races)
  } catch (error) {
    console.error('[api] failed to list replays', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

expressApp.get('/api/replays/query', async (req, res) => {
  try {
    const { winnerId, courseName, dateFrom, dateTo, limit } = req.query
    const races = await queryRaces({
      winnerId: typeof winnerId === 'string' ? winnerId : undefined,
      courseName: typeof courseName === 'string' ? courseName : undefined,
      dateFrom: typeof dateFrom === 'string' ? dateFrom : undefined,
      dateTo: typeof dateTo === 'string' ? dateTo : undefined,
      limit: typeof limit === 'string' ? Number(limit) : undefined,
    })
    res.json(races)
  } catch (error) {
    console.error('[api] failed to query replays', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

const httpServer = createServer(expressApp)

const gameServer = new ColyseusServer({
  server: httpServer,
})

gameServer.define(env.hardcodedRoomId, RaceRoom, {
  roomId: env.hardcodedRoomId,
})

const start = async () => {
  try {
    await runMigrations()
    await gameServer.listen(env.port, env.hostname)
    console.log(
      `[colyseus] listening on ${env.hostname}:${env.port} (room: ${env.hardcodedRoomId})`,
    )
  } catch (error) {
    console.error('[colyseus] failed to start server', error)
    process.exit(1)
  }
}

void start()

