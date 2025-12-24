/**
 * Sailing Physics Engine
 *
 * @author Sebastien Gouin-Davis
 * @copyright 2025 Sebastien Gouin-Davis
 * @license MIT
 *
 * This module implements a simplified sailing physics model based on polar diagrams.
 * Note: Despite some variable names using "awa", this implementation uses True Wind Angle (TWA),
 * not Apparent Wind Angle. TWA is the angle between the boat heading and true wind direction.
 *
 * TODO: We should rename all the awa variables to twa (true wind angle) and awa (apparent wind angle)!!!!
 *
 * Key concepts:
 * - Polar diagrams: Show boat speed as a function of TWA and wind speed
 * - VMG (Velocity Made Good): Component of boat speed toward/away from wind
 * - No-go zone: Angles too close to wind where boat cannot sail
 * - Tacking: Turning through the no-go zone with speed penalty
 *
 * Main Physics Loop (stepRaceState):
 * 1. Process VMG mode (autopilot)
 *    - computeVmgAngles() - Find optimal upwind/downwind angles
 *    - headingFromAwa() - Convert wind angle to compass heading
 *
 * 2. Determine desired heading (from input or VMG autopilot)
 *    - clampDesiredHeading() - Enforce no-go zone and downwind limits
 *
 * 3. Update boat heading
 *    - steerTowardsDesired() - Turn boat at TURN_RATE_DEG per second
 *    - applyStallDecay() - Decay stall timer from entering no-go zone
 *    - applyTackTimer() - Decay tack penalty timer
 *
 * 4. Calculate target speed from polars
 *    - apparentWindAngle() - Calculate TWA (boat heading vs wind direction)
 *    - lookupPolarRatio() - Interpolate speed ratio from polar table
 *    - polarTargetSpeed() - Compute target speed with wind speed and trim
 *
 * 5. Apply speed penalties
 *    - Stall penalty (STALL_SPEED_FACTOR) when in no-go zone
 *    - Tack penalty (TACK_SPEED_PENALTY) during significant turns
 *
 * 6. Update boat speed and position
 *    - smoothSpeed() - Interpolate toward target speed
 *    - Update position based on heading vector and speed
 */

import type { BoatState, PlayerInput, RaceState } from '@/types/race'
import {
  ACCELERATION_RATE,
  DEFAULT_SHEET,
  DECELERATION_RATE,
  HEADING_STEP_DEG,
  KNOTS_TO_MS,
  MAX_SPEED_KTS,
  MAX_DOWNWIND_ANGLE_DEG,
  NO_GO_ANGLE_DEG,
  STALL_DURATION_S,
  TACK_MIN_ANGLE_DEG,
  TACK_MIN_TIME_SECONDS,
  TACK_SPEED_PENALTY,
  WAKE_CONE_HALF_ANGLE_DEG,
  WAKE_HALF_WIDTH_END,
  WAKE_HALF_WIDTH_START,
  WAKE_LENGTH,
  WAKE_MAX_SLOWDOWN,
  WAKE_MIN_STRENGTH,
  TURN_RATE_DEG,
} from './constants'
import { appEnv } from '@/config/env'
import { sampleWindSpeed } from '@/logic/windField'

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/** Clamp a value between min and max */
export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))

/** Convert degrees to radians */
export const degToRad = (deg: number) => (deg * Math.PI) / 180

/** Convert radians to degrees */
export const radToDeg = (rad: number) => (rad * 180) / Math.PI

const dirToUnit = (deg: number) => {
  const rad = degToRad(deg)
  return { x: Math.sin(rad), y: -Math.cos(rad) }
}

/**
 * Normalize angle to 0-360 range
 * Example: -45° becomes 315°, 370° becomes 10°
 */
export const normalizeDeg = (deg: number) => {
  const wrapped = deg % 360
  return wrapped < 0 ? wrapped + 360 : wrapped
}

/**
 * Round and normalize heading to nearest integer degree
 * Used to reduce network traffic and ensure consistent heading values
 */
export const quantizeHeading = (deg: number) => {
  const rounded = Math.round(normalizeDeg(deg))
  const wrapped = rounded % 360
  return wrapped < 0 ? wrapped + 360 : wrapped
}

