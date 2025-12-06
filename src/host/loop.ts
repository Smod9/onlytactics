import { stepRaceState, clamp as physicsClamp, normalizeDeg } from '@/logic/physics'
import { RulesEngine, type RuleResolution } from '@/logic/rules'
import { cloneRaceState } from '@/state/factories'
import { raceStore, RaceStore } from '@/state/raceStore'
import type { BoatState, RaceEvent, RaceState } from '@/types/race'
import { createSeededRandom } from '@/utils/rng'
import { appEnv } from '@/config/env'
import { createId } from '@/utils/ids'
import { identity } from '@/net/identity'
import { SPIN_HOLD_SECONDS } from '@/logic/constants'
import { courseLegs, radialSets, gateRadials } from '@/config/course'
import { distanceBetween } from '@/utils/geometry'
import { assignLeaderboard } from '@/logic/leaderboard'

const lapDebug = (...args: unknown[]) => {
  if (!appEnv.debugHud) return
  console.info('[lap-debug]', ...args)
}

const ROUND_MIN_RADIUS = 0
const ROUND_MAX_RADIUS = 500 // Only reset mark selection if very far
type RoundingProgress = {
  legIndex: number
  stage: number
  activeMarkIndex?: number
  /** For gates: which side ('left' or 'right') after crossing gate line */
  gateSide?: 'left' | 'right'
}

type HostLoopOptions = {
  onEvents?: (events: RaceEvent[]) => void
  onTick?: (state: RaceState, events: RaceEvent[]) => void
}

export class HostLoop {
  private timer?: ReturnType<typeof setInterval>

  private lastTick = 0

