/**
 * Sailing Physics Engine
 *
 * @author Sebastien Gouin-Davis
 * @copyright 2025 Sebastien Gouin-Davis
 * @license MIT
 *
 * This module implements a simplified sailing physics model based on polar diagrams.
 * TWA (True Wind Angle) is the angle between the boat heading and true wind direction.
 * AWA (Apparent Wind Angle) accounts for boat velocity and is used for windshadow calculations.
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
 *    - headingFromTwa() - Convert wind angle to compass heading
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
 *    - trueWindAngle() - Calculate TWA (boat heading vs wind direction)
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
  TURN_RATE_DEG,
  MAX_REVERSE_SPEED_KTS,
  LEEWARD_DRIFT_SPEED_KTS,
  LEEWARD_DRIFT_THRESHOLD_KTS,
  COLLISION_SLOWDOWN_AT_FAULT,
} from './constants'
import { getEffectiveWakeTuning } from '@/logic/wakeTuning'
import { appEnv } from '@/config/env'
import { sampleWindSpeed } from '@/logic/windField'
import { resolveBoatMarkCollisions } from '@/logic/collision/rapier'
import type { CollisionOutcome } from '@/logic/rules'

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

const rotateVec = (vec: { x: number; y: number }, deg: number) => {
  const rad = degToRad(deg)
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return { x: vec.x * cos - vec.y * sin, y: vec.x * sin + vec.y * cos }
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
 * Calculate boat heading from wind direction and TWA
 * @param windDirDeg - True wind direction (0° = North)
 * @param twaDeg - True Wind Angle (positive = starboard tack, negative = port tack)
 */
export const headingFromTwa = (windDirDeg: number, twaDeg: number) =>
  normalizeDeg(windDirDeg + twaDeg)

// ============================================================================
// WIND ANGLE AND POLAR CALCULATIONS
// ============================================================================

/**
 * Calculate True Wind Angle (TWA) - angle between boat heading and wind direction
 * @returns Signed angle: positive = starboard tack, negative = port tack
 */
const trueWindAngle = (boatHeadingDeg: number, windDirDeg: number) =>
  angleDiff(boatHeadingDeg, windDirDeg)

/**
 * Calculate Apparent Wind Angle (AWA) - angle of apparent wind relative to boat heading
 *
 * AWA accounts for boat motion through the air. The apparent wind is the vector sum
 * of the true wind and the negative of the boat's velocity vector.
 *
 * When a boat is moving:
 * - Upwind: AWA is smaller than TWA (wind appears to come from more ahead)
 * - Downwind: AWA is larger than TWA (wind appears to come from more behind)
 * - At rest: AWA equals TWA
 *
 * @param boatHeadingDeg - Boat heading in degrees (0° = North)
 * @param boatSpeedKts - Boat speed in knots
 * @param windDirDeg - True wind direction in degrees (0° = North, direction wind comes FROM)
 * @param windSpeedKts - True wind speed in knots
 * @returns Signed angle: positive = starboard tack, negative = port tack
 */
