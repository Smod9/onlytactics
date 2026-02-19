import type { BoatState, RaceState, RuleId } from '@/types/race'
import { boatCapsuleCircles, headingForward } from '@/logic/boatGeometry'
import { createId } from '@/utils/ids'
import type { RaceEvent } from '@/types/race'

export type RuleResolution = {
  ruleId: RuleId
  boats: string[]
  offenderId: string
  message: string
}

export type CollisionFault = 'at_fault' | 'stand_on'

export type CollisionOutcome = {
  faults: Record<string, CollisionFault>
  collidedBoatIds: Set<string>
}

export const clampAngle180 = (deg: number) => {
  let d = deg % 360
  if (d > 180) d -= 360
  if (d <= -180) d += 360
  return d
}

const degToRad = (deg: number) => (deg * Math.PI) / 180

type Circle = { x: number; y: number; r: number }

const boatCircles = (boat: BoatState): Circle[] => boatCapsuleCircles(boat)

const boatEnds = (boat: BoatState) => {
  const [bow, stern] = boatCapsuleCircles(boat)
  return { bow, stern }
}

export const circlesOverlap = (a: Circle, b: Circle) => {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const rr = a.r + b.r
  return dx * dx + dy * dy <= rr * rr
}

export const isBehind = (target: BoatState, other: BoatState) => {
  const forward = headingForward(target.headingDeg)
  const dx = other.pos.x - target.pos.x
  const dy = other.pos.y - target.pos.y
  return dx * forward.x + dy * forward.y < 0
}

/**
 * True when `rammer` is in the stern quarter of `target` — more directly
 * behind than off to the side.  Prevents side-by-side (windward/leeward)
 * boats from being misidentified as stern rammers just because one boat's
 * center is past 90° of the other's heading.
 */
const isApproachingFromAstern = (target: BoatState, rammer: BoatState) => {
  const fwd = headingForward(target.headingDeg)
  const dx = rammer.pos.x - target.pos.x
  const dy = rammer.pos.y - target.pos.y
  const along = dx * fwd.x + dy * fwd.y
  const across = Math.abs(-dx * fwd.y + dy * fwd.x)
  return along < 0 && Math.abs(along) > across
}

export const sternRammer = (a: BoatState, b: BoatState) => {
  const aEnds = boatEnds(a)
  const bEnds = boatEnds(b)
  const aHitsB =
    circlesOverlap(aEnds.bow, bEnds.stern) &&
    isBehind(b, a) &&
    isApproachingFromAstern(b, a)
  const bHitsA =
    circlesOverlap(bEnds.bow, aEnds.stern) &&
    isBehind(a, b) &&
    isApproachingFromAstern(a, b)
  if (aHitsB && !bHitsA) return a
  if (bHitsA && !aHitsB) return b
  return null
}

export const boatsTooClose = (a: BoatState, b: BoatState) => {
  const ca = boatCircles(a)
  const cb = boatCircles(b)
  for (const c1 of ca) {
    for (const c2 of cb) {
      if (circlesOverlap(c1, c2)) return true
    }
  }
  return false
}

export const WARNING_RADIUS_RULE10 = 4.0
export const WARNING_RADIUS_RULE11 = 1.6

/**
 * True when the gap between two boats is shrinking — i.e. they are on a
 * converging course.  Uses velocity vectors derived from heading + speed.
 */
const boatsClosing = (a: BoatState, b: BoatState): boolean => {
  const radA = degToRad(a.headingDeg)
  const radB = degToRad(b.headingDeg)
  const vax = Math.sin(radA) * a.speed
  const vay = -Math.cos(radA) * a.speed
  const vbx = Math.sin(radB) * b.speed
  const vby = -Math.cos(radB) * b.speed

  const dx = a.pos.x - b.pos.x
  const dy = a.pos.y - b.pos.y
  const dvx = vax - vbx
  const dvy = vay - vby

  // Dot product of relative position and relative velocity.
  // Negative means the distance is decreasing.
  return dx * dvx + dy * dvy < 0
}

