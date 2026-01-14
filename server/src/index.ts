import { Server as ColyseusServer } from 'colyseus'
import express from 'express'
import { createServer } from 'http'
import { performance } from 'node:perf_hooks'
import { env } from './lib/env'
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

const httpServer = createServer(expressApp)

const gameServer = new ColyseusServer({
  server: httpServer,
})

// Define 'race_room' as the room type for dynamic room creation
gameServer.define('race_room', RaceRoom)

// Room API endpoints (must be after gameServer is created)
expressApp.get('/api/rooms', async (_req, res) => {
  try {
    const rooms = await gameServer.matchMaker.query({ name: 'race_room' })
    const roomList = await Promise.all(
      rooms.map(async (roomInfo) => {
        try {
          const room = gameServer.matchMaker.getRoomById(roomInfo.roomId)
          const raceRoom = room as unknown as InstanceType<typeof RaceRoom> | undefined
          return {
            roomId: roomInfo.roomId,
            roomName: raceRoom?.metadataRoomName ?? 'Unnamed Race',
            description: raceRoom?.description ?? '',
            playerCount: roomInfo.clients,
            maxClients: roomInfo.maxClients,
            status: raceRoom?.getStatus?.() ?? 'waiting',
            hostName: raceRoom?.getHostName?.() ?? undefined,
            createdAt: raceRoom?.createdAt ?? Date.now(),
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
      roomName: typeof roomName === 'string' ? roomName.trim() : 'Unnamed Race',
      description: typeof description === 'string' ? description.trim() : '',
      createdBy: typeof createdBy === 'string' ? createdBy : undefined,
    }
    const room = await gameServer.matchMaker.createRoom('race_room', options)
    res.json({ roomId: room.roomId })
  } catch (error) {
    console.error('[API] error creating room', error)
    res.status(500).json({ error: 'Failed to create room' })
  }
})

expressApp.get('/api/rooms/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params
    const roomInfo = await gameServer.matchMaker.query({ roomId })
    if (roomInfo.length === 0) {
      res.status(404).json({ error: 'Room not found' })
      return
    }
    const roomData = roomInfo[0]
    const room = gameServer.matchMaker.getRoomById(roomId)
    const raceRoom = room as unknown as InstanceType<typeof RaceRoom> | undefined
    res.json({
      roomId: roomData.roomId,
      roomName: raceRoom?.metadataRoomName ?? 'Unnamed Race',
      description: raceRoom?.description ?? '',
      playerCount: roomData.clients,
      maxClients: roomData.maxClients,
      status: raceRoom?.getStatus?.() ?? 'waiting',
      hostName: raceRoom?.getHostName?.() ?? undefined,
      createdAt: raceRoom?.createdAt ?? Date.now(),
    })
  } catch (error) {
    console.error('[API] error getting room', error)
    res.status(500).json({ error: 'Failed to get room' })
  }
})

const start = async () => {
  try {
    await gameServer.listen(env.port, env.hostname)
    console.log(
      `[colyseus] listening on ${env.hostname}:${env.port}`,
    )
  } catch (error) {
    console.error('[colyseus] failed to start server', error)
    process.exit(1)
  }
}

void start()

