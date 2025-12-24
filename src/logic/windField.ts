import type { RaceState, Vec2, WindFieldConfig } from '@/types/race'
import { createSeededRandom } from '@/utils/rng'
import { KNOTS_TO_MS } from '@/logic/constants'

const degToRad = (deg: number) => (deg * Math.PI) / 180

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))

const wrap01 = (t: number) => {
  const w = t % 1
  return w < 0 ? w + 1 : w
}

const wrap = (value: number, period: number) => wrap01(value / period) * period

const shortestWrappedDelta = (value: number, center: number, period: number) => {
  // Returns delta in [-period/2, period/2]
  let d = value - center
  d = ((((d + period / 2) % period) + period) % period) - period / 2
  return d
}

const smooth01 = (x: number) => x * x * (3 - 2 * x) // smoothstep(0..1)

type PuffBlob = {
  baseAlong: number
  baseCross: number
  halfSizeAlong: number
  halfSizeCross: number
  amplitudeKts: number
}

type CachedField = {
  key: string
  blobs: PuffBlob[]
}

let cached: CachedField | null = null

const makeKey = (seed: number, cfg: WindFieldConfig) =>
  [
    seed,
    cfg.enabled ? 1 : 0,
    cfg.count,
    cfg.intensityKts,
    cfg.sizeWorld,
    cfg.domainLengthWorld,
    cfg.domainWidthWorld,
    cfg.advectionFactor,
  ].join(':')

export const getWindFieldConfig = (state: RaceState): WindFieldConfig | null => {
  const cfg = state.windField
  if (!cfg?.enabled) return null
  if (!Number.isFinite(cfg.count) || cfg.count <= 0) return null
  if (!Number.isFinite(cfg.domainLengthWorld) || cfg.domainLengthWorld <= 1) return null
  if (!Number.isFinite(cfg.domainWidthWorld) || cfg.domainWidthWorld <= 1) return null
  if (!Number.isFinite(cfg.sizeWorld) || cfg.sizeWorld <= 1) return null
  if (!Number.isFinite(cfg.intensityKts) || cfg.intensityKts <= 0) return null
  return cfg
}

const getOrCreateBlobs = (seed: number, cfg: WindFieldConfig): PuffBlob[] => {
  const key = makeKey(seed, cfg)
  if (cached?.key === key) return cached.blobs

  const rand = createSeededRandom(seed ^ 0x9e3779b9)
  const blobs: PuffBlob[] = []
  const count = Math.max(1, Math.floor(cfg.count))
  const halfW = cfg.domainWidthWorld / 2

  for (let i = 0; i < count; i += 1) {
    // Base positions in along/cross coordinates.
    const baseAlong = rand() * cfg.domainLengthWorld
    const baseCross = (rand() * 2 - 1) * halfW

    // Size variation (still square-ish, just varying extents).
    const sizeJitter = 0.6 + rand() * 0.8 // 0.6..1.4
    const halfSizeAlong = (cfg.sizeWorld * sizeJitter) / 2
    const halfSizeCross = (cfg.sizeWorld * (0.75 + rand() * 0.6)) / 2

    // Mix puffs and lulls.
    const sign = rand() < 0.5 ? -1 : 1
    const strength = 0.5 + rand() * 0.5 // 0.5..1.0
    const amplitudeKts = sign * cfg.intensityKts * strength

    blobs.push({
      baseAlong,
      baseCross,
      halfSizeAlong,
      halfSizeCross,
      amplitudeKts,
    })
  }

  cached = { key, blobs }
  return blobs
}

const getAxes = (windDirDeg: number) => {
  // Wind directionDeg is where wind comes FROM.
  // Puffs should roll downwind (where wind blows TO).
  const downwindDeg = windDirDeg + 180
  const rad = degToRad(downwindDeg)
  const along = { x: Math.sin(rad), y: -Math.cos(rad) }
  const cross = { x: -along.y, y: along.x }
  return { along, cross }
}

const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.y * b.y

/**
 * Sample local wind delta in knots at a world position.
 * Deterministic for a given (seed, cfg, t, windDirDeg, windSpeed).
 */
export const sampleWindDeltaKts = (state: RaceState, pos: Vec2): number => {
  const cfg = getWindFieldConfig(state)
  if (!cfg) return 0

  const { along: alongAxis, cross: crossAxis } = getAxes(state.wind.directionDeg)

  // Project world position into along/cross coordinates (world units).
  const along = dot(pos, alongAxis)
  const cross = dot(pos, crossAxis)

  // Advect pattern downwind at some fraction of the true wind speed (world units/sec).
  // We keep this tied to wind speed so it “feels” right as breeze changes.
  const windSpeedWorld = state.wind.speed * KNOTS_TO_MS * cfg.advectionFactor
  const alongAtTime = wrap(along - windSpeedWorld * state.t, cfg.domainLengthWorld)

  const blobs = getOrCreateBlobs(state.meta.seed, cfg)
  let delta = 0

  for (let i = 0; i < blobs.length; i += 1) {
    const blob = blobs[i]
    const centerAlong = blob.baseAlong
    const centerCross = blob.baseCross

    const dAlong = shortestWrappedDelta(alongAtTime, centerAlong, cfg.domainLengthWorld)
    const dCross = cross - centerCross

    const ax = Math.abs(dAlong) / Math.max(0.001, blob.halfSizeAlong)
    const cx = Math.abs(dCross) / Math.max(0.001, blob.halfSizeCross)
    if (ax >= 1 || cx >= 1) continue

    // Square-ish falloff: independent along/cross ramps, smoothed.
    const alongW = 1 - smooth01(ax)
    const crossW = 1 - smooth01(cx)
    delta += blob.amplitudeKts * alongW * crossW
  }

  // Keep the resulting field bounded to a readable range.
  const clampAbs = cfg.intensityKts
  return clamp(delta, -clampAbs, clampAbs)
}

/** Sample local wind speed (kts) at a world position. */
export const sampleWindSpeed = (state: RaceState, pos: Vec2): number => {
  const speed = state.wind.speed + sampleWindDeltaKts(state, pos)
  return Math.max(0, speed)
}
