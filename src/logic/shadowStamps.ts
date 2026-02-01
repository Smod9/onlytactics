/**
 * Pre-computed shadow stamps for grid-based wind shadow system.
 * Similar to polar diagrams - we pre-compute the shadow shape at discrete angles
 * and then just blit the appropriate stamp at runtime.
 * 
 * Shape can be defined via:
 * 1. Template-based (USE_SHADOW_TEMPLATE = true): Edit the grid in shadowShape.ts
 * 2. Computed (USE_SHADOW_TEMPLATE = false): Uses constants for width/falloff curves
 */

import {
  SHADOW_STAMP_ANGLE_STEP,
  WAKE_GRID_CELL_SIZE,
  WAKE_LENGTH,
  WAKE_HALF_WIDTH_START,
  WAKE_HALF_WIDTH_END,
  WAKE_WIDTH_CURVE,
  WAKE_LEEWARD_WIDTH_MULT,
  WAKE_WINDWARD_WIDTH_MULT,
  WAKE_CORE_STRENGTH,
  WAKE_TURB_STRENGTH,
  WAKE_CORE_MAX_SLOWDOWN,
  WAKE_TURB_MAX_SLOWDOWN,
} from './constants'
import {
  getDefaultShadowShape,
  sampleShadowTemplate,
  printShadowTemplate,
  SHADOW_SHAPE_TEMPLATE,
} from './shadowShape'

/**
 * Toggle between template-based and computed shadow shapes.
 * Set to true to use the editable template in shadowShape.ts
 */
const USE_SHADOW_TEMPLATE = true

export type ShadowStamp = {
  /** Intensity values (0-1) for each cell, row-major order */
  data: Float32Array
  /** Width of stamp in cells */
  width: number
  /** Height of stamp in cells */
  height: number
  /** Cell offset from boat position to stamp origin (X) */
  originOffsetX: number
  /** Cell offset from boat position to stamp origin (Y) */
  originOffsetY: number
  /** The downwind angle this stamp represents (degrees) */
  angleDeg: number
}

export type ShadowStampAtlas = {
  /** Pre-computed stamps, indexed by angle / angleStep */
  stamps: ShadowStamp[]
  /** Degrees between stamps */
  angleStep: number
  /** Total number of stamps (360 / angleStep) */
  count: number
}

const degToRad = (deg: number) => (deg * Math.PI) / 180

/**
 * Normalize angle to [0, 360)
 */
const normalizeAngle = (deg: number): number => {
  const mod = deg % 360
  return mod < 0 ? mod + 360 : mod
}

/**
 * Smoothstep function for smooth falloff
 */
const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * Compute the half-width of the shadow at a given distance along the wake.
 * Uses the existing wake tuning parameters.
 */
const computeHalfWidth = (
  alongNorm: number,
  isLeewardSide: boolean,
): number => {
  const sideMult = isLeewardSide ? WAKE_LEEWARD_WIDTH_MULT : WAKE_WINDWARD_WIDTH_MULT
  const baseWidth =
    WAKE_HALF_WIDTH_END +
    (WAKE_HALF_WIDTH_START - WAKE_HALF_WIDTH_END) * Math.pow(1 - alongNorm, WAKE_WIDTH_CURVE)
  return baseWidth * sideMult
}

/**
 * Compute shadow intensity at a point relative to the boat.
 * @param alongDist - Distance along the downwind direction (positive = downwind)
 * @param crossDist - Distance perpendicular to downwind (positive = one side, negative = other)
 * @param leewardSign - Which side is leeward (+1 or -1 for crossDist direction)
 */
const computeShadowIntensity = (
  alongDist: number,
  crossDist: number,
  leewardSign: number,
): number => {
  // Use template-based shape if enabled
  if (USE_SHADOW_TEMPLATE) {
    const config = getDefaultShadowShape()
    const isLeewardPositive = leewardSign > 0
    return sampleShadowTemplate(config, alongDist, crossDist, isLeewardPositive)
  }

  // Otherwise use computed shape (original algorithm)
  // No shadow upwind of the boat
  if (alongDist <= 0) return 0

  // No shadow beyond wake length
  if (alongDist > WAKE_LENGTH) return 0

  const alongNorm = alongDist / WAKE_LENGTH
  const isLeewardSide = Math.sign(crossDist) === leewardSign
  const halfWidth = computeHalfWidth(alongNorm, isLeewardSide)

  const absCross = Math.abs(crossDist)
  if (absCross > halfWidth) return 0

  // Compute falloff
  // Along falloff: stronger near boat, weaker farther
  const alongFactor = 1 - alongNorm

  // Cross falloff: Gaussian-like falloff from center
  // Core zone (stronger) and turbulent zone (weaker)
  const coreWidth = halfWidth * 0.5
  const crossNorm = absCross / halfWidth

  let intensity = 0

  // Core contribution (inner zone)
  if (absCross < coreWidth) {
    const coreFalloff = 1 - smoothstep(0, coreWidth, absCross)
    intensity += WAKE_CORE_MAX_SLOWDOWN * WAKE_CORE_STRENGTH * alongFactor * coreFalloff
  }

  // Turbulent contribution (outer zone)
  const turbFalloff = 1 - smoothstep(0, 1, crossNorm)
  intensity += WAKE_TURB_MAX_SLOWDOWN * WAKE_TURB_STRENGTH * alongFactor * turbFalloff

  return intensity
}

