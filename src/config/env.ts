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
  raceId: rawEnv.VITE_RACE_ID ?? 'dev-race',
  clientRole: (rawEnv.VITE_CLIENT_ROLE ?? 'spectator') as ClientRole,
  clientName: rawEnv.VITE_CLIENT_NAME ?? 'Visitor',
  tickRateHz: toNumber(rawEnv.VITE_TICK_RATE, 10),
  hostFailoverMs: toNumber(rawEnv.VITE_HOST_FAILOVER_MS, 4000),
  hostHeartbeatMs: toNumber(rawEnv.VITE_HOST_HEARTBEAT_MS, 5000),
  countdownSeconds: toNumber(rawEnv.VITE_COUNTDOWN_SECONDS, 60),
  penaltyCooldownSeconds: toNumber(rawEnv.VITE_PENALTY_COOLDOWN_SECONDS, 15),
  debugHud: toBool(rawEnv.VITE_DEBUG_HUD, false),
  fixedWind: toBool(rawEnv.VITE_FIXED_WIND, false),
  baselineWindDeg: toNumber(rawEnv.VITE_BASELINE_WIND_DEG, 360),
  aiEnabled: toBool(rawEnv.VITE_AI_ENABLED, true),
  raceTimeoutMinutes: toNumber(rawEnv.VITE_RACE_TIMEOUT_MINUTES, 10),
}

export type AppEnv = typeof appEnv