export const apparentWindAngle = (
  boatHeadingDeg: number,
  boatSpeedKts: number,
  windDirDeg: number,
  windSpeedKts: number,
): number => {
  // If no wind or no boat speed, AWA equals TWA
  if (windSpeedKts <= 0 || boatSpeedKts <= 0) {
    return trueWindAngle(boatHeadingDeg, windDirDeg)
  }

  // Get TWA (signed, negative = port tack, positive = starboard tack)
  const twa = trueWindAngle(boatHeadingDeg, windDirDeg)
  const absTwa = Math.abs(twa)
  const twaRad = degToRad(absTwa)

  // Work in boat-relative coordinates:
  // X-axis = perpendicular to boat (positive to starboard)
  // Y-axis = along boat (positive forward)
  //
  // True wind vector (where it's coming FROM, relative to boat):
  // Points at angle TWA from bow
  const twX = windSpeedKts * Math.sin(twaRad) // lateral component (always positive for abs TWA)
  const twY = windSpeedKts * Math.cos(twaRad) // forward component (positive when upwind)

  // Boat motion creates headwind (comes from directly ahead):
  const headwindY = boatSpeedKts // adds to forward wind component

  // Apparent wind = true wind + headwind from motion
  const awX = twX // lateral unchanged
  const awY = twY + headwindY // forward component increases

  // AWA from boat-relative components
  const awaRad = Math.atan2(awX, awY)
  const awaDeg = radToDeg(awaRad)

  // Preserve the sign (port/starboard)
  return twa >= 0 ? awaDeg : -awaDeg
}

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
  { twa: 0, ratio: 0 }, // Dead into wind - no speed
  { twa: 20, ratio: 0.2 }, // Luffing hard
  { twa: 30, ratio: 0.45 }, // Close-hauled lower limit
  { twa: 45, ratio: 0.65 }, // Typical close-hauled angle
  { twa: 60, ratio: 0.8 }, // Close reach
  { twa: 75, ratio: 0.9 }, // Reaching
  { twa: 90, ratio: 0.95 }, // Beam reach
  { twa: 110, ratio: 1.05 }, // Broad reach - getting fast
  // Downwind shaping:
  // - We want best downwind VMG to be near ~140° (broad reach), not 160-180°.
  // - And we want dead-downwind (180°) to be ~30% slower than the VMG-optimal point.
  { twa: 135, ratio: 1.1 }, // Broad reach (fast)
  { twa: 140, ratio: 1.15 }, // Target VMG-optimal region
  { twa: 150, ratio: 1.0 }, // Getting deeper: slower enough that VMG doesn't keep increasing
  { twa: 160, ratio: 0.9 }, // Deep downwind
  { twa: 170, ratio: 0.75 }, // Very deep downwind
  { twa: 180, ratio: 0.5 }, // Dead downwind (~30% slower than 1.15 peak)
]

/**
 * Look up speed ratio from polar table with linear interpolation
 * @param twa - True wind angle (absolute value used, works for both tacks)
 * @returns Speed ratio: boat speed = wind speed × ratio
 */
const lookupPolarRatio = (twa: number) => {
  const absTwa = clamp(Math.abs(twa), 0, 180)
  for (let i = 0; i < polarTable.length - 1; i += 1) {
    const current = polarTable[i]
    const next = polarTable[i + 1]
    if (absTwa >= current.twa && absTwa <= next.twa) {
      const span = next.twa - current.twa || 1
      const t = (absTwa - current.twa) / span
      // Linear interpolation between table points
      return current.ratio + (next.ratio - current.ratio) * t
    }
  }
  return polarTable[polarTable.length - 1].ratio
}

/**
 * Calculate target boat speed based on wind and sail trim
 * @param twaDeg - True wind angle
 * @param windSpeed - Wind speed in knots
 * @param sheet - Sail trim (0 = fully out, 1 = fully in)
 * @returns Target speed in knots
 */
