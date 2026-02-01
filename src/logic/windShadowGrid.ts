/**
 * Runtime grid for wind shadow computation.
 * Each frame: clear grid, blit stamps for all boats, sample at boat positions.
 */

import type { RaceState, Vec2 } from '@/types/race'
import type { ShadowStamp, ShadowStampAtlas } from './shadowStamps'
import { getStampForWindDir } from './shadowStamps'
import {
  WAKE_GRID_CELL_SIZE,
  WAKE_MAX_SLOWDOWN,
  WAKE_LENGTH,
  WAKE_HALF_WIDTH_START,
  WAKE_LEEWARD_WIDTH_MULT,
} from './constants'

export type WindShadowGrid = {
  /** Shadow intensity values, row-major order */
  data: Float32Array
  /** Grid width in cells */
  width: number
  /** Grid height in cells */
  height: number
  /** World units per cell */
  cellSize: number
  /** World X coordinate of grid[0,0] */
  originX: number
  /** World Y coordinate of grid[0,0] */
  originY: number
}

export type GridBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/**
 * Compute course bounds with padding for shadow overhang.
 */
export const computeCourseBounds = (state: RaceState): GridBounds => {
  // Find extremes from marks
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  for (const mark of state.marks) {
    minX = Math.min(minX, mark.x)
    maxX = Math.max(maxX, mark.x)
    minY = Math.min(minY, mark.y)
    maxY = Math.max(maxY, mark.y)
  }

  // Include start line
  if (state.startLine) {
    minX = Math.min(minX, state.startLine.pin.x, state.startLine.committee.x)
    maxX = Math.max(maxX, state.startLine.pin.x, state.startLine.committee.x)
    minY = Math.min(minY, state.startLine.pin.y, state.startLine.committee.y)
    maxY = Math.max(maxY, state.startLine.pin.y, state.startLine.committee.y)
  }

  // Include leeward gate
  if (state.leewardGate) {
    minX = Math.min(minX, state.leewardGate.left.x, state.leewardGate.right.x)
    maxX = Math.max(maxX, state.leewardGate.left.x, state.leewardGate.right.x)
    minY = Math.min(minY, state.leewardGate.left.y, state.leewardGate.right.y)
    maxY = Math.max(maxY, state.leewardGate.left.y, state.leewardGate.right.y)
  }

  // Add padding for shadow overhang and boat spawn positions
  const shadowPadding = WAKE_LENGTH + WAKE_HALF_WIDTH_START * WAKE_LEEWARD_WIDTH_MULT
  const spawnPadding = 200 // Boats spawn south of start line

  return {
    minX: minX - shadowPadding,
    maxX: maxX + shadowPadding,
    minY: minY - shadowPadding,
    maxY: maxY + shadowPadding + spawnPadding,
  }
}

/**
 * Create a wind shadow grid for the given bounds.
 */
export const createWindShadowGrid = (bounds: GridBounds): WindShadowGrid => {
  const cellSize = WAKE_GRID_CELL_SIZE

  const width = Math.ceil((bounds.maxX - bounds.minX) / cellSize)
  const height = Math.ceil((bounds.maxY - bounds.minY) / cellSize)

  const data = new Float32Array(width * height)

  console.log(
    `[windShadowGrid] Created grid: ${width}x${height} cells (${(data.byteLength / 1024).toFixed(1)}KB)`,
  )

  return {
    data,
    width,
    height,
    cellSize,
    originX: bounds.minX,
    originY: bounds.minY,
  }
}

/**
 * Clear the grid to zero. Call at the start of each frame.
 */
export const clearGrid = (grid: WindShadowGrid): void => {
  grid.data.fill(0)
}

/**
 * Convert world coordinates to grid cell indices.
 */
const worldToCell = (
  grid: WindShadowGrid,
  worldX: number,
  worldY: number,
): { cx: number; cy: number } => {
  return {
    cx: Math.floor((worldX - grid.originX) / grid.cellSize),
    cy: Math.floor((worldY - grid.originY) / grid.cellSize),
  }
}

/**
 * Blit a shadow stamp onto the grid at a world position.
 * Values are additive (multiple overlapping shadows accumulate).
 */
