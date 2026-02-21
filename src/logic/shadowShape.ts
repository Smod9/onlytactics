/**
 * Shadow shape definition using a simple grid format.
 * 
 * Each row is a "slice" at a distance downwind from the boat.
 * Values are 0-100 representing shadow intensity (100 = max slowdown).
 * 
 * The shape is symmetric by default (mirrored left/right).
 * Leeward multiplier makes one side wider.
 * 
 * Row 0 = at the boat (should be mostly 0)
 * Last row = far downwind
 * 
 * Center column = directly behind boat
 * Left columns = one side, Right columns = other side
 */

import { WAKE_GRID_CELL_SIZE, WAKE_MAX_SLOWDOWN } from './constants'

/**
 * Shadow shape as a 2D grid of intensities (0-100).
 * 
 * Format: Each row is one "slice" going downwind.
 * Columns represent cross-wind distance from centerline.
 * 
 * Example (5 columns = 2 left, center, 2 right):
 *   [0,  0,  0,  0,  0],   // at boat - no shadow
 *   [0, 20, 50, 20,  0],   // close behind - narrow strong core
 *   [10, 40, 80, 40, 10],  // a bit further - wider, still strong
 *   [20, 50, 70, 50, 20],  // mid-distance
 *   [10, 30, 50, 30, 10],  // further out
 *   [5,  15, 25, 15,  5],  // fading
 *   [0,   5, 10,  5,  0],  // almost gone
 */

// ============================================================================
// EDITABLE SHADOW SHAPE - Tweak these values!
// ============================================================================

/**
 * Shadow shape template.
 * - Rows go downwind (row 0 = at boat, higher rows = further downwind)
 * - Columns go cross-wind (center column = directly behind, edges = sides)
 * - Values: 0 = no shadow, 100 = maximum shadow
 * 
 * Current shape: ~25 rows long, 11 columns wide (5 each side + center)
 * Each cell is ~5 world units (WAKE_GRID_CELL_SIZE)
 */
export const SHADOW_SHAPE_TEMPLATE: number[][] = [
  [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],  // at boat
  [  0,  0,  0,  0, 60, 60, 60, 60, 32, 50, 97,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],  // close
  [  0,  0,  0, 60, 60, 60, 60, 60, 60, 60, 94,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],  // close
  [  0,  0,  0, 60, 60, 60, 60, 60, 45, 68, 91,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],  // close
  [  0,  0,  0, 60, 60, 60, 60, 60, 44, 66, 88,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],  // close
  [  0,  0, 60, 60, 60, 60, 60, 60, 42, 63, 85, 63,  0,  0,  0,  0,  0,  0,  0,  0,  0],  // close
  [  0,  0, 60, 60, 60, 60, 60, 60, 49, 65, 82, 65, 49, 32, 16,  0,  0,  0,  0,  0,  0],  // mid
  [  0,  0, 60, 60, 60, 60, 60, 60, 47, 63, 79, 63, 47, 31, 15,  0,  0,  0,  0,  0,  0],  // mid
  [  0,  0, 60, 60, 60, 60, 60, 60, 45, 60, 76, 60, 45, 30, 15,  0,  0,  0,  0,  0,  0],  // mid
  [  0,  0,  0, 60, 60, 60, 60, 60, 48, 60, 73, 60, 48, 36, 24, 12,  0,  0,  0,  0,  0],  // mid
  [  0,  0,  0,  0, 60, 60, 60, 60, 46, 58, 70, 58, 46, 35, 23, 11,  0,  0,  0,  0,  0],  // mid
  [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0, 67, 55, 44, 33, 22, 11,  0,  0,  0,  0,  0],  // far
  [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0, 54, 45, 36, 27, 18,  9,  0,  0,  0,  0],  // far
  [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0, 61, 52, 43, 34, 26, 17,  8,  0,  0,  0,  0],  // far
  [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0, 58, 49, 41, 33, 24, 16,  8,  0,  0,  0,  0],  // far
  [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0, 55, 48, 41, 34, 27, 20, 13,  6,  0,  0,  0],  // far
  [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0, 52, 45, 39, 32, 26, 19, 13,  6,  0,  0,  0],  // fading
  [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0, 49, 42, 36, 30, 24, 18, 12,  6,  0,  0,  0],  // fading
  [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0, 46, 40, 35, 30, 25, 20, 15, 10,  5,  0,  0],  // fading
  [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0, 43, 38, 33, 28, 23, 19, 14,  9,  4,  0,  0],  // fading
  [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0, 40, 35, 31, 26, 22, 17, 13,  8,  4,  0,  0],  // fading
  [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0, 37, 33, 29, 25, 22, 18, 14, 11,  7,  3,  0],  // fading
  [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0, 34, 30, 27, 23, 20, 17, 13, 10,  6,  3,  0],  // fading
  [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0, 31, 27, 24, 21, 18, 15, 12,  9,  6,  3,  0],  // fading
  [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0, 28, 25, 22, 20, 17, 15, 12, 10,  7,  5,  0],  // fading
  [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0, 25, 22, 20, 18, 15, 13, 11,  9,  6,  4,  0],  // fading
  [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],  // fading
]

