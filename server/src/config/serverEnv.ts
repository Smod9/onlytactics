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
  tickRateHz: toNumber(rawEnv.TICK_RATE_HZ ?? rawEnv.VITE_TICK_RATE, 30),
  hostFailoverMs: toNumber(rawEnv.HOST_FAILOVER_MS ?? rawEnv.VITE_HOST_FAILOVER_MS, 4000),
  hostHeartbeatMs: toNumber(
    rawEnv.HOST_HEARTBEAT_MS ?? rawEnv.VITE_HOST_HEARTBEAT_MS,
    5000,
  ),
  countdownSeconds: toNumber(
    rawEnv.COUNTDOWN_SECONDS ?? rawEnv.VITE_COUNTDOWN_SECONDS,
    180,
  ),
  penaltyCooldownSeconds: toNumber(
    rawEnv.PENALTY_COOLDOWN_SECONDS ?? rawEnv.VITE_PENALTY_COOLDOWN_SECONDS,
    15,
  ),
  debugHud: toBool(rawEnv.DEBUG_HUD ?? rawEnv.VITE_DEBUG_HUD, false),
  debugNetLogs: toBool(rawEnv.DEBUG_NET_LOGS ?? rawEnv.VITE_DEBUG_NET_LOGS, false),
  fixedWind: toBool(rawEnv.FIXED_WIND ?? rawEnv.VITE_FIXED_WIND, false),
  baselineWindDeg: toNumber(
    rawEnv.BASELINE_WIND_DEG ?? rawEnv.VITE_BASELINE_WIND_DEG,
    360,
  ),
  aiEnabled: toBool(rawEnv.AI_ENABLED ?? rawEnv.VITE_AI_ENABLED, false),
  raceTimeoutMinutes: toNumber(
    rawEnv.RACE_TIMEOUT_MINUTES ?? rawEnv.VITE_RACE_TIMEOUT_MINUTES,
    25,
  ),
  hostPublishIntervalMs: toNumber(
    rawEnv.HOST_PUBLISH_INTERVAL_MS ?? rawEnv.VITE_HOST_PUBLISH_INTERVAL_MS,
    50,
  ),
  // "Laps" here correspond to the number of windward roundings (W steps) in the loop.
  // Example: lapsToFinish=2 => Start -> W -> Gate -> W -> Finish
  lapsToFinish: toNumber(rawEnv.LAPS_TO_FINISH ?? rawEnv.VITE_LAPS_TO_FINISH, 2),
  speedMultiplier: toNumber(rawEnv.SPEED_MULTIPLIER ?? rawEnv.VITE_SPEED_MULTIPLIER, 1),
  databaseUrl: rawEnv.DATABASE_URL ?? rawEnv.POSTGRES_URL ?? '',
  databaseSsl: toBool(rawEnv.DATABASE_SSL, false),
  databasePoolMin: toNumber(rawEnv.DATABASE_POOL_MIN, 0),
  databasePoolMax: toNumber(rawEnv.DATABASE_POOL_MAX, 5),
  databaseConnectTimeoutMs: toNumber(rawEnv.DATABASE_CONNECT_TIMEOUT_MS, 5000),
  databaseIdleTimeoutMs: toNumber(rawEnv.DATABASE_IDLE_TIMEOUT_MS, 10000),
  windFieldEnabled: toBool(
    rawEnv.WIND_FIELD_ENABLED ?? rawEnv.VITE_WIND_FIELD_ENABLED,
    true,
  ),
  windFieldIntensityKts: toNumber(
    rawEnv.WIND_FIELD_INTENSITY_KTS ?? rawEnv.VITE_WIND_FIELD_INTENSITY_KTS,
    3,
  ),
  windFieldCount: toNumber(rawEnv.WIND_FIELD_COUNT ?? rawEnv.VITE_WIND_FIELD_COUNT, 32),
  windFieldSizeWorld: toNumber(
    rawEnv.WIND_FIELD_SIZE_WORLD ?? rawEnv.VITE_WIND_FIELD_SIZE_WORLD,
    320,
  ),
  windFieldDomainLengthWorld: toNumber(
    rawEnv.WIND_FIELD_DOMAIN_LENGTH_WORLD ?? rawEnv.VITE_WIND_FIELD_DOMAIN_LENGTH_WORLD,
    1800,
  ),
  windFieldDomainWidthWorld: toNumber(
    rawEnv.WIND_FIELD_DOMAIN_WIDTH_WORLD ?? rawEnv.VITE_WIND_FIELD_DOMAIN_WIDTH_WORLD,
    900,
  ),
  windFieldAdvectionFactor: toNumber(
    rawEnv.WIND_FIELD_ADVECTION_FACTOR ?? rawEnv.VITE_WIND_FIELD_ADVECTION_FACTOR,
    0.1,
  ),
  windFieldTileSizeWorld: toNumber(
    rawEnv.WIND_FIELD_TILE_SIZE_WORLD ?? rawEnv.VITE_WIND_FIELD_TILE_SIZE_WORLD,
    36,
  ),
} as const

export type AppEnv = typeof appEnv
