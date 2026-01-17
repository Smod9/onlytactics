import { Server as ColyseusServer, matchMaker } from 'colyseus'
import { WebSocketTransport } from '@colyseus/ws-transport'
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

const applyCorsHeaders = (
  req: express.Request | import('http').IncomingMessage,
  res: express.Response | import('http').ServerResponse,
) => {
  if (res.headersSent) return
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : ''
  if (origin) {
    // Echo origin to support credentialed matchmaker requests (wildcard is rejected by browsers).
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Vary', 'Origin')
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  res.setHeader('Access-Control-Max-Age', '86400')
}

// Basic CORS handling for local dev + deployments that serve the client separately.
expressApp.use((req, res, next) => {
  applyCorsHeaders(req, res)
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  next()
})

// Enable JSON body parsing for POST requests
expressApp.use(express.json())

expressApp.get('/', (_req, res) => {
  res.json({
    service: 'Only Tactics Colyseus Server',
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
httpServer.on('request', (req, res) => {
  applyCorsHeaders(req, res)
  if (!res.headersSent && req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
  }
})

const gameServer = new ColyseusServer({
  transport: new WebSocketTransport({ server: httpServer }),
})

const normalizeMatchmakeResponse = (response: unknown) => {
  if (!response || typeof response !== 'object') return response
  const record = response as Record<string, unknown>
  if (record.room && typeof record.room === 'object') return response
  const name = typeof record.name === 'string' ? record.name : undefined
  const roomId = typeof record.roomId === 'string' ? record.roomId : undefined
  if (!name || !roomId) return response
  const processId =
    typeof record.processId === 'string' ? record.processId : matchMaker.processId
  const publicAddress =
    typeof record.publicAddress === 'string' ? record.publicAddress : undefined
  return {
    ...record,
    room: {
      name,
      roomId,
      processId,
      ...(publicAddress ? { publicAddress } : {}),
    },
  }
}

const originalInvoke = matchMaker.controller.invokeMethod.bind(matchMaker.controller)
matchMaker.controller.invokeMethod = async (...args) => {
  const response = await originalInvoke(...args)
  return normalizeMatchmakeResponse(response)
}

// Define 'race_room' as the room type for dynamic room creation
gameServer.define('race_room', RaceRoom)

// Room API endpoints (must be after gameServer is created)
expressApp.get('/api/rooms', async (_req, res) => {
  try {
    const rooms = await matchMaker.query({ name: 'race_room' })
    const roomList = await Promise.all(
      rooms.map(async (roomInfo) => {
        try {
          const room = await matchMaker.getRoomById(roomInfo.roomId)
          const raceRoom = room as unknown as InstanceType<typeof RaceRoom> | undefined
          const metadata =
            (roomInfo.metadata as Partial<{
              roomName: string
              description: string
              createdAt: number
              createdBy: string
              status: 'waiting' | 'in-progress' | 'finished'
              phase: 'prestart' | 'running' | 'finished'
              timeToStartSeconds: number
            }>) ?? {}
          return {
            roomId: roomInfo.roomId,
            roomName: raceRoom?.metadataRoomName ?? metadata.roomName ?? 'Race',
            description: raceRoom?.description ?? metadata.description ?? '',
            playerCount: roomInfo.clients,
            maxClients: roomInfo.maxClients,
            status: raceRoom?.getStatus?.() ?? metadata.status ?? 'waiting',
            hostName: raceRoom?.getHostName?.() ?? undefined,
            createdAt: raceRoom?.createdAt ?? metadata.createdAt ?? Date.now(),
            timeToStartSeconds:
              raceRoom?.getTimeToStartSeconds?.() ?? metadata.timeToStartSeconds ?? null,
            phase: metadata.phase ?? 'prestart',
          }
        } catch (err) {
          console.warn('[API] error getting room details', roomInfo.roomId, err)
          return {
            roomId: roomInfo.roomId,
            roomName: 'Unnamed Race',
            description: '',
            playerCount: roomInfo.clients,
            maxClients: roomInfo.maxClients,
            status: 'waiting' as const,
            createdAt: Date.now(),
          }
        }
      }),
    )
    res.json({ rooms: roomList })
  } catch (error) {
    console.error('[API] error listing rooms', error)
    res.status(500).json({ error: 'Failed to list rooms' })
  }
})

expressApp.post('/api/rooms', async (req, res) => {
  try {
    const { roomName, description, createdBy } = req.body
    const options: Record<string, unknown> = {
      roomName: typeof roomName === 'string' ? roomName.trim() : undefined,
      description: typeof description === 'string' ? description.trim() : undefined,
      createdBy: typeof createdBy === 'string' ? createdBy : undefined,
    }
    const room = await matchMaker.createRoom('race_room', options)
    res.json({ roomId: room.roomId })
  } catch (error) {
    console.error('[API] error creating room', error)
    res.status(500).json({ error: 'Failed to create room' })
  }
})

expressApp.get('/api/rooms/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params
    const roomInfo = await matchMaker.query({ roomId })
    if (roomInfo.length === 0) {
      res.status(404).json({ error: 'Room not found' })
      return
    }
    const roomData = roomInfo[0]
    const room = await matchMaker.getRoomById(roomId)
    const raceRoom = room as unknown as InstanceType<typeof RaceRoom> | undefined
    const metadata =
      (roomData.metadata as Partial<{
        roomName: string
        description: string
        createdAt: number
        createdBy: string
        status: 'waiting' | 'in-progress' | 'finished'
        timeToStartSeconds: number
        phase: string
      }>) ?? {}
    res.json({
      roomId: roomData.roomId,
      roomName: raceRoom?.metadataRoomName ?? metadata.roomName ?? 'Race',
      description: raceRoom?.description ?? metadata.description ?? '',
      playerCount: roomData.clients,
      maxClients: roomData.maxClients,
      status: raceRoom?.getStatus?.() ?? metadata.status ?? 'waiting',
      hostName: raceRoom?.getHostName?.() ?? undefined,
      createdAt: raceRoom?.createdAt ?? metadata.createdAt ?? Date.now(),
      timeToStartSeconds:
        raceRoom?.getTimeToStartSeconds?.() ?? metadata.timeToStartSeconds ?? null,
      phase: metadata.phase ?? 'prestart',
    })
  } catch (error) {
    console.error('[API] error getting room', error)
    res.status(500).json({ error: 'Failed to get room' })
  }
})

const start = async () => {
  try {
    await runMigrations()
    await gameServer.listen(env.port, env.hostname)
    console.log(`[colyseus] listening on ${env.hostname}:${env.port}`)
  } catch (error) {
    console.error('[colyseus] failed to start server', error)
    process.exit(1)
  }
}

void start()