export const boatsNearby = (a: BoatState, b: BoatState, scale = WARNING_RADIUS_RULE10) => {
  const ca = boatCircles(a)
  const cb = boatCircles(b)
  for (const c1 of ca) {
    for (const c2 of cb) {
      const dx = c1.x - c2.x
      const dy = c1.y - c2.y
      const rr = (c1.r + c2.r) * scale
      if (dx * dx + dy * dy <= rr * rr) return true
    }
  }
  return false
}

export type Tack = 'port' | 'starboard'

/**
 * TWA threshold beyond which boats are considered "deep downwind".
 * When both boats exceed this, they are treated as same-tack to avoid
 * unstable tack-flipping near dead downwind (TWA ~180).
 */
export const DOWNWIND_DEAD_ZONE_DEG = 165

export const getTack = (boat: BoatState, windDir: number): Tack => {
  const relative = clampAngle180(boat.headingDeg - windDir)
  return relative >= 0 ? 'port' : 'starboard'
}

const isDeepDownwind = (boat: BoatState, windDir: number): boolean => {
  const relative = clampAngle180(boat.headingDeg - windDir)
  return Math.abs(relative) >= DOWNWIND_DEAD_ZONE_DEG
}

const boatPairKey = (rule: RuleId, a: string, b: string) =>
  `${rule}:${[a, b].sort().join(':')}`

const isRightsSuspended = (boat: BoatState) => Boolean(boat.rightsSuspended)

const incidentPairKey = (a: string, b: string) => [a, b].sort().join(':')

type IncidentState = { expiry: number; separated: boolean }

export class RulesEngine {
  private pairCooldowns = new Map<string, number>()
  private offenderCooldowns = new Map<string, number>()
  /**
   * Mutual incident cooldown between two boats, regardless of rule or who
   * was at fault.  After any penalty fires between A and B, ALL further
   * penalties between them are suppressed until:
   *   1. The boats have physically separated (no circle overlap), AND
   *   2. The minimum cooldown time has elapsed.
   * This prevents cascading penalties when the penalised boat manoeuvres
   * to escape (e.g. tacking away) and its stern swings into the other boat.
   */
  private incidentCooldowns = new Map<string, IncidentState>()

  constructor(private cooldownSeconds = 5) {}

  evaluate(state: RaceState): RuleResolution[] {
    const boats = Object.values(state.boats)
    const results: RaceResolution[] = []
    const phase = state.phase
    for (let i = 0; i < boats.length; i += 1) {
      for (let j = i + 1; j < boats.length; j += 1) {
        const a = boats[i]
        const b = boats[j]

        const ipk = incidentPairKey(a.id, b.id)
        const incident = this.incidentCooldowns.get(ipk)
        if (incident) {
          if (!incident.separated) {
            incident.separated = !boatsTooClose(a, b)
          }
          if (!incident.separated || state.t < incident.expiry) {
            continue
          }
          this.incidentCooldowns.delete(ipk)
        }

        const pairs = [...this.checkRule10(state, a, b), ...this.checkRule11(state, a, b)]
        if (pairs.length && state.t < 0) {
          console.debug('[rules] prestart violation', {
            phase,
            t: state.t,
            rules: pairs.map((p) => p.ruleId),
            boats: pairs.map((p) => p.boats),
          })
        }
        results.push(...pairs)
      }
    }
    return results
  }

  /**
   * Detect boats that are about to collide and identify who would be at fault.
   * Port/starboard (Rule 10) uses a larger warning radius because closing
   * speeds are roughly double those of same-tack situations.
   */
  computeWarnings(state: RaceState): Map<string, string> {
    const boats = Object.values(state.boats)
    const warnings = new Map<string, string>()
    for (let i = 0; i < boats.length; i += 1) {
      for (let j = i + 1; j < boats.length; j += 1) {
        const a = boats[i]
        const b = boats[j]

        const ipk = incidentPairKey(a.id, b.id)
        if (this.incidentCooldowns.has(ipk)) continue
        if (boatsTooClose(a, b)) continue

        // Try Rule 10 first with the larger radius (opposite tacks converge fast).
        // Skip if boats are diverging — no collision risk (e.g. ducking behind).
        if (boatsNearby(a, b, WARNING_RADIUS_RULE10) && boatsClosing(a, b)) {
          const r10 = this.warningRule10(state, a, b)
          if (r10 && !warnings.has(r10.offender.id)) {
            warnings.set(r10.offender.id, r10.message)
            continue
          }
        }

        // Rule 11 with the tighter radius (same tack, slower closing)
        if (boatsNearby(a, b, WARNING_RADIUS_RULE11)) {
          const r11 = this.warningRule11(state, a, b)
          if (r11 && !warnings.has(r11.offender.id)) {
            warnings.set(r11.offender.id, r11.message)
          }
        }
      }
    }
    return warnings
  }

