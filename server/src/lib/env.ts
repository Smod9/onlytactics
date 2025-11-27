import { config } from 'dotenv'

config()

const toNumber = (value: string | undefined, fallback: number) => {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const normalizeBoolean = (value: string | undefined, fallback: boolean) => {
  if (!value) return fallback
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

export const env = {
  port: toNumber(process.env.PORT ?? process.env.COLYSEUS_PORT, 2567),
  hostname: process.env.HOST ?? process.env.COLYSEUS_HOST ?? '0.0.0.0',
  hardcodedRoomId: process.env.RACE_ROOM_ID ?? 'onlytactics-dev',
  enableMonitor: normalizeBoolean(process.env.ENABLE_MONITOR, false),
}

