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

const stripInlineComment = (value: string) => value.replace(/\s+#.*$/, '').trim()

const normalizeWsUrl = (value: string) => {
  const trimmed = stripInlineComment(value.trim())
  // Common mistake: "ws:localhost:2567" (missing "//")
  if (trimmed.startsWith('ws:') && !trimmed.startsWith('ws://')) {
    return `ws://${trimmed.slice('ws:'.length).replace(/^\/+/, '')}`
  }
  if (trimmed.startsWith('wss:') && !trimmed.startsWith('wss://')) {
    return `wss://${trimmed.slice('wss:'.length).replace(/^\/+/, '')}`
  }
  return trimmed
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
  colyseusEndpoint: normalizeWsUrl(
    rawEnv.VITE_COLYSEUS_ENDPOINT ?? defaultColyseusEndpoint,
  ),
  colyseusRoomId: rawEnv.VITE_COLYSEUS_ROOM_ID ?? 'onlytactics-dev',
  speedMultiplier: toNumber(rawEnv.VITE_SPEED_MULTIPLIER, 1),
  tickRateHz: toNumber(rawEnv.VITE_TICK_RATE, 10),
  hostFailoverMs: toNumber(rawEnv.VITE_HOST_FAILOVER_MS, 4000),
  hostHeartbeatMs: toNumber(rawEnv.VITE_HOST_HEARTBEAT_MS, 5000),
  hostPublishIntervalMs: toNumber(rawEnv.VITE_HOST_PUBLISH_INTERVAL_MS, 50),
  clientIdleTimeoutMs: toNumber(rawEnv.VITE_CLIENT_IDLE_TIMEOUT_MS, 5 * 60 * 1000),
  // "Laps" here correspond to the number of windward roundings (W steps) in the loop.
  // Example: lapsToFinish=2 => Start -> W -> Gate -> W -> Finish
  lapsToFinish: toNumber(rawEnv.VITE_LAPS_TO_FINISH, 2),
  countdownSeconds: toNumber(rawEnv.VITE_COUNTDOWN_SECONDS, 180),
  penaltyCooldownSeconds: toNumber(rawEnv.VITE_PENALTY_COOLDOWN_SECONDS, 15),
  // Camera zoom multiplier used in follow mode (applied on top of screen-derived base scale).
  // Smaller = zoomed out. Typical range: ~1.1 - 1.6.
  followZoomFactor: toNumber(rawEnv.VITE_FOLLOW_ZOOM, 1.33),
  // Birdseye scale multiplier applied after computing the "fit course to screen" scale.
  // Smaller = zoomed out (shows more around the course). Typical range: ~0.85 - 1.0.
  birdseyeZoomFactor: toNumber(rawEnv.VITE_BIRDSEYE_ZOOM, 0.92),
  debugHud: toBool(rawEnv.VITE_DEBUG_HUD, false),
  debugNetLogs: toBool(rawEnv.VITE_DEBUG_NET_LOGS, true),
  fixedWind: toBool(rawEnv.VITE_FIXED_WIND, false),
  baselineWindDeg: toNumber(rawEnv.VITE_BASELINE_WIND_DEG, 360),
  aiEnabled: toBool(rawEnv.VITE_AI_ENABLED, false),
  raceTimeoutMinutes: toNumber(rawEnv.VITE_RACE_TIMEOUT_MINUTES, 25),
  windFieldEnabled: toBool(rawEnv.VITE_WIND_FIELD_ENABLED, true),
  windFieldIntensityKts: toNumber(rawEnv.VITE_WIND_FIELD_INTENSITY_KTS, 3),
  windFieldCount: toNumber(rawEnv.VITE_WIND_FIELD_COUNT, 32),
  windFieldSizeWorld: toNumber(rawEnv.VITE_WIND_FIELD_SIZE_WORLD, 320),
  windFieldDomainLengthWorld: toNumber(rawEnv.VITE_WIND_FIELD_DOMAIN_LENGTH_WORLD, 1800),
  windFieldDomainWidthWorld: toNumber(rawEnv.VITE_WIND_FIELD_DOMAIN_WIDTH_WORLD, 900),
  windFieldAdvectionFactor: toNumber(rawEnv.VITE_WIND_FIELD_ADVECTION_FACTOR, 0.1),
  windFieldTileSizeWorld: toNumber(rawEnv.VITE_WIND_FIELD_TILE_SIZE_WORLD, 36),
}

export type AppEnv = typeof appEnv