/**
 * Leeward side multiplier - makes one side of the shadow wider.
 * 1.0 = symmetric, 2.0 = leeward side is 2x wider
 */
export const SHADOW_LEEWARD_MULTIPLIER = 1.8

/**
 * World units per row (how far downwind each row represents)
 */
export const SHADOW_ROW_SPACING = WAKE_GRID_CELL_SIZE

/**
 * World units per column (how far cross-wind each column represents)
 */
export const SHADOW_COL_SPACING = WAKE_GRID_CELL_SIZE

// ============================================================================
// Helper functions to use the template
// ============================================================================

export type ShadowShapeConfig = {
  template: number[][]
  leewardMultiplier: number
  rowSpacing: number
  colSpacing: number
  maxIntensity: number
}

export const getDefaultShadowShape = (): ShadowShapeConfig => ({
  template: SHADOW_SHAPE_TEMPLATE,
  leewardMultiplier: SHADOW_LEEWARD_MULTIPLIER,
  rowSpacing: SHADOW_ROW_SPACING,
  colSpacing: SHADOW_COL_SPACING,
  maxIntensity: WAKE_MAX_SLOWDOWN,
})

/**
 * Sample the shadow template at a given position relative to the boat.
 * 
 * The template is designed with the asymmetric (wider) side on the RIGHT (positive columns).
 * When the leeward side is actually on the LEFT (isLeewardPositive = false), we flip
 * the cross coordinate to mirror the template.
 * 
 * @param alongDist - Distance downwind (world units)
 * @param crossDist - Distance cross-wind (world units)
 * @param isLeewardPositive - Whether positive crossDist is the leeward side
 *                           (true = leeward on right, false = leeward on left)
 */
export const sampleShadowTemplate = (
  config: ShadowShapeConfig,
  alongDist: number,
  crossDist: number,
  isLeewardPositive: boolean = true,
): number => {
  const { template, rowSpacing, colSpacing, maxIntensity } = config
  
  // No shadow upwind
  if (alongDist <= 0) return 0
  
  const rows = template.length
  const cols = template[0]?.length ?? 0
  if (rows === 0 || cols === 0) return 0
  
  const centerCol = Math.floor(cols / 2)
  
  // Convert along distance to row index (with interpolation)
  const rowF = alongDist / rowSpacing
  if (rowF >= rows - 1) return 0
  
  // FLIP the cross coordinate if leeward is on the negative side
  // This mirrors the template so the wider (leeward) side is always correct
  const flippedCross = isLeewardPositive ? crossDist : -crossDist
  
  // Convert cross distance to column offset
  const colOffset = flippedCross / colSpacing
  const colF = centerCol + colOffset
  
  if (colF < 0 || colF >= cols - 1) return 0
  
  // Bilinear interpolation
  const row0 = Math.floor(rowF)
  const row1 = Math.min(row0 + 1, rows - 1)
  const col0 = Math.floor(colF)
  const col1 = Math.min(col0 + 1, cols - 1)
  
  const tRow = rowF - row0
  const tCol = colF - col0
  
  const v00 = template[row0][col0] / 100
  const v10 = template[row0][col1] / 100
  const v01 = template[row1][col0] / 100
  const v11 = template[row1][col1] / 100
  
  const v0 = v00 * (1 - tCol) + v10 * tCol
  const v1 = v01 * (1 - tCol) + v11 * tCol
  const value = v0 * (1 - tRow) + v1 * tRow
  
  return value * maxIntensity
}