/**
 * Calculate shortest signed angular difference from current to target
 * Returns value in range [-180, 180]
 * Positive = turn right, Negative = turn left
 */
export const angleDiff = (targetDeg: number, currentDeg: number) => {
  let diff = targetDeg - currentDeg
  diff = ((((diff + 180) % 360) + 360) % 360) - 180
  return diff
}

/**
 * Calculate boat heading from wind direction and angle
 * @param windDirDeg - True wind direction (0° = North)
 * @param awaDeg - Angle off the wind (positive = starboard tack, negative = port tack)
 * Note: Despite name, this works with TWA (True Wind Angle)
 */
export const headingFromAwa = (windDirDeg: number, awaDeg: number) =>
  normalizeDeg(windDirDeg + awaDeg)

// ============================================================================
// WIND ANGLE AND POLAR CALCULATIONS
// ============================================================================

/**
 * Calculate True Wind Angle (TWA) - angle between boat heading and wind direction
 * Note: Despite the function name, this is TWA not AWA
 * @returns Signed angle: positive = starboard tack, negative = port tack
 */
const apparentWindAngle = (boatHeadingDeg: number, windDirDeg: number) =>
  angleDiff(boatHeadingDeg, windDirDeg)

/**
 * Polar diagram: defines boat speed as ratio of wind speed at different TWA
 * Based on typical dinghy performance (e.g., Laser, 420)
 *
 * Key features:
 * - 0° (head to wind): No speed
 * - 30-45°: Close-hauled, moderate speed
 * - 90°: Beam reach, near optimal
 * - 135°: Broad reach, fastest point of sail (ratio > 1.0 means faster than wind!)
 * - 180°: Running downwind, slower due to reduced apparent wind
 */
const polarTable = [
  { awa: 0, ratio: 0 }, // Dead into wind - no speed
  { awa: 20, ratio: 0.2 }, // Luffing hard
  { awa: 30, ratio: 0.45 }, // Close-hauled lower limit
  { awa: 45, ratio: 0.65 }, // Typical close-hauled angle
  { awa: 60, ratio: 0.8 }, // Close reach
  { awa: 75, ratio: 0.9 }, // Reaching
  { awa: 90, ratio: 0.95 }, // Beam reach
  { awa: 110, ratio: 1.05 }, // Broad reach - getting fast
  // Downwind shaping:
  // - We want best downwind VMG to be near ~140° (broad reach), not 160-180°.
  // - And we want dead-downwind (180°) to be ~30% slower than the VMG-optimal point.
  { awa: 135, ratio: 1.1 }, // Broad reach (fast)
  { awa: 140, ratio: 1.15 }, // Target VMG-optimal region
  { awa: 150, ratio: 1.0 }, // Getting deeper: slower enough that VMG doesn't keep increasing
  { awa: 160, ratio: 0.9 }, // Deep downwind
  { awa: 170, ratio: 0.75 }, // Very deep downwind
  { awa: 180, ratio: 0.5 }, // Dead downwind (~30% slower than 1.15 peak)
]

/**
 * Look up speed ratio from polar table with linear interpolation
 * @param awa - True wind angle (absolute value used, works for both tacks)
 * @returns Speed ratio: boat speed = wind speed × ratio
 */
const lookupPolarRatio = (awa: number) => {
  const absAwa = clamp(Math.abs(awa), 0, 180)
  for (let i = 0; i < polarTable.length - 1; i += 1) {
    const current = polarTable[i]
    const next = polarTable[i + 1]
    if (absAwa >= current.awa && absAwa <= next.awa) {
      const span = next.awa - current.awa || 1
      const t = (absAwa - current.awa) / span
      // Linear interpolation between table points
      return current.ratio + (next.ratio - current.ratio) * t
    }
  }
  return polarTable[polarTable.length - 1].ratio
}

/**
 * Calculate target boat speed based on wind and sail trim
 * @param awaDeg - True wind angle (despite parameter name)
 * @param windSpeed - Wind speed in knots
 * @param sheet - Sail trim (0 = fully out, 1 = fully in)
 * @returns Target speed in knots
 */
