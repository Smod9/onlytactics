import { stepRaceState, clamp as physicsClamp } from '@/logic/physics'
import { RulesEngine, type RuleResolution } from '@/logic/rules'
import { cloneRaceState } from '@/state/factories'
import { raceStore, RaceStore } from '@/state/raceStore'
import type { BoatState, RaceEvent, RaceState } from '@/types/race'
import { createSeededRandom } from '@/utils/rng'
import { appEnv } from '@/config/env'
import { createId } from '@/utils/ids'
import { identity } from '@/net/identity'

type HostLoopOptions = {
  onEvents?: (events: RaceEvent[]) => void
  onTick?: (state: RaceState, events: RaceEvent[]) => void
}

export class HostLoop {
  private timer?: ReturnType<typeof setInterval>

  private lastTick = 0

  constructor(
    private store: RaceStore = raceStore,
    private rules = new RulesEngine(appEnv.penaltyCooldownSeconds),
    private tickRate = appEnv.tickRateHz,
    private options: HostLoopOptions = {},
  ) {
    const initialState = this.store.getState()
    this.windRandom = createSeededRandom(initialState.meta.seed)
    this.windSpeedTarget = initialState.wind.speed
    this.raceStartWallClockMs = initialState.clockStartMs
  }

  private windTimer = 0
  private windShift = 0
  private windTargetShift = 0
  private windSpeedTarget = 12

  private windRandom

  private startSignalSent = false

  private ocsBoats = new Set<string>()

  private courseSideSign?: number
  private penaltyHistory = new Map<string, number>()
  private raceStartWallClockMs: number | null = null

  start() {
    if (this.timer) return
    this.lastTick = performance.now()
    const intervalMs = 1000 / this.tickRate
    this.timer = setInterval(() => this.tick(), intervalMs)
  }

  stop() {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = undefined
  }

  reset(state: RaceState) {
    this.windRandom = createSeededRandom(state.meta.seed)
    this.windSpeedTarget = state.wind.speed
    this.windTimer = 0
    this.windShift = 0
    this.windTargetShift = 0
    this.startSignalSent = false
    this.ocsBoats.clear()
    this.courseSideSign = undefined
    this.penaltyHistory.clear()
    this.raceStartWallClockMs = state.clockStartMs
  }

  isRunning = () => Boolean(this.timer)

  private tick() {
    const now = performance.now()
    const rawDt = (now - this.lastTick) / 1000
    const dt = Math.min(rawDt, 0.25)
    this.lastTick = now

    const next = cloneRaceState(this.store.getState())
    const inputs = this.store.consumeInputs()
    const countdownHeld = next.phase === 'prestart' && !next.countdownArmed
    if (!countdownHeld) {
      stepRaceState(next, inputs, dt)
    } else if (next.phase === 'prestart' && !next.countdownArmed) {
      next.t = -appEnv.countdownSeconds
    }
    if (next.phase === 'running' && !this.raceStartWallClockMs) {
      this.raceStartWallClockMs = Date.now() - next.t * 1000
    }
    const appliedAt = Date.now()
    Object.entries(inputs).forEach(([boatId, input]) => {
      const seq = input.seq
      if (typeof seq !== 'number') return
      const boat = next.boats[boatId]
      if (!boat) return
      boat.lastInputSeq = seq
      boat.lastInputAppliedAt = appliedAt
    })
    this.applyWindOscillation(next, dt)
    if (next.clockStartMs) {
      next.t = (Date.now() - next.clockStartMs) / 1000
    }
    this.checkRaceTimeout(next)
    this.updateLapProgress(next)

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
    if (appEnv.fixedWind) {
      state.wind.directionDeg = state.baselineWindDeg
      return
    }

    const cycleSeconds = 18
    const settleSeconds = 5
    const shiftRange = 12
    const speedMin = 8
    const speedMax = 16

    this.windTimer += dt
    if (this.windTimer >= cycleSeconds) {
      this.windTimer = 0
      const randomShift = (this.windRandom() - 0.5) * 2 * shiftRange
      this.windTargetShift = physicsClamp(randomShift, -shiftRange, shiftRange)
      const speedDelta = (this.windRandom() - 0.5) * 2
      this.windSpeedTarget = physicsClamp(
        this.windSpeedTarget + speedDelta,
        speedMin,
        speedMax,
      )
    }

    const lerpFactor = Math.min(1, dt / settleSeconds)
    this.windShift += (this.windTargetShift - this.windShift) * lerpFactor
    state.wind.directionDeg = state.baselineWindDeg + this.windShift
    state.wind.speed += (this.windSpeedTarget - state.wind.speed) * lerpFactor
  }