  computeCollisionFaults(state: RaceState): Record<string, CollisionFault> {
    return this.computeCollisionOutcomes(state).faults
  }

  computeCollisionOutcomes(state: RaceState): CollisionOutcome {
    const boats = Object.values(state.boats)
    const faults: Record<string, CollisionFault> = {}
    const collidedBoatIds = new Set<string>()
    for (let i = 0; i < boats.length; i += 1) {
      for (let j = i + 1; j < boats.length; j += 1) {
        const a = boats[i]
        const b = boats[j]
        if (boatsTooClose(a, b)) {
          collidedBoatIds.add(a.id)
          collidedBoatIds.add(b.id)
        }
        const rule10 = this.rule10Fault(state, a, b)
        const rule11 = rule10 ? null : this.rule11Fault(state, a, b)
        const fault = rule10 ?? rule11
        if (!fault) continue
        const { offender, standOn } = fault
        faults[offender.id] = 'at_fault'
        if (faults[standOn.id] !== 'at_fault') {
          faults[standOn.id] = 'stand_on'
        }
      }
    }
    return { faults, collidedBoatIds }
  }

  toEvents(state: RaceState, resolutions: RaceResolution[]): RaceEvent[] {
    if (!resolutions.length) return []
    return resolutions.map((violation) => ({
      eventId: createId('event'),
      t: state.t,
      kind: 'penalty',
      ruleId: violation.ruleId,
      boats: violation.boats,
      message: violation.message,
    }))
  }

  private checkRule10(state: RaceState, a: BoatState, b: BoatState): RuleResolution[] {
    const fault = this.rule10Fault(state, a, b)
    if (!fault) return []
    const { offender, standOn } = fault
    return this.recordOnce(state, '10', offender.id, standOn.id, {
      ruleId: '10',
      offenderId: offender.id,
      boats: [offender.id, standOn.id],
      message: `PENALTY: ${offender.name} (port) fouled ${standOn.name} (starboard) — Rule 10: port tack must keep clear`,
    })
  }

  private checkRule11(state: RaceState, a: BoatState, b: BoatState): RuleResolution[] {
    const fault = this.rule11Fault(state, a, b)
    if (!fault) return []
    const { offender, standOn, rammer, windward, leeward } = fault

    return this.recordOnce(state, '11', offender.id, standOn.id, {
      ruleId: '11',
      offenderId: offender.id,
      boats: [offender.id, standOn.id],
      message:
        rammer !== null
          ? `PENALTY: ${offender.name} (overtaking from astern) fouled ${standOn.name} — Rule 11: a boat clear astern must keep clear`
          : `PENALTY: ${windward.name} (windward) fouled ${leeward.name} (leeward) — Rule 11: windward boat must keep clear`,
    })
  }

  private rule10Fault(state: RaceState, a: BoatState, b: BoatState) {
    if (!boatsTooClose(a, b)) return null

    const tackA = getTack(a, state.wind.directionDeg)
    const tackB = getTack(b, state.wind.directionDeg)
    if (tackA === tackB) return null

    const bothDeep =
      isDeepDownwind(a, state.wind.directionDeg) &&
      isDeepDownwind(b, state.wind.directionDeg)
    if (bothDeep) return null

    const offender = tackA === 'port' ? a : b
    const standOn = offender === a ? b : a
    if (isRightsSuspended(standOn) && !isRightsSuspended(offender)) {
      return null
    }
    return { offender, standOn }
  }