const polarTargetSpeed = (awaDeg: number, windSpeed: number, sheet: number) => {
  const ratio = lookupPolarRatio(awaDeg)
  // Sheet effect: poor trim = 60% speed, optimal trim = 100% speed
  const sheetEffect = 0.6 + 0.4 * clamp(sheet, 0, 1)
  const target = windSpeed * ratio * sheetEffect
  return clamp(target, 0, MAX_SPEED_KTS)
}

/**
 * Smoothly interpolate boat speed toward target
 * Uses different rates for acceleration vs deceleration (boats slow down faster)
 */
const smoothSpeed = (current: number, target: number, dt: number) => {
  const rate = target > current ? ACCELERATION_RATE : DECELERATION_RATE
  const mix = clamp(rate * dt, 0, 1)
  return current + (target - current) * mix
}

// ============================================================================
// STEERING AND HEADING CONTROL
// ============================================================================

/**
 * Enforce sailing constraints on desired heading
 *
 * Boats cannot sail directly into the wind (no-go zone).
 * Downwind is allowed up to MAX_DOWNWIND_ANGLE_DEG (typically 180 = dead downwind).
 *
 * @returns The clamped heading that was actually set
 */
const clampDesiredHeading = (
  boat: BoatState,
  desiredHeadingDeg: number,
  windDirDeg: number,
) => {
  const diff = angleDiff(desiredHeadingDeg, windDirDeg)
  const absDiff = Math.abs(diff)

  // No-go zone: too close to wind, boat stalls
  if (absDiff < NO_GO_ANGLE_DEG) {
    boat.stallTimer = STALL_DURATION_S
    const sign = diff >= 0 ? 1 : -1
    const clamped = headingFromAwa(windDirDeg, sign * NO_GO_ANGLE_DEG)
    boat.desiredHeadingDeg = clamped
    return clamped
  }

  // Too far downwind (by the lee) - prevent sailing past MAX_DOWNWIND_ANGLE_DEG.
  // If MAX_DOWNWIND_ANGLE_DEG is 180, this should effectively never clamp.
  if (absDiff > MAX_DOWNWIND_ANGLE_DEG) {
    const sign = diff >= 0 ? 1 : -1
    const clamped = headingFromAwa(windDirDeg, sign * MAX_DOWNWIND_ANGLE_DEG)
    boat.desiredHeadingDeg = clamped
    return clamped
  }

  // Valid sailing angle - accept the desired heading
  boat.desiredHeadingDeg = normalizeDeg(desiredHeadingDeg)
  return boat.desiredHeadingDeg
}

/**
 * Gradually turn boat toward desired heading at maximum turn rate
 *
 * Small heading errors (< ~5°) snap instantly for responsive control.
 * Larger turns (tacks, gybes) happen at TURN_RATE_DEG per second.
 */
const steerTowardsDesired = (boat: BoatState, dt: number) => {
  const error = angleDiff(boat.desiredHeadingDeg, boat.headingDeg)

  // Snap to target for small adjustments (feels more responsive)
  if (Math.abs(error) <= HEADING_STEP_DEG + 0.2) {
    boat.headingDeg = normalizeDeg(boat.desiredHeadingDeg)
    return
  }

  // Gradual turn at maximum turn rate
  const maxTurn = TURN_RATE_DEG * dt
  const applied = clamp(error, -maxTurn, maxTurn)
  boat.headingDeg = normalizeDeg(boat.headingDeg + applied)
}

/**
 * Decay stall timer (from sailing into no-go zone)
 * While stalled, boat speed is heavily reduced
 */
const applyStallDecay = (boat: BoatState, dt: number) => {
  if (boat.stallTimer <= 0) return
  boat.stallTimer = Math.max(0, boat.stallTimer - dt)
}

/**
 * Decay tack timer (from making significant turns)
 * While tack timer is active, boat speed is penalized
 */
const applyTackTimer = (boat: BoatState, dt: number) => {
  if (boat.tackTimer <= 0) return
  boat.tackTimer = Math.max(0, boat.tackTimer - dt)
}

// ============================================================================
// WIND SHADOW / WAKE MODEL
// ============================================================================