  private updateLapProgress(state: RaceState) {
    const marks = state.marks
    const markCount = marks.length
    if (!markCount) return

    const lapTarget = Math.max(1, state.lapsToFinish || 1)
    Object.values(state.boats).forEach((boat) => {
      if (boat.nextMarkIndex === undefined) boat.nextMarkIndex = 0
      if (boat.lap === undefined) boat.lap = 0
      if (boat.finished) {
        boat.distanceToNextMark = 0
        boat.inMarkZone = false
        return
      }

    const nextMark = marks[boat.nextMarkIndex % markCount]
    if (!nextMark) return

    const crossed = this.didCrossMarkLine(boat, nextMark, state)
    boat.distanceToNextMark = this.distanceToLine(boat, nextMark)

    if (crossed) {
      boat.nextMarkIndex = (boat.nextMarkIndex + 1) % markCount
      if (boat.nextMarkIndex === 0) {
        boat.lap += 1
        if (boat.lap >= lapTarget) {
          boat.finished = true
          boat.finishTime = state.t
          boat.distanceToNextMark = 0
        }
      }
    }
    })

    const boats = Object.values(state.boats)
    boats.sort((a, b) => this.compareLeaderboard(a, b))
    state.leaderboard = boats.map((boat) => boat.id)
  }

  private compareLeaderboard(a: BoatState, b: BoatState) {
    if (a.finished && b.finished) {
      if ((a.finishTime ?? Infinity) !== (b.finishTime ?? Infinity)) {
        return (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity)
      }
    } else if (a.finished !== b.finished) {
      return a.finished ? -1 : 1
    }

    const aPenalty = a.penalties > 0 || a.overEarly
    const bPenalty = b.penalties > 0 || b.overEarly
    if (aPenalty !== bPenalty) {
      return aPenalty ? 1 : -1
    }

    if (b.lap !== a.lap) {
      return b.lap - a.lap
    }

    if (b.nextMarkIndex !== a.nextMarkIndex) {
      return b.nextMarkIndex - a.nextMarkIndex
    }

    return (a.distanceToNextMark ?? Infinity) - (b.distanceToNextMark ?? Infinity)
  }

  private didCrossMarkLine(boat: BoatState, mark: BoatState['pos'], state: RaceState) {
    if (state.marks[0] === mark) {
      return this.crossedHorizontalLine(boat, mark.y, 1)
    }
    const gate = this.getGateCenter(state)
    if (gate && Math.abs(gate.y - mark.y) < 1) {
      return this.crossedHorizontalLine(boat, gate.y, -1)
    }
    return this.distanceToLine(boat, mark) <= 30
  }

  private crossedHorizontalLine(boat: BoatState, lineY: number, direction: 1 | -1) {
    const prevY = boat.pos.y - boat.speed
    const currentY = boat.pos.y
    if (direction === 1) {
      return prevY < lineY && currentY >= lineY
    }
    return prevY > lineY && currentY <= lineY
  }

  private getGateCenter(state: RaceState) {
    const { left, right } = state.leewardGate
    return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 }
  }

  private distanceToLine(boat: BoatState, point: { x: number; y: number }) {
    return Math.abs(boat.pos.y - point.y)
  }

  private updateStartLine(state: RaceState): RaceEvent[] {
    const events: RaceEvent[] = []
    state.hostId = state.hostId ?? identity.clientId
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

        if (boat.overEarly && !onCourseSide) {
          boat.overEarly = false
          this.ocsBoats.delete(boat.id)
          events.push({
            eventId: createId('event'),
            kind: 'rule_hint',
            t: state.t,
            message: `${boat.name} cleared OCS`,
            boats: [boat.id],
            ruleId: '29',
          })
        }

        if (beforeStart && onCourseSide) {
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

  private checkRaceTimeout(state: RaceState) {
    if (state.phase !== 'running') return
    if (!this.raceStartWallClockMs) return
    const elapsedMs = Date.now() - this.raceStartWallClockMs
    const timeoutMs = appEnv.raceTimeoutMinutes * 60_000
    if (elapsedMs < timeoutMs) return

    state.phase = 'finished'
    const event: RaceEvent = {
      eventId: createId('event'),
      t: state.t,
      kind: 'finish',
      message: 'Race ended: time limit reached',
    }
    this.options.onEvents?.([event])
    this.timer && clearInterval(this.timer)
    this.timer = undefined
  }
}

