import type { BoatState, RaceState, RuleId } from '@/types/race'
import { PORT_STARBOARD_DISTANCE } from './constants'
import { createId } from '@/utils/ids'
import type { RaceEvent } from '@/types/race'

export type RuleResolution = {
  ruleId: RuleId
  boats: string[]
  offenderId: string
  message: string
}

const clampAngle180 = (deg: number) => {
  let d = deg % 360
  if (d > 180) d -= 360
  if (d <= -180) d += 360
  return d
}

const degToRad = (deg: number) => (deg * Math.PI) / 180

const distance = (a: BoatState, b: BoatState) => {
  const dx = a.pos.x - b.pos.x
  const dy = a.pos.y - b.pos.y
  return Math.hypot(dx, dy)
}

type Tack = 'port' | 'starboard'

const getTack = (boat: BoatState, windDir: number): Tack => {
  const relative = clampAngle180(boat.headingDeg - windDir)
  return relative >= 0 ? 'port' : 'starboard'
}

const boatPairKey = (rule: RuleId, a: string, b: string) =>
  `${rule}:${[a, b].sort().join(':')}`

const isRightsSuspended = (boat: BoatState) => Boolean(boat.rightsSuspended)

export class RulesEngine {
  private pairCooldowns = new Map<string, number>()
  private offenderCooldowns = new Map<string, number>()

  constructor(private cooldownSeconds = 5) {}

  evaluate(state: RaceState): RuleResolution[] {
    const boats = Object.values(state.boats)
    const results: RaceResolution[] = []
    const phase = state.phase
    for (let i = 0; i < boats.length; i += 1) {
      for (let j = i + 1; j < boats.length; j += 1) {
        const a = boats[i]
        const b = boats[j]
        const pairs = [
          ...this.checkRule10(state, a, b),
          ...this.checkRule11(state, a, b),
        ]
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

  private checkRule10(
    state: RaceState,
    a: BoatState,
    b: BoatState,
  ): RuleResolution[] {
    const distanceApart = distance(a, b)
    if (distanceApart > PORT_STARBOARD_DISTANCE) return []

    const tackA = getTack(a, state.wind.directionDeg)
    const tackB = getTack(b, state.wind.directionDeg)
    if (tackA === tackB) return []

    const offender = tackA === 'port' ? a : b
    const standOn = offender === a ? b : a
    if (isRightsSuspended(standOn) && !isRightsSuspended(offender)) {
      return []
    }
    return this.recordOnce(state, '10', offender.id, standOn.id, {
      ruleId: '10',
      offenderId: offender.id,
      boats: [offender.id, standOn.id],
      message: `${offender.name} on port tack must keep clear of ${standOn.name}`,
    })
  }

  private checkRule11(
    state: RaceState,
    a: BoatState,
    b: BoatState,
  ): RuleResolution[] {
    const distanceApart = distance(a, b)
    if (distanceApart > PORT_STARBOARD_DISTANCE) return []
    const tackA = getTack(a, state.wind.directionDeg)
    const tackB = getTack(b, state.wind.directionDeg)
    if (tackA !== tackB) return []

    const perpAngle = degToRad(state.wind.directionDeg + 90)
    const lineNormal = {
      x: Math.cos(perpAngle),
      y: Math.sin(perpAngle),
    }
    const project = (boat: BoatState) => boat.pos.x * lineNormal.x + boat.pos.y * lineNormal.y

    const aScore = project(a)
    const bScore = project(b)
    const windward = aScore < bScore ? a : b
    const leeward = windward === a ? b : a
    if (isRightsSuspended(leeward) && !isRightsSuspended(windward)) {
      return []
    }

    return this.recordOnce(state, '11', windward.id, leeward.id, {
      ruleId: '11',
      offenderId: windward.id,
      boats: [windward.id, leeward.id],
      message: `${windward.name} (windward) must keep clear of ${leeward.name}`,
    })
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
    return [resolution]
  }
}

type RaceResolution = RuleResolution