const computeWakeFactors = (state: RaceState): Record<string, number> => {
  const boats = Object.values(state.boats)
  const factors: Record<string, number> = {}

  const downwindDeg = normalizeDeg(state.wind.directionDeg + 180)
  const downwindVec = dirToUnit(downwindDeg)
  const crossVec = { x: -downwindVec.y, y: downwindVec.x }
  const maxRadius = WAKE_LENGTH + WAKE_HALF_WIDTH_END * 2
  const maxRadiusSq = maxRadius * maxRadius
  const coneCos = Math.cos(degToRad(WAKE_CONE_HALF_ANGLE_DEG))

  boats.forEach((boat) => {
    factors[boat.id] = boat.wakeFactor ?? 1
  })

  for (let ti = 0; ti < boats.length; ti += 1) {
    const target = boats[ti]
    let slowdown = 0

    for (let si = 0; si < boats.length; si += 1) {
      if (si === ti) continue
      const source = boats[si]
      const dx = target.pos.x - source.pos.x
      const dy = target.pos.y - source.pos.y
      const distSq = dx * dx + dy * dy
      if (distSq > maxRadiusSq) continue
      if (distSq === 0) continue

      const dist = Math.sqrt(distSq)
      const relUnitX = dx / dist
      const relUnitY = dy / dist
      const align = relUnitX * downwindVec.x + relUnitY * downwindVec.y
      if (align <= 0 || align < coneCos) continue

      const along = dx * downwindVec.x + dy * downwindVec.y
      if (along <= 0 || along > WAKE_LENGTH) continue

      const cross = dx * crossVec.x + dy * crossVec.y
      const alongNorm = along / WAKE_LENGTH
      const halfWidth =
        WAKE_HALF_WIDTH_START + (WAKE_HALF_WIDTH_END - WAKE_HALF_WIDTH_START) * alongNorm
      const lateral = Math.abs(cross)
      // Gaussian falloff for lateral distance
      const lateralFactor = Math.exp(-(lateral * lateral) / (halfWidth * halfWidth))
      // Linear falloff along the wake (stronger near the boat, weaker farther away)
      const alongFactor = 1 - alongNorm
      const contribution = WAKE_MAX_SLOWDOWN * alongFactor * lateralFactor
      if (contribution < WAKE_MIN_STRENGTH) continue
      slowdown = Math.min(WAKE_MAX_SLOWDOWN, slowdown + contribution)
    }

    const wakeFactor = clamp(1 - slowdown, 1 - WAKE_MAX_SLOWDOWN, 1)
    factors[target.id] = wakeFactor
  }

  return factors
}

// ============================================================================
// MAIN PHYSICS STEP
// ============================================================================

export type InputMap = Record<string, PlayerInput>

/**
 * Main physics simulation step - advances race state by dt seconds
 *
 * This is the heart of the physics engine. For each boat, it:
 * 1. Processes player input (heading changes, VMG mode)
 * 2. Updates boat heading (steering toward desired heading)
 * 3. Calculates target speed from polar diagram based on TWA
 * 4. Applies penalties (stalling, tacking)
 * 5. Updates boat position based on heading and speed
 *
 * @param state - Current race state (modified in place)
 * @param inputs - Map of player inputs by boat ID
 * @param dt - Time step in seconds (typically 1/60 for 60fps)
 */
