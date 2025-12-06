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

const defaultColyseusEndpoint =
  rawEnv.MODE === 'development' || rawEnv.NODE_ENV === 'development'
    ? 'ws://localhost:2567'
    : 'wss://onlytactics-server.fly.dev'

export const appEnv = {
  raceId: rawEnv.VITE_RACE_ID ?? 'debug-race',
  clientRole: (rawEnv.VITE_CLIENT_ROLE ?? 'host') as ClientRole,
  clientName: rawEnv.VITE_CLIENT_NAME ?? 'Debug Host',
  netTransport: (rawEnv.VITE_NET_TRANSPORT ?? 'colyseus') as 'mqtt' | 'colyseus',
  colyseusEndpoint: rawEnv.VITE_COLYSEUS_ENDPOINT ?? defaultColyseusEndpoint,
  colyseusRoomId: rawEnv.VITE_COLYSEUS_ROOM_ID ?? 'onlytactics-dev',
  speedMultiplier: toNumber(rawEnv.VITE_SPEED_MULTIPLIER, 1),
  tickRateHz: toNumber(rawEnv.VITE_TICK_RATE, 10),
  hostFailoverMs: toNumber(rawEnv.VITE_HOST_FAILOVER_MS, 4000),
  hostHeartbeatMs: toNumber(rawEnv.VITE_HOST_HEARTBEAT_MS, 5000),
  hostPublishIntervalMs: toNumber(rawEnv.VITE_HOST_PUBLISH_INTERVAL_MS, 150),
  clientIdleTimeoutMs: toNumber(rawEnv.VITE_CLIENT_IDLE_TIMEOUT_MS, 5 * 60 * 1000),
  lapsToFinish: toNumber(rawEnv.VITE_LAPS_TO_FINISH, 1),
  countdownSeconds: toNumber(rawEnv.VITE_COUNTDOWN_SECONDS, 180),
  penaltyCooldownSeconds: toNumber(rawEnv.VITE_PENALTY_COOLDOWN_SECONDS, 15),
  debugHud: toBool(rawEnv.VITE_DEBUG_HUD, false),
  debugNetLogs: toBool(rawEnv.VITE_DEBUG_NET_LOGS, true),
  fixedWind: toBool(rawEnv.VITE_FIXED_WIND, false),
  baselineWindDeg: toNumber(rawEnv.VITE_BASELINE_WIND_DEG, 360),
  aiEnabled: toBool(rawEnv.VITE_AI_ENABLED, false),
  raceTimeoutMinutes: toNumber(rawEnv.VITE_RACE_TIMEOUT_MINUTES, 10),
}

export type AppEnv = typeof appEnv