  private rule11Fault(state: RaceState, a: BoatState, b: BoatState) {
    if (!boatsTooClose(a, b)) return null
    const tackA = getTack(a, state.wind.directionDeg)
    const tackB = getTack(b, state.wind.directionDeg)
    const bothDeep =
      isDeepDownwind(a, state.wind.directionDeg) &&
      isDeepDownwind(b, state.wind.directionDeg)
    if (tackA !== tackB && !bothDeep) return null

    const perpAngle = degToRad(state.wind.directionDeg + 90)
    const lineNormal = {
      x: Math.cos(perpAngle),
      y: Math.sin(perpAngle),
    }
    const project = (boat: BoatState) =>
      boat.pos.x * lineNormal.x + boat.pos.y * lineNormal.y

    const aScore = project(a)
    const bScore = project(b)
    const windward = aScore < bScore ? a : b
    const leeward = windward === a ? b : a

    const rammer = sternRammer(a, b)
    const offender = rammer ?? windward
    const standOn = offender === a ? b : a
    if (isRightsSuspended(standOn) && !isRightsSuspended(offender)) {
      return null
    }
    return { offender, standOn, rammer, windward, leeward }
  }

  private recordOnce(
    state: RaceState,
    ruleId: RuleId,
    offenderId: string,
    otherBoatId: string,
    resolution: RuleResolution,
  ) {
    const pairKey = boatPairKey(ruleId, offenderId, otherBoatId)
    const offenderKey = `${ruleId}:${offenderId}`
    const pairExpiry = this.pairCooldowns.get(pairKey)
    if (pairExpiry !== undefined && pairExpiry > state.t) return []

    const offenderExpiry = this.offenderCooldowns.get(offenderKey)
    if (offenderExpiry !== undefined && offenderExpiry > state.t) return []

    this.pairCooldowns.set(pairKey, state.t + this.cooldownSeconds)
    this.offenderCooldowns.set(offenderKey, state.t + this.cooldownSeconds)

    const ipk = incidentPairKey(offenderId, otherBoatId)
    this.incidentCooldowns.set(ipk, {
      expiry: state.t + this.cooldownSeconds,
      separated: false,
    })

    return [resolution]
  }

  private warningRule10(state: RaceState, a: BoatState, b: BoatState) {
    const tackA = getTack(a, state.wind.directionDeg)
    const tackB = getTack(b, state.wind.directionDeg)
    if (tackA === tackB) return null

    const bothDeep =
      isDeepDownwind(a, state.wind.directionDeg) &&
      isDeepDownwind(b, state.wind.directionDeg)
    if (bothDeep) return null

    const offender = tackA === 'port' ? a : b
    const standOn = offender === a ? b : a
    if (isRightsSuspended(standOn) && !isRightsSuspended(offender)) return null
    return { offender, message: `Starboard! Keep clear of ${standOn.name}` }
  }

  private warningRule11(state: RaceState, a: BoatState, b: BoatState) {
    const tackA = getTack(a, state.wind.directionDeg)
    const tackB = getTack(b, state.wind.directionDeg)
    const bothDeep =
      isDeepDownwind(a, state.wind.directionDeg) &&
      isDeepDownwind(b, state.wind.directionDeg)
    if (tackA !== tackB && !bothDeep) return null

    const perpAngle = degToRad(state.wind.directionDeg + 90)
    const lineNormal = {
      x: Math.cos(perpAngle),
      y: Math.sin(perpAngle),
    }
    const project = (boat: BoatState) =>
      boat.pos.x * lineNormal.x + boat.pos.y * lineNormal.y

    const aScore = project(a)
    const bScore = project(b)
    const windward = aScore < bScore ? a : b
    const leeward = windward === a ? b : a

    const offender = windward
    const standOn = leeward
    if (isRightsSuspended(standOn) && !isRightsSuspended(offender)) return null
    return { offender, message: `Keep clear! You're windward of ${standOn.name}` }
  }
}

type RaceResolution = RuleResolution