export const stepRaceState = (state: RaceState, inputs: InputMap, dt: number) => {
  // Advance simulation time
  state.t += dt

  // Start race when countdown reaches zero
  if (state.phase === 'prestart' && state.t >= 0) {
    state.phase = 'running'
  }

  const wakeFactors = computeWakeFactors(state)

  // Update each boat
  Object.values(state.boats).forEach((boat) => {
    const input = inputs[boat.id]

    // ========================================================================
    // STEP 1: Process VMG Mode (Velocity Made Good autopilot)
    // ========================================================================

    // Only update vmgMode when explicitly provided in input (preserve between ticks)
    if (input?.vmgMode !== undefined) {
      boat.vmgMode = input.vmgMode
    }

    // Only update blowSails when explicitly provided in input (preserve between ticks).
    // This is a held control: keydown sets true, keyup sets false.
    if (input?.blowSails !== undefined) {
      boat.blowSails = input.blowSails
    }

    // If there's a heading input, exit VMG mode (user is taking manual control)
    // But skip this check during spins (rightsSuspended) since spins inject headings
    const hasHeadingInput =
      !boat.rightsSuspended &&
      (input?.desiredHeadingDeg !== undefined ||
        input?.absoluteHeadingDeg !== undefined ||
        input?.deltaHeadingDeg !== undefined)
    if (hasHeadingInput && boat.vmgMode) {
      boat.vmgMode = false
    }

    // ========================================================================
    // STEP 2: Determine desired heading (from input or VMG autopilot)
    // ========================================================================

    let desiredHeading: number

    // VMG mode: automatically sail at optimal upwind/downwind angles
    if (boat.vmgMode && !boat.rightsSuspended) {
      // Use current desired heading or actual heading to determine tack
      // This ensures we maintain the current tack even as the boat turns
      const currentHeading = boat.desiredHeadingDeg ?? boat.headingDeg
      const headingDiff = angleDiff(currentHeading, state.wind.directionDeg)
      const tackSign = headingDiff >= 0 ? 1 : -1 // Starboard (+1) or port (-1) tack
      const absAwa = Math.abs(headingDiff)

      // Compute optimal VMG angles for current wind speed
      const vmgAngles = computeVmgAngles(state.wind.speed)

      // Choose upwind or downwind angle based on which side of beam reach we're on
      const isUpwind = absAwa <= 90
      const targetAwa = isUpwind ? vmgAngles.upwindAwa : vmgAngles.downwindAwa
      const calculatedHeading = headingFromAwa(
        state.wind.directionDeg,
        tackSign * targetAwa,
      )

      // Quantize to ensure heading updates even with small wind changes
      desiredHeading = quantizeHeading(calculatedHeading)
    } else {
      // Manual mode: use input or maintain current heading
      desiredHeading =
        input?.desiredHeadingDeg ?? boat.desiredHeadingDeg ?? boat.headingDeg
    }

    // ========================================================================
    // STEP 3: Update boat heading (constrained by sailing limits)
    // ========================================================================

    clampDesiredHeading(boat, desiredHeading, state.wind.directionDeg)
    steerTowardsDesired(boat, dt)
    applyStallDecay(boat, dt)
    applyTackTimer(boat, dt)

    // ========================================================================
    // STEP 4: Calculate target speed from polar diagram
    // ========================================================================

    // Calculate TWA (despite variable name "awa")
    const awa = apparentWindAngle(boat.headingDeg, state.wind.directionDeg)
    const wakeFactor = wakeFactors[boat.id] ?? 1
    boat.wakeFactor = wakeFactor

    const localWindSpeed = sampleWindSpeed(state, boat.pos)
    let targetSpeed =
      polarTargetSpeed(awa, localWindSpeed, DEFAULT_SHEET) * appEnv.speedMultiplier

    // Slow-down / depower handling:
    // - Blowing sails (held control) should reduce speed to ~10% of TWS.
    // - Near the maximum upwind angle (NO_GO boundary), speed should also be ~10% of TWS
    //   (this keeps "parking" and prestart control consistent and avoids being too fast at max upwind).
    const absAwa = Math.abs(awa)
    const slowCap = localWindSpeed * 0.1 * appEnv.speedMultiplier
    const nearMaxUpwind = absAwa <= NO_GO_ANGLE_DEG + 1
    const shouldSlow = boat.blowSails || boat.stallTimer > 0 || nearMaxUpwind
    if (shouldSlow) {
      targetSpeed = Math.min(targetSpeed, slowCap)
    }

    // ========================================================================
    // STEP 5: Apply tacking penalties
    // ========================================================================

    // Detect significant turns and start tack timer
    const headingError = Math.abs(angleDiff(boat.desiredHeadingDeg, boat.headingDeg))
    if (headingError > TACK_MIN_ANGLE_DEG) {
      // If starting a new tack, set timer to minimum duration
      if (boat.tackTimer <= 0) {
        boat.tackTimer = TACK_MIN_TIME_SECONDS
      }
    }

    // Apply speed penalty while tack timer is active
    if (boat.tackTimer > 0) {
      targetSpeed *= TACK_SPEED_PENALTY
    }

    // Apply wind shadow / wake slowdown
    targetSpeed *= wakeFactor
    if (appEnv.debugHud && wakeFactor < 0.995) {
      console.debug('[wake]', boat.name, wakeFactor.toFixed(3))
    }

    // ========================================================================
    // STEP 6: Update boat speed and position
    // ========================================================================

    // Smoothly interpolate toward target speed
    boat.speed = smoothSpeed(boat.speed, targetSpeed, dt)

    // Update position based on heading and speed
    // Coordinate system: +X = East, +Y = South (y inverted because North is "up" on screen)
    const courseRad = degToRad(boat.headingDeg)
    const speedMs = boat.speed * KNOTS_TO_MS
    boat.prevPos = boat.prevPos ?? { x: boat.pos.x, y: boat.pos.y }
    boat.prevPos.x = boat.pos.x
    boat.prevPos.y = boat.pos.y
    boat.pos.x += Math.sin(courseRad) * speedMs * dt
    boat.pos.y -= Math.cos(courseRad) * speedMs * dt // Negative because North is up
  })
}

