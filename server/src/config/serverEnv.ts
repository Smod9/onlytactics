const toNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const toBool = (value: string | undefined, fallback = false) => {
  if (!value) return fallback
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

const rawEnv = process.env

export const appEnv = {
  raceId: rawEnv.RACE_ID ?? rawEnv.VITE_RACE_ID ?? 'colyseus-dev',
  clientRole: 'host',
  clientName: rawEnv.HOST_NAME ?? 'Colyseus Host',
  tickRateHz: toNumber(rawEnv.TICK_RATE_HZ ?? rawEnv.VITE_TICK_RATE, 10),
  hostFailoverMs: toNumber(rawEnv.HOST_FAILOVER_MS ?? rawEnv.VITE_HOST_FAILOVER_MS, 4000),
  hostHeartbeatMs: toNumber(rawEnv.HOST_HEARTBEAT_MS ?? rawEnv.VITE_HOST_HEARTBEAT_MS, 5000),
  countdownSeconds: toNumber(rawEnv.COUNTDOWN_SECONDS ?? rawEnv.VITE_COUNTDOWN_SECONDS, 180),
  penaltyCooldownSeconds: toNumber(
    rawEnv.PENALTY_COOLDOWN_SECONDS ?? rawEnv.VITE_PENALTY_COOLDOWN_SECONDS,
    15,
  ),
  debugHud: toBool(rawEnv.DEBUG_HUD ?? rawEnv.VITE_DEBUG_HUD, true),
  debugNetLogs: toBool('true', true),
  fixedWind: toBool(rawEnv.FIXED_WIND ?? rawEnv.VITE_FIXED_WIND, false),
  baselineWindDeg: toNumber(rawEnv.BASELINE_WIND_DEG ?? rawEnv.VITE_BASELINE_WIND_DEG, 360),
  aiEnabled: toBool(rawEnv.AI_ENABLED ?? rawEnv.VITE_AI_ENABLED, false),
  raceTimeoutMinutes: toNumber(rawEnv.RACE_TIMEOUT_MINUTES ?? rawEnv.VITE_RACE_TIMEOUT_MINUTES, 10),
  hostPublishIntervalMs: toNumber(
    rawEnv.HOST_PUBLISH_INTERVAL_MS ?? rawEnv.VITE_HOST_PUBLISH_INTERVAL_MS,
    150,
  ),
  lapsToFinish: toNumber(rawEnv.LAPS_TO_FINISH ?? rawEnv.VITE_LAPS_TO_FINISH, 3),
  speedMultiplier: toNumber(rawEnv.SPEED_MULTIPLIER ?? rawEnv.VITE_SPEED_MULTIPLIER, 1),
} as const

export type AppEnv = typeof appEnv

