type ClientRole = 'host' | 'player' | 'spectator'

const rawEnv = import.meta.env

const toNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const toBool = (value: string | undefined, fallback = false) => {
  if (!value) return fallback
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

export const appEnv = {
  mqttUrl: rawEnv.VITE_MQTT_URL ?? 'ws://localhost:9001',
  raceId: rawEnv.VITE_RACE_ID ?? 'dev-race',
  clientRole: (rawEnv.VITE_CLIENT_ROLE ?? 'spectator') as ClientRole,
  clientName: rawEnv.VITE_CLIENT_NAME ?? 'Visitor',
  tickRateHz: toNumber(rawEnv.VITE_TICK_RATE, 10),
  hostFailoverMs: toNumber(rawEnv.VITE_HOST_FAILOVER_MS, 4000),
  debugHud: toBool(rawEnv.VITE_DEBUG_HUD, false),
}

export type AppEnv = typeof appEnv