/**
 * Generate a single shadow stamp for a given downwind angle.
 */
const generateStamp = (downwindAngleDeg: number): ShadowStamp => {
  const cellSize = WAKE_GRID_CELL_SIZE

  let lengthCells: number
  let halfWidthCells: number

  if (USE_SHADOW_TEMPLATE) {
    // Use template dimensions directly
    const templateRows = SHADOW_SHAPE_TEMPLATE.length
    const templateCols = SHADOW_SHAPE_TEMPLATE[0]?.length ?? 0
    lengthCells = templateRows + 2 // padding
    halfWidthCells = Math.ceil(templateCols / 2) + 2
  } else {
    // Use constants for computed shape
    const maxHalfWidth = Math.max(
      WAKE_HALF_WIDTH_START * WAKE_LEEWARD_WIDTH_MULT,
      WAKE_HALF_WIDTH_START * WAKE_WINDWARD_WIDTH_MULT,
    )
    lengthCells = Math.ceil(WAKE_LENGTH / cellSize) + 2
    halfWidthCells = Math.ceil(maxHalfWidth / cellSize) + 2
  }

  // Stamp dimensions - need to accommodate rotated shadow
  // For simplicity, use a square that can contain the rotated shape
  const maxExtent = Math.max(lengthCells, halfWidthCells * 2)
  const stampSize = maxExtent + 4 // Extra padding

  const width = stampSize
  const height = stampSize
  const data = new Float32Array(width * height)

  // The stamp origin is at the center
  const originOffsetX = Math.floor(width / 2)
  const originOffsetY = Math.floor(height / 2)

  // Direction vectors for this angle
  const rad = degToRad(downwindAngleDeg)
  const alongX = Math.sin(rad) // downwind direction X
  const alongY = -Math.cos(rad) // downwind direction Y (negative because Y increases downward in screen coords)
  const crossX = -alongY // perpendicular (left side)
  const crossY = alongX

  // Leeward is typically to the left of downwind in our coordinate system
  // This will be adjusted based on boat heading at runtime, but for the stamp
  // we assume leeward is the positive cross direction
  const leewardSign = 1

  // Fill the stamp
  for (let cy = 0; cy < height; cy++) {
    for (let cx = 0; cx < width; cx++) {
      // Cell center position relative to boat (in cells)
      const relCellX = cx - originOffsetX
      const relCellY = cy - originOffsetY

      // Convert to world units
      const worldX = relCellX * cellSize
      const worldY = relCellY * cellSize

      // Project onto along/cross axes
      const alongDist = worldX * alongX + worldY * alongY
      const crossDist = worldX * crossX + worldY * crossY

      // Compute intensity
      const intensity = computeShadowIntensity(alongDist, crossDist, leewardSign)

      data[cy * width + cx] = intensity
    }
  }

  return {
    data,
    width,
    height,
    originOffsetX,
    originOffsetY,
    angleDeg: downwindAngleDeg,
  }
}

/**
 * Create the complete atlas of pre-computed shadow stamps.
 * Call this once at startup.
 */
export const createShadowStampAtlas = (): ShadowStampAtlas => {
  const angleStep = SHADOW_STAMP_ANGLE_STEP
  const count = Math.floor(360 / angleStep)
  const stamps: ShadowStamp[] = []

  for (let i = 0; i < count; i++) {
    const angleDeg = i * angleStep
    stamps.push(generateStamp(angleDeg))
  }

  console.log(
    `[shadowStamps] Created atlas: ${count} stamps, ${stamps[0]?.width}x${stamps[0]?.height} cells each`,
  )

  if (USE_SHADOW_TEMPLATE) {
    console.log('[shadowStamps] Using template-based shape from shadowShape.ts')
    printShadowTemplate()
  } else {
    console.log('[shadowStamps] Using computed shape (constants-based)')
  }

  return { stamps, angleStep, count }
}

/**
 * Get the appropriate stamp for a given wind direction.
 * @param atlas - The pre-computed atlas
 * @param windDirDeg - Wind direction (where wind comes FROM)
 * @returns The closest pre-computed stamp
 */
export const getStampForWindDir = (
  atlas: ShadowStampAtlas,
  windDirDeg: number,
): ShadowStamp => {
  // Shadow points downwind (opposite of wind direction)
  const downwindDeg = normalizeAngle(windDirDeg + 180)
  const index = Math.round(downwindDeg / atlas.angleStep) % atlas.count
  return atlas.stamps[index]
}

/**
 * Get stamp by raw downwind angle.
 */
export const getStampForAngle = (
  atlas: ShadowStampAtlas,
  downwindAngleDeg: number,
): ShadowStamp => {
  const normalized = normalizeAngle(downwindAngleDeg)
  const index = Math.round(normalized / atlas.angleStep) % atlas.count
  return atlas.stamps[index]
}
