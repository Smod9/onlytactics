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

const httpServer = createServer(expressApp)

const gameServer = new ColyseusServer({
  server: httpServer,
})

gameServer.define(env.hardcodedRoomId, RaceRoom, {
  roomId: env.hardcodedRoomId,
})

const start = async () => {
  try {
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