export const blitStamp = (
  grid: WindShadowGrid,
  stamp: ShadowStamp,
  worldX: number,
  worldY: number,
): void => {
  // Convert boat position to grid cell
  const { cx: boatCellX, cy: boatCellY } = worldToCell(grid, worldX, worldY)

  // Compute where the stamp origin maps to in the grid
  const stampStartX = boatCellX - stamp.originOffsetX
  const stampStartY = boatCellY - stamp.originOffsetY

  // Blit each cell of the stamp onto the grid
  for (let sy = 0; sy < stamp.height; sy++) {
    const gridY = stampStartY + sy
    if (gridY < 0 || gridY >= grid.height) continue

    for (let sx = 0; sx < stamp.width; sx++) {
      const gridX = stampStartX + sx
      if (gridX < 0 || gridX >= grid.width) continue

      const stampValue = stamp.data[sy * stamp.width + sx]
      if (stampValue <= 0) continue

      const gridIdx = gridY * grid.width + gridX
      grid.data[gridIdx] += stampValue
    }
  }
}

/**
 * Sample the grid at a world position.
 * Returns the shadow intensity (0 = no shadow, higher = more shadow).
 */
export const sampleGrid = (grid: WindShadowGrid, pos: Vec2): number => {
  const { cx, cy } = worldToCell(grid, pos.x, pos.y)

  // Clamp to grid bounds
  if (cx < 0 || cx >= grid.width || cy < 0 || cy >= grid.height) {
    return 0
  }

  return grid.data[cy * grid.width + cx]
}

/**
 * Sample with bilinear interpolation for smoother results.
 */
export const sampleGridSmooth = (grid: WindShadowGrid, pos: Vec2): number => {
  const fx = (pos.x - grid.originX) / grid.cellSize
  const fy = (pos.y - grid.originY) / grid.cellSize

  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const x1 = x0 + 1
  const y1 = y0 + 1

  // Clamp to grid bounds
  if (x0 < 0 || x1 >= grid.width || y0 < 0 || y1 >= grid.height) {
    return sampleGrid(grid, pos) // Fall back to nearest
  }

  const tx = fx - x0
  const ty = fy - y0

  const v00 = grid.data[y0 * grid.width + x0]
  const v10 = grid.data[y0 * grid.width + x1]
  const v01 = grid.data[y1 * grid.width + x0]
  const v11 = grid.data[y1 * grid.width + x1]

  // Bilinear interpolation
  const v0 = v00 * (1 - tx) + v10 * tx
  const v1 = v01 * (1 - tx) + v11 * tx
  return v0 * (1 - ty) + v1 * ty
}

/**
 * Compute wake factors for all boats using the grid-based approach.
 * Returns a map of boatId -> wakeFactor (1 = no shadow, lower = more shadow).
 * 
 * Important: Each boat is only affected by OTHER boats' shadows, not its own.
 */
export const computeWakeFactorsFromGrid = (
  state: RaceState,
  grid: WindShadowGrid,
  atlas: ShadowStampAtlas,
): Record<string, number> => {
  const boats = Object.values(state.boats)
  const factors: Record<string, number> = {}

  // Get the stamp for current wind direction
  const stamp = getStampForWindDir(atlas, state.wind.directionDeg)

  // For each target boat, compute wake factor from all OTHER boats' shadows
  for (const targetBoat of boats) {
    // Clear grid and blit only OTHER boats' shadows
    clearGrid(grid)
    
    for (const sourceBoat of boats) {
      // Skip self - a boat shouldn't be affected by its own shadow
      if (sourceBoat.id === targetBoat.id) continue
      blitStamp(grid, stamp, sourceBoat.pos.x, sourceBoat.pos.y)
    }

    // Sample at target boat's position
    const shadowIntensity = sampleGridSmooth(grid, targetBoat.pos)

    // Convert to wake factor (1 = no slowdown, lower = more slowdown)
    const clampedIntensity = Math.min(shadowIntensity, WAKE_MAX_SLOWDOWN)
    factors[targetBoat.id] = 1 - clampedIntensity
  }

  return factors
}

/**
 * Get raw grid data for visualization.
 * Returns a copy of the grid data.
 */
export const getGridDataForVisualization = (grid: WindShadowGrid): {
  data: Float32Array
  width: number
  height: number
  cellSize: number
  originX: number
  originY: number
} => {
  return {
    data: new Float32Array(grid.data),
    width: grid.width,
    height: grid.height,
    cellSize: grid.cellSize,
    originX: grid.originX,
    originY: grid.originY,
  }
}