const polarTargetSpeed = (twaDeg: number, windSpeed: number, sheet: number) => {
  const ratio = lookupPolarRatio(twaDeg)
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
    const clamped = headingFromTwa(windDirDeg, sign * NO_GO_ANGLE_DEG)
    boat.desiredHeadingDeg = clamped
    return clamped
  }

  // Too far downwind (by the lee) - prevent sailing past MAX_DOWNWIND_ANGLE_DEG.
  // If MAX_DOWNWIND_ANGLE_DEG is 180, this should effectively never clamp.
  if (absDiff > MAX_DOWNWIND_ANGLE_DEG) {
    const sign = diff >= 0 ? 1 : -1
    const clamped = headingFromTwa(windDirDeg, sign * MAX_DOWNWIND_ANGLE_DEG)
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

  const wake = getEffectiveWakeTuning()
  const windDownwindDeg = normalizeDeg(state.wind.directionDeg + 180)
  const windDownwindVec = dirToUnit(windDownwindDeg)
  const maxSideMult = Math.max(wake.leewardWidthMult, wake.windwardWidthMult)
  const maxHalfWidth = Math.max(wake.widthStart, wake.widthEnd) * maxSideMult
  const maxRadius = wake.length + maxHalfWidth * 2
  const maxRadiusSq = maxRadius * maxRadius
  // Core zone is a fraction of turbulent zone width
  const coreToTurbRatio =
    Math.tan(degToRad(wake.coreHalfAngleDeg)) / Math.tan(degToRad(wake.turbHalfAngleDeg))
  const leewardSideByBoatId: Record<string, 1 | -1> = {}

  const widthAt = (alongNorm: number, sideMult: number) => {
    const baseWidth =
      wake.widthEnd +
      (wake.widthStart - wake.widthEnd) * Math.pow(1 - alongNorm, wake.widthCurve)
    return baseWidth * sideMult
  }

  boats.forEach((boat) => {
    factors[boat.id] = boat.wakeFactor ?? 1
    const twa = angleDiff(boat.headingDeg, state.wind.directionDeg)
    const headingVec = dirToUnit(boat.headingDeg)
    const leewardVec =
      twa >= 0
        ? { x: -headingVec.y, y: headingVec.x }
        : { x: headingVec.y, y: -headingVec.x }
    const leewardCross =
      windDownwindVec.x * leewardVec.y - windDownwindVec.y * leewardVec.x
    // Flip sign to put shadow on correct (leeward) side
    leewardSideByBoatId[boat.id] = leewardCross >= 0 ? -1 : 1
  })

  for (let ti = 0; ti < boats.length; ti += 1) {
    const target = boats[ti]
    let slowdown = 0

    for (let si = 0; si < boats.length; si += 1) {
      if (si === ti) continue
      const source = boats[si]
      // Wake direction: TWA (true wind) or AWA (apparent wind) based on env setting
      let downwindVec = windDownwindVec
      if (appEnv.wakeUseAwa) {
        const localWindSpeed = sampleWindSpeed(state, source.pos)
        const awa = apparentWindAngle(
          source.headingDeg,
          source.speed,
          state.wind.directionDeg,
          localWindSpeed,
        )
        downwindVec = rotateVec(windDownwindVec, awa)
      }
      const crossVec = { x: -downwindVec.y, y: downwindVec.x }
      const sourceX = source.pos.x
      const sourceY = source.pos.y
      const dx = target.pos.x - sourceX
      const dy = target.pos.y - sourceY
      const distSq = dx * dx + dy * dy
      if (distSq > maxRadiusSq) continue
      if (distSq === 0) continue

      const dist = Math.sqrt(distSq)
      const relUnitX = dx / dist
      const relUnitY = dy / dist
      const align = relUnitX * downwindVec.x + relUnitY * downwindVec.y
      if (align <= 0) continue

      const along = dist * align
      if (along <= 0 || along > wake.length) continue

      const cross = dx * crossVec.x + dy * crossVec.y
      const alongNorm = along / wake.length
      const sideSign: 1 | -1 = cross >= 0 ? 1 : -1
      const isLeewardSide = sideSign === leewardSideByBoatId[source.id]
      const sideMult = isLeewardSide ? wake.leewardWidthMult : wake.windwardWidthMult
      const turbHalfWidth = widthAt(alongNorm, sideMult)
      const coreHalfWidth = turbHalfWidth * coreToTurbRatio
      const lateral = Math.abs(cross)

      // Feather zone extends 32% beyond the nominal width (matching visual rendering)
      const featherWidth = turbHalfWidth * 1.32
      if (lateral > featherWidth) continue

      // Linear falloff from center to feather edge
      const turbLateral = Math.max(0, 1 - lateral / featherWidth)
      const coreLateral = lateral <= coreHalfWidth ? Math.max(0, 1 - lateral / coreHalfWidth) : 0

      // Constant strength along the wake length (no along-axis falloff)
      const coreContribution = wake.coreMaxSlowdown * wake.coreStrength * coreLateral
      const turbContribution = wake.turbMaxSlowdown * wake.turbStrength * turbLateral
      const contribution = coreContribution + turbContribution
      if (contribution <= 0) continue
      slowdown = Math.min(wake.maxSlowdown, slowdown + contribution)
    }

    const wakeFactor = clamp(1 - slowdown, 1 - wake.maxSlowdown, 1)
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
export const stepRaceState = (
  state: RaceState,
  inputs: InputMap,
  dt: number,
  collisionOutcome?: CollisionOutcome,
) => {
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
      const absTwa = Math.abs(headingDiff)

      // Compute optimal VMG angles for current wind speed
      const vmgAngles = computeVmgAngles(state.wind.speed)

      // Choose upwind or downwind angle based on which side of beam reach we're on
      const isUpwind = absTwa <= 90
      const targetTwa = isUpwind ? vmgAngles.upwindTwa : vmgAngles.downwindTwa
      const calculatedHeading = headingFromTwa(
        state.wind.directionDeg,
        tackSign * targetTwa,
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

    // Calculate TWA (True Wind Angle)
    const twa = trueWindAngle(boat.headingDeg, state.wind.directionDeg)
    const wakeFactor = wakeFactors[boat.id] ?? 1
    boat.wakeFactor = wakeFactor

    const localWindSpeed = sampleWindSpeed(state, boat.pos)
    let targetSpeed =
      polarTargetSpeed(twa, localWindSpeed, DEFAULT_SHEET) * appEnv.speedMultiplier

    // Slow-down / depower handling:
    // - Blowing sails (held control) allows reversing down to -0.2 kts.
    // - Near the maximum upwind angle (NO_GO boundary), speed should be ~10% of TWS
    //   (this keeps "parking" and prestart control consistent and avoids being too fast at max upwind).
    const absTwa = Math.abs(twa)
    const slowCap = localWindSpeed * 0.1 * appEnv.speedMultiplier
    const reverseSpeedKts = MAX_REVERSE_SPEED_KTS * appEnv.speedMultiplier
    const nearMaxUpwind = absTwa <= NO_GO_ANGLE_DEG + 1
    if (boat.blowSails) {
      targetSpeed = Math.min(targetSpeed, reverseSpeedKts)
    } else if (boat.stallTimer > 0 || nearMaxUpwind) {
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

    const fault = collisionOutcome?.faults[boat.id]
    const hasBoatCollision = collisionOutcome?.collidedBoatIds.has(boat.id)
    if (fault === 'at_fault' && hasBoatCollision) {
      boat.speed *= COLLISION_SLOWDOWN_AT_FAULT
    }

    // Update position based on heading and speed
    // Coordinate system: +X = East, +Y = South (y inverted because North is "up" on screen)
    const courseRad = degToRad(boat.headingDeg)
    const speedMs = boat.speed * KNOTS_TO_MS
    boat.prevPos = boat.prevPos ?? { x: boat.pos.x, y: boat.pos.y }
    boat.prevPos.x = boat.pos.x
    boat.prevPos.y = boat.pos.y
    boat.pos.x += Math.sin(courseRad) * speedMs * dt
    boat.pos.y -= Math.cos(courseRad) * speedMs * dt // Negative because North is up

    if (boat.speed <= LEEWARD_DRIFT_THRESHOLD_KTS) {
      const headingVec = dirToUnit(boat.headingDeg)
      const leewardVec =
        twa >= 0
          ? { x: -headingVec.y, y: headingVec.x }
          : { x: headingVec.y, y: -headingVec.x }
      const driftMs = LEEWARD_DRIFT_SPEED_KTS * KNOTS_TO_MS * appEnv.speedMultiplier
      boat.pos.x += leewardVec.x * driftMs * dt
      boat.pos.y += leewardVec.y * driftMs * dt
    }
  })

  const { correctedPositions } = resolveBoatMarkCollisions(state)
  correctedPositions.forEach((pos, boatId) => {
    const boat = state.boats[boatId]
    if (!boat) return
    boat.pos.x = pos.x
    boat.pos.y = pos.y
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
    upwindTwa: bestUpAngle, // Typically ~45° (close-hauled)
    downwindTwa: bestDownAngle, // Typically ~135° (broad reach, NOT running!)
  }
}

/**
 * Calculate signed True Wind Angle (TWA)
 * @returns Signed angle: positive = starboard tack, negative = port tack
 */
export const trueWindAngleSigned = trueWindAngle
