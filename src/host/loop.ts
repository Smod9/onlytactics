import { stepRaceState, clamp as physicsClamp } from '@/logic/physics'
import { RulesEngine, type RuleResolution } from '@/logic/rules'
import { cloneRaceState } from '@/state/factories'
import { raceStore, RaceStore } from '@/state/raceStore'
import type { RaceEvent, RaceState } from '@/types/race'
import { createSeededRandom } from '@/utils/rng'
import { appEnv } from '@/config/env'
import { createId } from '@/utils/ids'

type HostLoopOptions = {
  onEvents?: (events: RaceEvent[]) => void
  onTick?: (state: RaceState, events: RaceEvent[]) => void
}

export class HostLoop {
  private timer?: number

  private lastTick = 0

  constructor(
    private store: RaceStore = raceStore,
    private rules = new RulesEngine(),
    private tickRate = appEnv.tickRateHz,
    private options: HostLoopOptions = {},
  ) {
    this.windRandom = createSeededRandom(this.store.getState().meta.seed)
  }

  private windTimer = 0
  private pendingWindShift = 0

  private windRandom

  private startSignalSent = false

  private ocsBoats = new Set<string>()

  private courseSideSign?: number
  private penaltyHistory = new Map<string, number>()

  start() {
    if (this.timer) return
    this.lastTick = performance.now()
    const intervalMs = 1000 / this.tickRate
    this.timer = window.setInterval(() => this.tick(), intervalMs)
  }

  stop() {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = undefined
  }

  isRunning = () => Boolean(this.timer)

  private tick() {
    const now = performance.now()
    const dt = (now - this.lastTick) / 1000
    this.lastTick = now

    const next = cloneRaceState(this.store.getState())
    const inputs = this.store.consumeInputs()
    const countdownHeld = next.phase === 'prestart' && !next.countdownArmed
    if (!countdownHeld) {
      stepRaceState(next, inputs, dt)
    } else if (next.phase === 'prestart' && !next.countdownArmed) {
      next.t = -30
    }
    this.applyWindOscillation(next, dt)

    const startEvents = this.updateStartLine(next)
    const rawResolutions = this.rules.evaluate(next)
    const resolutions = this.filterPenalties(rawResolutions, next.t)
    resolutions.forEach((violation) => {
      const offender = next.boats[violation.offenderId]
      if (offender) offender.penalties += 1
    })
    const events = [...startEvents, ...this.rules.toEvents(next, resolutions)]

    Object.values(next.boats).forEach((boat) => {
      boat.fouled = false
    })
    resolutions.forEach((violation) => {
      violation.boats.forEach((boatId) => {
        const boat = next.boats[boatId]
        if (boat) boat.fouled = violation.offenderId === boatId
      })
    })

    this.store.setState(next)
    this.store.appendEvents(events)
    this.options.onEvents?.(events)
    this.options.onTick?.(next, events)
  }

  private applyWindOscillation(state: RaceState, dt: number) {
    const cycleSeconds = appEnv.fixedWind ? Infinity : 10
    this.windTimer += dt
    if (this.windTimer < cycleSeconds) {
      state.wind.directionDeg = state.baselineWindDeg + this.pendingWindShift
      return
    }
    this.windTimer = 0

    const shiftDeg = (this.windRandom() - 0.5) * 6 // +/-3 degrees
    const speedShift = (this.windRandom() - 0.5) * 0.4
    this.pendingWindShift = physicsClamp(
      this.pendingWindShift + shiftDeg,
      -12,
      12,
    )
    state.wind.directionDeg = state.baselineWindDeg + this.pendingWindShift
    state.wind.speed = Math.max(6, Math.min(16, state.wind.speed + speedShift))
  }

  private updateStartLine(state: RaceState): RaceEvent[] {
    const events: RaceEvent[] = []
    const { committee, pin } = state.startLine
    const lineVec = {
      x: pin.x - committee.x,
      y: pin.y - committee.y,
    }
    if (!this.courseSideSign) {
      const windRad = (state.baselineWindDeg * Math.PI) / 180
      const windVec = {
        x: Math.sin(windRad),
        y: -Math.cos(windRad),
      }
      const cross = lineVec.x * windVec.y - lineVec.y * windVec.x
      this.courseSideSign = cross >= 0 ? 1 : -1
    }

    const beforeStart = state.t < 0

    if (state.boats) {
      Object.values(state.boats).forEach((boat) => {
        const rel = {
          x: boat.pos.x - committee.x,
          y: boat.pos.y - committee.y,
        }
        const cross = lineVec.x * rel.y - lineVec.y * rel.x
        const onCourseSide = cross * (this.courseSideSign ?? 1) > 0

        if (beforeStart) {
          if (onCourseSide) {
            if (!boat.overEarly) {
              boat.overEarly = true
              this.ocsBoats.add(boat.id)
              events.push({
                eventId: createId('event'),
                kind: 'penalty',
                t: state.t,
                message: `${boat.name} OCS - return below the line`,
                boats: [boat.id],
                ruleId: '29',
              })
            }
          } else if (boat.overEarly) {
            boat.overEarly = false
          }
        }
      })
    }

    if (!beforeStart && !this.startSignalSent) {
      this.startSignalSent = true
      if (this.ocsBoats.size === 0) {
        events.push({
          eventId: createId('event'),
          kind: 'start_signal',
          t: state.t,
          message: 'Start! All clear.',
        })
      } else {
        events.push({
          eventId: createId('event'),
          kind: 'general_recall',
          t: state.t,
          message: `Start: ${this.ocsBoats.size} boat(s) OCS`,
          boats: Array.from(this.ocsBoats),
        })
      }
      this.ocsBoats.clear()
    }

    return events
  }

  private filterPenalties(resolutions: RuleResolution[], currentTime: number) {
    return resolutions.filter((violation) => {
      const key = `${violation.offenderId}:${violation.ruleId}`
      const last = this.penaltyHistory.get(key)
      if (last !== undefined && currentTime - last < 10) {
        return false
      }
      this.penaltyHistory.set(key, currentTime)
      return true
    })
  }
}