  private roundingProgress = new Map<string, RoundingProgress>()

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
  private spinTimers = new Map<string, NodeJS.Timeout[]>()
  private spinningBoats = new Set<string>()
  private pendingSpinClears = new Set<string>()
  private spinSeq = 0

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
    this.cancelSpinSequences()
    this.roundingProgress.clear()
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
    this.cancelSpinSequences()
    this.roundingProgress.clear()
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
      if (input.spin === 'full') {
        this.startSpinSequence(boatId)
        delete inputs[boatId]
      }
    })
    this.applyWindOscillation(next, dt)
    if (next.clockStartMs) {
      next.t = (Date.now() - next.clockStartMs) / 1000
    }
    this.checkRaceTimeout(next)
    const lapEvents = this.updateLapProgress(next)

    this.applySpinLocks(next)
    const startEvents = this.updateStartLine(next)
    const rawResolutions = this.rules.evaluate(next)
    const resolutions = this.filterPenalties(rawResolutions, next.t)
    resolutions.forEach((violation) => {
      const offender = next.boats[violation.offenderId]
      if (offender) offender.penalties += 1
    })
    const spinEvents = this.resolveSpinCompletions(next)
    const events = [
      ...startEvents,
      ...this.rules.toEvents(next, resolutions),
      ...spinEvents,
      ...lapEvents,
    ]

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

  private updateLapProgress(state: RaceState): RaceEvent[] {
    const lapEvents: RaceEvent[] = []
    const lapTarget = Math.max(1, state.lapsToFinish || 1)
    Object.values(state.boats).forEach((boat) => {
      if (boat.lap === undefined) boat.lap = 0
      if (boat.finished) {
        boat.distanceToNextMark = 0
        return
      }
      const events = this.advanceBoatLeg(boat, state, lapTarget)
      if (events.length) {
        lapEvents.push(...events)
      }
    })
    assignLeaderboard(state)
    return lapEvents
  }

  private advanceBoatLeg(boat: BoatState, state: RaceState, lapTarget: number) {
    const events: RaceEvent[] = []
    const marks = state.marks
    const legCount = courseLegs.length
    if (!legCount) return events
    const progress = this.getOrCreateProgress(boat.id)
    const currentLeg = courseLegs[progress.legIndex % legCount]
    const currentSequence = currentLeg.sequence

    // Handle GATE legs specially
    if (currentLeg.kind === 'gate' && currentLeg.gateMarkIndices) {
      const gateEvents = this.advanceGateLeg(boat, state, progress, currentLeg, lapTarget)
      events.push(...gateEvents)
      return events
    }
    
    // For non-gate legs, use single mark logic
    const targetIndex = currentLeg.markIndices[0]
    const targetMark = marks[targetIndex]
    if (!targetMark) return events

    boat.nextMarkIndex = targetIndex
    const distance = distanceBetween(boat.pos, targetMark)
    boat.distanceToNextMark = distance
    
    if (appEnv.debugHud && progress.stage === 0 && distance < 100) {
      lapDebug('active_leg', {
        boatId: boat.id,
        targetIndex,
        legId: currentLeg.id,
        rounding: currentLeg.rounding,
        kind: currentLeg.kind,
      })
    }

    if (distance > ROUND_MAX_RADIUS || distance < ROUND_MIN_RADIUS) {
      progress.stage = 0
      return events
    }
    
    // Track rounding using radials
    const { completed, debugEvent } = this.trackRadialCrossings(boat, state, progress, targetMark, currentLeg)
    if (debugEvent) {
      events.push(debugEvent)
    }
    if (completed) {
      this.advanceToNextSequence(boat, state, progress, currentLeg, lapTarget)
    }
    return events
  }

  /**
   * Handle gate legs with two marks.
   * Stage 0: Cross the gate line (line between the two marks)
   * Stage 1+: Track radials for the specific mark they chose
   */
  private advanceGateLeg(
    boat: BoatState,
    state: RaceState,
    progress: RoundingProgress,
    leg: (typeof courseLegs)[number],
    lapTarget: number,
  ): RaceEvent[] {
    const events: RaceEvent[] = []
    const marks = state.marks
    const [leftIdx, rightIdx] = leg.gateMarkIndices!
    const leftMark = marks[leftIdx]
    const rightMark = marks[rightIdx]
    if (!leftMark || !rightMark) return events

    // Calculate gate midpoint and distance to it
    const gateMidpoint = {
      x: (leftMark.x + rightMark.x) / 2,
      y: (leftMark.y + rightMark.y) / 2,
    }
    const distanceToGate = distanceBetween(boat.pos, gateMidpoint)
    
    // Set display target to closest gate mark
    const distToLeft = distanceBetween(boat.pos, leftMark)
    const distToRight = distanceBetween(boat.pos, rightMark)
    boat.nextMarkIndex = distToLeft < distToRight ? leftIdx : rightIdx
    boat.distanceToNextMark = Math.min(distToLeft, distToRight)

    // If too far from gate, don't track
    if (distanceToGate > ROUND_MAX_RADIUS) {
      progress.stage = 0
      progress.gateSide = undefined
      progress.activeMarkIndex = undefined
      return events
    }

    // STAGE 0: Cross the gate line
    if (progress.stage === 0) {
      const crossed = this.checkGateLineCrossing(boat, leftMark, rightMark)
      if (crossed) {
        // Determine which side they went: left of midpoint = left mark, right = right mark
        const side = boat.pos.x < gateMidpoint.x ? 'left' : 'right'
        progress.gateSide = side
        progress.activeMarkIndex = side === 'left' ? leftIdx : rightIdx
        progress.stage = 1
        
        lapDebug('gate_line_crossed', {
          boatId: boat.id,
          side,
          activeMarkIndex: progress.activeMarkIndex,
          boatX: boat.pos.x.toFixed(1),
          midpointX: gateMidpoint.x.toFixed(1),
        })
        
        events.push(this.buildLapDebugEvent(boat, state, {
          leg,
          stage: 1,
          crossed: true,
          distance: boat.distanceToNextMark ?? 0,
          stagesTotal: 3, // gate line + 2 radials
        }))
      }
      return events
    }

    // STAGES 1+: Track radials for the chosen mark
    if (!progress.gateSide || progress.activeMarkIndex === undefined) {
      progress.stage = 0
      return events
    }

    const chosenMark = marks[progress.activeMarkIndex]
    if (!chosenMark) return events

    const radials = gateRadials[progress.gateSide]
    const radialStage = progress.stage - 1 // Subtract 1 because stage 0 was gate line
    const step = radials[radialStage]
    
    if (!step) {
      // All stages complete!
      progress.stage = 0
      progress.gateSide = undefined
      progress.activeMarkIndex = undefined
      this.advanceToNextSequence(boat, state, progress, leg, lapTarget)
      return events
    }

    // Check radial crossing for this stage
    const { crossed, debugInfo } = this.checkRadialCrossing(boat, chosenMark, step)
    
    if (appEnv.debugHud) {
      lapDebug('gate_radial_state', {
        boatId: boat.id,
        gateSide: progress.gateSide,
        stage: progress.stage,
        radialStage,
        stepAxis: step.axis,
        stepDir: step.direction,
        ...debugInfo,
        crossed,
      })
    }

    if (crossed) {
      progress.stage += 1
      const totalStages = 1 + radials.length // gate line + radials
      
      events.push(this.buildLapDebugEvent(boat, state, {
        leg,
        stage: progress.stage,
        crossed: true,
        distance: boat.distanceToNextMark ?? 0,
        stagesTotal: totalStages,
      }))

      // Check if all radials done
      if (radialStage + 1 >= radials.length) {
        progress.stage = 0
        progress.gateSide = undefined
        progress.activeMarkIndex = undefined
        this.advanceToNextSequence(boat, state, progress, leg, lapTarget)
      }
    }

    return events
  }

  /**
   * Check if boat crossed the gate line (horizontal line between the two gate marks)
   */
  private checkGateLineCrossing(
    boat: BoatState,
    leftMark: { x: number; y: number },
    rightMark: { x: number; y: number },
  ): boolean {
    const prevPos = boat.prevPos ?? boat.pos
    
    // Gate line Y is average of the two marks (they might be at slightly different Y)
    const gateLineY = (leftMark.y + rightMark.y) / 2
    const minX = Math.min(leftMark.x, rightMark.x)
    const maxX = Math.max(leftMark.x, rightMark.x)
    
    // Check if boat crossed the gate line Y threshold while between the marks
    const prevY = prevPos.y
    const currY = boat.pos.y
    const crossedY = (prevY < gateLineY && currY >= gateLineY) || (prevY > gateLineY && currY <= gateLineY)
    
    // Must be between the gate marks (with some margin)
    const margin = 20 // Allow some tolerance
    const inGateX = boat.pos.x >= minX - margin && boat.pos.x <= maxX + margin
    
    return crossedY && inGateX
  }

  /**
   * Check if boat crossed a single radial
   */
  private checkRadialCrossing(
    boat: BoatState,
    mark: { x: number; y: number },
    step: { axis: 'x' | 'y'; direction: 1 | -1 },
  ): { crossed: boolean; debugInfo: Record<string, string> } {
    const prevPos = boat.prevPos ?? boat.pos
    
    // The radial extends along step.axis in step.direction from the mark
    // To cross it, check the perpendicular axis
    const perpAxis = step.axis === 'x' ? 'y' : 'x'
    const perpThreshold = perpAxis === 'x' ? mark.x : mark.y
    const sectorAxis = step.axis
    const sectorThreshold = sectorAxis === 'x' ? mark.x : mark.y
    
    const prevPerpValue = prevPos[perpAxis]
    const currPerpValue = boat.pos[perpAxis]
    const currSectorValue = boat.pos[sectorAxis]
    const prevSectorValue = prevPos[sectorAxis]
    
    // Check sector (must be on the correct side of the mark for this radial)
    const currInSector = step.direction === 1
      ? currSectorValue >= sectorThreshold
      : currSectorValue <= sectorThreshold
    const prevInSector = step.direction === 1
      ? prevSectorValue >= sectorThreshold
      : prevSectorValue <= sectorThreshold
    const inSector = currInSector || prevInSector
    
    // Check if crossed perpendicular threshold
    const crossedPerp = (prevPerpValue < perpThreshold && currPerpValue >= perpThreshold) ||
                        (prevPerpValue > perpThreshold && currPerpValue <= perpThreshold)
    
    return {
      crossed: inSector && crossedPerp,
      debugInfo: {
        inSector: String(inSector),
        crossedPerp: String(crossedPerp),
        currSectorValue: currSectorValue.toFixed(1),
        sectorThreshold: sectorThreshold.toFixed(1),
        prevPerpValue: prevPerpValue.toFixed(1),
        currPerpValue: currPerpValue.toFixed(1),
        perpThreshold: perpThreshold.toFixed(1),
      },
    }
  }

  /**
   * Advance to next sequence after completing a leg
   */
  private advanceToNextSequence(
    boat: BoatState,
    state: RaceState,
    progress: RoundingProgress,
    completedLeg: (typeof courseLegs)[number],
    lapTarget: number,
  ) {
    const legCount = courseLegs.length
    const completedSequence = completedLeg.sequence
    const completedMarkIndices = new Set(completedLeg.markIndices)
    
    // Increment lap after completing the gate (kind='gate')
    if (completedLeg.kind === 'gate') {
      boat.lap += 1
      if (boat.lap >= lapTarget) {
        boat.finished = true
        boat.finishTime = state.t
        boat.distanceToNextMark = 0
        return
      }
    }
    
    // Advance past all legs with the completed sequence
    let safety = 0
    do {
      progress.legIndex = (progress.legIndex + 1) % legCount
      safety += 1
      if (safety > legCount) break
    } while (courseLegs[progress.legIndex % legCount].sequence === completedSequence)

    // Check if we wrapped around to a leg that uses the same mark we just completed
    // This happens when going from seq 3 (windward-return) back to seq 1 (windward-entry)
    // Since we're already AT the windward mark, skip seq 1 and go to seq 2 (gate)
    const nextLeg = courseLegs[progress.legIndex % legCount]
    const nextMarkIndices = new Set(nextLeg.markIndices)
    const sameMarkAsBefore = [...completedMarkIndices].some(idx => nextMarkIndices.has(idx))
    
    if (sameMarkAsBefore) {
      lapDebug('skip_same_mark_sequence', {
        boatId: boat.id,
        completedSequence,
        nextSequence: nextLeg.sequence,
        sharedMarks: [...completedMarkIndices].filter(idx => nextMarkIndices.has(idx)),
      })
      
      // Skip to the sequence after this one
      const skipSequence = nextLeg.sequence
      do {
        progress.legIndex = (progress.legIndex + 1) % legCount
        safety += 1
        if (safety > legCount * 2) break
      } while (courseLegs[progress.legIndex % legCount].sequence === skipSequence)
    }

    // Update boat's next mark
    const finalNextLeg = courseLegs[progress.legIndex % legCount]
    const nextMarkIndex = finalNextLeg.markIndices[0]
    boat.nextMarkIndex = nextMarkIndex
    const nextMark = state.marks[nextMarkIndex]
    boat.distanceToNextMark = nextMark ? distanceBetween(boat.pos, nextMark) : 0
    
    lapDebug('advanced_to_sequence', {
      boatId: boat.id,
      newLegIndex: progress.legIndex,
      newSequence: finalNextLeg.sequence,
      newMarkIndex: nextMarkIndex,
      lap: boat.lap,
    })
  }

  private getOrCreateProgress(boatId: string): RoundingProgress {
    let progress = this.roundingProgress.get(boatId)
    if (!progress) {
      progress = {
        legIndex: 0,
        stage: 0,
      }
      this.roundingProgress.set(boatId, progress)
    }
    return progress
  }

  private trackRadialCrossings(
    boat: BoatState,
    state: RaceState,
    progress: RoundingProgress,
    mark: { x: number; y: number },
    leg: (typeof courseLegs)[number],
  ) {
    const kind: 'windward' | 'leeward' = leg.kind === 'leeward' ? 'leeward' : 'windward'
    const rounding: 'port' | 'starboard' = leg.rounding === 'port' ? 'port' : 'starboard'
    const radialTargets = radialSets[kind][rounding]
    const totalStages = radialTargets.length
    const stage = progress.stage
    const step = radialTargets[stage]
    if (!step) {
      return { completed: true, debugEvent: undefined }
    }

    const prevPos = boat.prevPos ?? boat.pos
    
    // The visual radial extends along `step.axis` in `step.direction`.
    // To cross that visual ray, we check the PERPENDICULAR axis threshold,
    // but only when we're in the sector where the ray exists.
    //
    // For axis='x', direction=1 (ray extends east): 
    //   - Ray is at y=mark.y, extending from mark.x to +infinity
    //   - Crossing means: x >= mark.x (in sector) AND path crosses y=mark.y
    //
    // For axis='y', direction=-1 (ray extends north):
    //   - Ray is at x=mark.x, extending from mark.y to -infinity  
    //   - Crossing means: y <= mark.y (in sector) AND path crosses x=mark.x
    
    const perpAxis = step.axis === 'x' ? 'y' : 'x'
    const perpThreshold = perpAxis === 'x' ? mark.x : mark.y
    const sectorAxis = step.axis
    const sectorThreshold = sectorAxis === 'x' ? mark.x : mark.y
    
    const prevPerpValue = prevPos[perpAxis]
    const currPerpValue = boat.pos[perpAxis]
    const prevSectorValue = prevPos[sectorAxis]
    const currSectorValue = boat.pos[sectorAxis]
    
    // Check if we're in the sector where this ray exists (or were in it during the crossing)
    const currInSector = step.direction === 1
      ? currSectorValue >= sectorThreshold
      : currSectorValue <= sectorThreshold
    const prevInSector = step.direction === 1
      ? prevSectorValue >= sectorThreshold
      : prevSectorValue <= sectorThreshold
    const inSector = currInSector || prevInSector
    
    // Check if we crossed the perpendicular threshold (in either direction)
    // The sector check ensures this is a valid crossing of the visual ray
    const crossedPerp = (prevPerpValue < perpThreshold && currPerpValue >= perpThreshold) ||
                        (prevPerpValue > perpThreshold && currPerpValue <= perpThreshold)
    
    const crossed = inSector && crossedPerp

    let finished = false
    let debugEvent: RaceEvent | undefined
    if (crossed) {
      progress.stage += 1
      debugEvent = this.buildLapDebugEvent(boat, state, {
        leg,
        stage: progress.stage,
        crossed,
        distance: boat.distanceToNextMark ?? 0,
        stagesTotal: totalStages,
      })
      if (progress.stage >= totalStages) {
        finished = true
      }
    }

    if (appEnv.debugHud) {
      lapDebug('radial_state', {
        boatId: boat.id,
        legId: leg.id,
        legSequence: leg.sequence,
        rounding,
        kind,
        markX: mark.x.toFixed(1),
        markY: mark.y.toFixed(1),
        stage,
        stepAxis: step.axis,
        stepDir: step.direction,
        sectorAxis,
        perpAxis,
        inSector,
        crossedPerp,
        crossed,
        currSectorValue: currSectorValue.toFixed(1),
        sectorThreshold: sectorThreshold.toFixed(1),
        prevPerpValue: prevPerpValue.toFixed(1),
        currPerpValue: currPerpValue.toFixed(1),
        perpThreshold: perpThreshold.toFixed(1),
      })
    }

    return {
      completed: finished,
      debugEvent,
    }
  }

  private buildLapDebugEvent(
    boat: BoatState,
    state: RaceState,
    info: {
      leg: (typeof courseLegs)[number]
      stage: number
      crossed: boolean
      distance: number
      stagesTotal: number
    },
  ): RaceEvent {
    const message = `[lap-debug] ${boat.name} leg=${info.leg.sequence} stage=${info.stage}/${info.stagesTotal} crossed=${info.crossed} dir=${info.leg.rounding} dist=${info.distance.toFixed(1)}m lap=${boat.lap}`
    lapDebug(message)
    return {
      eventId: createId('lap-debug'),
      kind: 'rule_hint',
      ruleId: 'other',
      t: state.t,
      boats: [boat.id],
      message,
    }
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
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }

  private startSpinSequence(boatId: string) {
    if (this.spinTimers.has(boatId)) return
    const state = this.store.getState()
    const boat = state.boats[boatId]
    if (!boat) return
    this.spinningBoats.add(boatId)
    const origin = boat.desiredHeadingDeg ?? boat.headingDeg ?? 0
    const headings = [origin + 120, origin + 240, origin].map((deg) => normalizeDeg(deg))
    const timers: NodeJS.Timeout[] = []
    let delay = 0
    headings.forEach((heading, index) => {
      const timer = setTimeout(() => {
        this.injectSpinHeading(boatId, heading)
        if (index === headings.length - 1) {
          this.pendingSpinClears.add(boatId)
          this.spinTimers.delete(boatId)
        }
      }, delay)
      timers.push(timer)
      delay += SPIN_HOLD_SECONDS * 1000
    })
    this.spinTimers.set(boatId, timers)
  }

  private injectSpinHeading(boatId: string, heading: number) {
    const payload = {
      boatId,
      desiredHeadingDeg: normalizeDeg(heading),
      absoluteHeadingDeg: normalizeDeg(heading),
      tClient: Date.now(),
      seq: this.spinSeq++,
    }
    this.store.upsertInput(payload)
  }

  private applySpinLocks(state: RaceState) {
    this.spinningBoats.forEach((boatId) => {
      const boat = state.boats[boatId]
      if (boat) boat.rightsSuspended = true
    })
  }

  private resolveSpinCompletions(state: RaceState) {
    const events: RaceEvent[] = []
    this.pendingSpinClears.forEach((boatId) => {
      const boat = state.boats[boatId]
      if (!boat) return
      this.spinningBoats.delete(boatId)
      boat.rightsSuspended = false
      if (boat.penalties > 0) {
        boat.penalties -= 1
        boat.fouled = boat.penalties > 0
        events.push({
          eventId: createId('event'),
          kind: 'rule_hint',
          ruleId: 'other',
          boats: [boatId],
          t: state.t,
          message: `${boat.name} completed a 360° spin and cleared a penalty (${boat.penalties} remaining)`,
        })
      } else {
        boat.fouled = false
      }
    })
    this.pendingSpinClears.clear()
    return events
  }

  private cancelSpinSequences() {
    this.spinTimers.forEach((timers) => timers.forEach((id) => clearTimeout(id)))
    this.spinTimers.clear()
    this.spinningBoats.clear()
    this.pendingSpinClears.clear()
  }
}

