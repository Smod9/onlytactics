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
  // Row 0: At boat position - no shadow here
  [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0],
  
  // Rows 1-5: Close behind boat - narrow, building intensity
  [0,   0,   5,  15,  30,  40,  30,  15,   5,   0,   0],
  [0,   5,  15,  35,  60,  75,  60,  35,  15,   5,   0],
  [0,  10,  25,  50,  75,  90,  75,  50,  25,  10,   0],
  [5,  15,  35,  60,  85, 100,  85,  60,  35,  15,   5],
  [5,  20,  40,  65,  85,  95,  85,  65,  40,  20,   5],
  
  // Rows 6-10: Mid-distance - wider, strong
  [8,  22,  42,  62,  80,  90,  80,  62,  42,  22,   8],
  [10, 25,  42,  58,  75,  85,  75,  58,  42,  25,  10],
  [10, 25,  40,  55,  70,  80,  70,  55,  40,  25,  10],
  [10, 23,  38,  52,  65,  75,  65,  52,  38,  23,  10],
  [8,  20,  35,  48,  60,  70,  60,  48,  35,  20,   8],
  
  // Rows 11-15: Getting further - fading
  [6,  18,  32,  44,  55,  65,  55,  44,  32,  18,   6],
  [5,  15,  28,  40,  50,  58,  50,  40,  28,  15,   5],
  [4,  12,  24,  35,  45,  52,  45,  35,  24,  12,   4],
  [3,  10,  20,  30,  40,  46,  40,  30,  20,  10,   3],
  [2,   8,  17,  26,  35,  40,  35,  26,  17,   8,   2],
  
  // Rows 16-20: Far out - fading more
  [2,   6,  14,  22,  30,  35,  30,  22,  14,   6,   2],
  [1,   5,  11,  18,  25,  30,  25,  18,  11,   5,   1],
  [1,   4,   9,  15,  20,  25,  20,  15,   9,   4,   1],
  [0,   3,   7,  12,  16,  20,  16,  12,   7,   3,   0],
  [0,   2,   5,   9,  13,  16,  13,   9,   5,   2,   0],
  
  // Rows 21-25: Very far - nearly gone
  [0,   1,   4,   7,  10,  12,  10,   7,   4,   1,   0],
  [0,   1,   3,   5,   7,   9,   7,   5,   3,   1,   0],
  [0,   0,   2,   4,   5,   6,   5,   4,   2,   0,   0],
  [0,   0,   1,   2,   3,   4,   3,   2,   1,   0,   0],
  [0,   0,   0,   1,   2,   2,   2,   1,   0,   0,   0],
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
 * @param alongDist - Distance downwind (world units)
 * @param crossDist - Distance cross-wind (world units, positive = leeward side)
 * @param isLeewardPositive - Whether positive crossDist is the leeward side
 */
export const sampleShadowTemplate = (
  config: ShadowShapeConfig,
  alongDist: number,
  crossDist: number,
  isLeewardPositive: boolean = true,
): number => {
  const { template, leewardMultiplier, rowSpacing, colSpacing, maxIntensity } = config
  
  // No shadow upwind
  if (alongDist <= 0) return 0
  
  const rows = template.length
  const cols = template[0]?.length ?? 0
  if (rows === 0 || cols === 0) return 0
  
  const centerCol = Math.floor(cols / 2)
  
  // Convert along distance to row index (with interpolation)
  const rowF = alongDist / rowSpacing
  if (rowF >= rows - 1) return 0
  
  // Apply leeward multiplier to cross distance
  // If crossDist is on the leeward side, shrink it (making the shadow wider on that side)
  // If crossDist is on the windward side, keep it as-is
  const isLeeward = isLeewardPositive ? crossDist > 0 : crossDist < 0
  const adjustedCross = isLeeward ? crossDist / leewardMultiplier : crossDist
  
  // Convert cross distance to column offset
  const colOffset = adjustedCross / colSpacing
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

/**
 * Print the template as ASCII art for debugging
 */
export const printShadowTemplate = (template: number[][] = SHADOW_SHAPE_TEMPLATE): void => {
  const chars = ' ░▒▓█'
  console.log('Shadow Shape Template:')
  console.log('(Boat is at top, downwind is down)')
  console.log('')
  template.forEach((row, i) => {
    const line = row.map(v => {
      const idx = Math.min(chars.length - 1, Math.floor(v / 25))
      return chars[idx]
    }).join('')
    console.log(`Row ${i.toString().padStart(2)}: ${line}`)
  })
}