// ============================================================================
// TACTICAL CALCULATIONS
// ============================================================================

/**
 * Calculate relative bearing from one boat to another
 * Used for right-of-way rules and tactical display
 *
 * @returns Angle in degrees: 0° = dead ahead, 90° = starboard beam, -90° = port beam
 */
export const computeRelativeBearing = (headingDeg: number, otherHeadingDeg: number) => {
  return angleDiff(otherHeadingDeg, headingDeg)
}

/**
 * Calculate absolute angular distance between two angles
 * Always returns positive value (unlike angleDiff which is signed)
 */
export const degreesBetween = (a: number, b: number) =>
  Math.abs(radToDeg(Math.atan2(Math.sin(degToRad(a - b)), Math.cos(degToRad(a - b)))))

/**
 * Compute optimal VMG (Velocity Made Good) angles for current wind speed
 *
 * VMG is the component of boat speed directly toward/away from wind.
 * This searches the polar diagram to find angles that maximize VMG.
 *
 * Typical results:
 * - Upwind: ~40-50° (close-hauled)
 * - Downwind: ~140-160° (broad reach, NOT dead downwind!)
 *
 * Note: Best downwind VMG is usually NOT at 180° because boats go faster
 * on a broad reach, and the extra speed more than compensates for the
 * less direct course.
 *
 * @param windSpeed - Current wind speed in knots
 * @returns Optimal upwind and downwind TWA angles
 */
export const computeVmgAngles = (windSpeed: number) => {
  let bestUpAngle = NO_GO_ANGLE_DEG
  let bestUpValue = -Infinity
  let bestDownAngle = MAX_DOWNWIND_ANGLE_DEG
  let bestDownValue = -Infinity

  // Search all valid sailing angles
  for (let angle = NO_GO_ANGLE_DEG; angle <= MAX_DOWNWIND_ANGLE_DEG; angle += 1) {
    const speed = polarTargetSpeed(angle, windSpeed, DEFAULT_SHEET)
    const rad = degToRad(angle)

    // Upwind VMG: component of speed toward wind (cos of angle from wind)
    const upwindVmg = speed * Math.cos(rad)
    if (angle <= 90 && upwindVmg > bestUpValue) {
      bestUpValue = upwindVmg
      bestUpAngle = angle
    }

    // Downwind VMG: component of speed away from wind
    const downwindVmg = speed * Math.cos(Math.PI - rad)
    if (angle >= 60 && downwindVmg > bestDownValue) {
      bestDownValue = downwindVmg
      bestDownAngle = angle
    }
  }

  return {
    upwindAwa: bestUpAngle, // Typically ~45° (close-hauled)
    downwindAwa: bestDownAngle, // Typically ~135° (broad reach, NOT running!)
  }
}

/**
 * Alias for apparentWindAngle with clearer name
 * Note: Despite name, this actually calculates TWA (True Wind Angle), not AWA
 */
export const apparentWindAngleSigned = apparentWindAngle
