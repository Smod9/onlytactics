import { stepRaceState, clamp as physicsClamp, normalizeDeg } from '@/logic/physics'
import { RulesEngine } from '@/logic/rules'
import { resolveBoatBoatCollisions } from '@/logic/collision/boatBoat'
import { cloneRaceState } from '@/state/factories'
import { raceStore, RaceStore } from '@/state/raceStore'
import type { BoatState, RaceEvent, RaceState } from '@/types/race'
import { createSeededRandom } from '@/utils/rng'
import { appEnv } from '@/config/env'
import { createId } from '@/utils/ids'
import { identity } from '@/net/identity'
import {
  SPIN_HOLD_SECONDS,
  WIND_SPEED_MAX_KTS,
  WIND_SPEED_MIN_KTS,
  WAKE_GRID_ENABLED,
} from '@/logic/constants'
import { boatCapsuleCircles } from '@/logic/boatGeometry'
import { courseLegs, radialSets, gateRadials } from '@/config/course'
import { distanceBetween } from '@/utils/geometry'
import { assignLeaderboard } from '@/logic/leaderboard'
import { createShadowStampAtlas, type ShadowStampAtlas } from '@/logic/shadowStamps'
import {
  createWindShadowGrid,
  computeCourseBounds,
  computeWakeFactorsFromGrid,
  type WindShadowGrid,
} from '@/logic/windShadowGrid'

const circleSignedDistanceToLine = (
  circleCenter: { x: number; y: number },
  committee: { x: number; y: number },
  pin: { x: number; y: number },
  courseSideSign: number,
) => {
  const lineVec = { x: pin.x - committee.x, y: pin.y - committee.y }
  const rel = { x: circleCenter.x - committee.x, y: circleCenter.y - committee.y }
  const len = Math.sqrt(lineVec.x * lineVec.x + lineVec.y * lineVec.y)
  if (len === 0) return { signedDistanceCourse: 0, t: 0, lineLen: 0 }
  const cross = lineVec.x * rel.y - lineVec.y * rel.x
  const signedDistanceCourse = (cross * courseSideSign) / len // + = course side
  const len2 = len * len
  const t = (rel.x * lineVec.x + rel.y * lineVec.y) / len2
  return { signedDistanceCourse, t, lineLen: len }
}

const circleBetweenMarks = (
  circleCenter: { x: number; y: number },
  radius: number,
  committee: { x: number; y: number },
  pin: { x: number; y: number },
  courseSideSign: number,
) => {
  const { t, lineLen } = circleSignedDistanceToLine(
    circleCenter,
    committee,
    pin,
    courseSideSign,
  )
  if (lineLen === 0) return false
  const margin = radius / lineLen
  return t >= -margin && t <= 1 + margin
}

const boatOverStartLine = (
  boat: BoatState,
  pos: { x: number; y: number },
  committee: { x: number; y: number },
  pin: { x: number; y: number },
  courseSideSign: number,
) => {
  const circles = boatCapsuleCircles(boat, pos)
  return circles.some(({ x, y, r }) => {
    const { signedDistanceCourse } = circleSignedDistanceToLine(
      { x, y },
      committee,
      pin,
      courseSideSign,
    )
    const overlapsCourseSide = signedDistanceCourse > -r
    return (
      overlapsCourseSide &&
      circleBetweenMarks({ x, y }, r, committee, pin, courseSideSign)
    )
  })
}

const boatOverFinishSide = (
  boat: BoatState,
  pos: { x: number; y: number },
  committee: { x: number; y: number },
  pin: { x: number; y: number },
  courseSideSign: number,
) => {
  const circles = boatCapsuleCircles(boat, pos)
  return circles.some(({ x, y, r }) => {
    const { signedDistanceCourse } = circleSignedDistanceToLine(
      { x, y },
      committee,
      pin,
      courseSideSign,
    )
    const overlapsFinishSide = signedDistanceCourse < r
    return (
      overlapsFinishSide &&
      circleBetweenMarks({ x, y }, r, committee, pin, courseSideSign)
    )
  })
}

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
  /** For angular rounding: cumulative signed angle swept around the mark (radians) */
  sweepAngle?: number
  /** Previous angle relative to mark (radians) */
  prevAngle?: number
}

type HostLoopOptions = {
  onEvents?: (events: RaceEvent[]) => void
  onTick?: (state: RaceState, events: RaceEvent[]) => void
  onTimeout?: () => void
}

export class HostLoop {
  private timer?: ReturnType<typeof setInterval>

  private lastTick = 0
  private paused = false

  private roundingProgress = new Map<string, RoundingProgress>()

  // Grid-based wind shadow system
  private shadowStampAtlas?: ShadowStampAtlas
  private windShadowGrid?: WindShadowGrid

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

    // Initialize grid-based wind shadow system
    if (WAKE_GRID_ENABLED) {
      this.initializeWindShadowGrid(initialState)
    }
  }

  private initializeWindShadowGrid(state: RaceState) {
    this.shadowStampAtlas = createShadowStampAtlas()
    const bounds = computeCourseBounds(state)
    this.windShadowGrid = createWindShadowGrid(bounds)
  }

  /**
   * Check if any boat is outside the grid bounds and expand if needed.
   */
  private expandGridIfNeeded(state: RaceState): void {
    if (!this.windShadowGrid) return

    const grid = this.windShadowGrid
    const padding = 100 // Extra padding when expanding

    let needsExpansion = false
    let newMinX = grid.originX
    let newMaxX = grid.originX + grid.width * grid.cellSize
    let newMinY = grid.originY
    let newMaxY = grid.originY + grid.height * grid.cellSize

    for (const boat of Object.values(state.boats)) {
      if (boat.pos.x < grid.originX + padding) {
        newMinX = Math.min(newMinX, boat.pos.x - padding * 2)
        needsExpansion = true
      }
      if (boat.pos.x > grid.originX + grid.width * grid.cellSize - padding) {
        newMaxX = Math.max(newMaxX, boat.pos.x + padding * 2)
        needsExpansion = true
      }
      if (boat.pos.y < grid.originY + padding) {
        newMinY = Math.min(newMinY, boat.pos.y - padding * 2)
        needsExpansion = true
      }
      if (boat.pos.y > grid.originY + grid.height * grid.cellSize - padding) {
        newMaxY = Math.max(newMaxY, boat.pos.y + padding * 2)
        needsExpansion = true
      }
    }

    if (needsExpansion) {
      this.windShadowGrid = createWindShadowGrid({
        minX: newMinX,
        maxX: newMaxX,
        minY: newMinY,
        maxY: newMaxY,
      })
    }
  }

  private windTimer = 0
  private windShift = 0
  private windTargetShift = 0
  private windSpeedTarget = 12

  private windRandom

  private startSignalSent = false

  private ocsBoats = new Set<string>()
  /** Tracks whether each boat was over the start line at the moment of the gun.
   *  `true` = was over (OCS side), needs to return below before crossing counts.
   *  `false` = was below, normal transition detection will work.
   *  Entry is deleted once the first crossing is detected. */
  private startLineBaseState = new Map<string, boolean>()

  private courseSideSign?: number
  private raceStartWallClockMs: number | null = null
  private spinTimers = new Map<string, Array<ReturnType<typeof setTimeout>>>()
  private spinningBoats = new Set<string>()
  private pendingSpinClears = new Set<string>()
  private spinSeq = 0

  private tickErrorCount = 0

  start() {
    if (this.timer) return
    this.lastTick = performance.now()
    const intervalMs = 1000 / this.tickRate
    this.timer = setInterval(() => {
      try {
        this.tick()
        this.tickErrorCount = 0
      } catch (error) {
        this.tickErrorCount++
        console.error('[HostLoop] tick error', {
          errorCount: this.tickErrorCount,
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined,
        })
        if (this.tickErrorCount >= 30) {
          console.error('[HostLoop] too many consecutive tick errors, stopping loop')
          this.stop()
        }
      }
    }, intervalMs)
  }

  setPaused(paused: boolean) {
    const next = Boolean(paused)
    if (this.paused === next) return
    this.paused = next
    // Prevent an enormous dt on resume.
    this.lastTick = performance.now()
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
    this.startLineBaseState.clear()
    this.courseSideSign = undefined
    this.raceStartWallClockMs = state.clockStartMs
    this.cancelSpinSequences()
    this.roundingProgress.clear()

    // Reinitialize grid if course bounds might have changed
    if (WAKE_GRID_ENABLED) {
      const bounds = computeCourseBounds(state)
      this.windShadowGrid = createWindShadowGrid(bounds)
    }
  }

  isRunning = () => Boolean(this.timer)

  private tick() {
    const now = performance.now()
    const rawDt = (now - this.lastTick) / 1000
    const dt = Math.min(rawDt, 0.25)
    this.lastTick = now
    if (rawDt > 1) {
      console.warn('[HostLoop] long tick gap', { rawDtMs: (rawDt * 1000).toFixed(0), dtCapped: dt.toFixed(3) })
    }

    const next = cloneRaceState(this.store.getState())
    if (this.paused || next.paused || next.phase === 'results') {
      return
    }
    const inputs = this.store.consumeInputs()
    const collisionOutcomes = this.rules.computeCollisionOutcomes(next)
    const countdownHeld = next.phase === 'prestart' && !next.countdownArmed

    // Expand grid if boats have sailed outside bounds
    if (WAKE_GRID_ENABLED) {
      this.expandGridIfNeeded(next)
    }

    // Compute wake factors using grid-based system if enabled
    const wakeFactors =
      WAKE_GRID_ENABLED && this.windShadowGrid && this.shadowStampAtlas
        ? computeWakeFactorsFromGrid(next, this.windShadowGrid, this.shadowStampAtlas)
        : undefined

    if (!countdownHeld) {
      stepRaceState(next, inputs, dt, collisionOutcomes, { wakeFactors })
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
    if (this.checkRaceTimeout(next)) {
      return
    }
    const lapEvents = this.updateLapProgress(next)

    this.applySpinLocks(next)
    const startEvents = this.updateStartLine(next)

    const warnings = this.rules.computeWarnings(next)
    Object.values(next.boats).forEach((boat) => {
      boat.collisionWarning = warnings.get(boat.id) ?? ''
    })

    const resolutions = this.rules.evaluate(next)
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

    // Apply boat-to-boat repulsion AFTER rules evaluation so the rules
    // engine can detect overlapping boats before they're pushed apart.
    const faults = this.rules.computeCollisionFaults(next)
    const { correctedPositions: boatCorrected } = resolveBoatBoatCollisions(next, faults)
    boatCorrected.forEach((pos, boatId) => {
      const boat = next.boats[boatId]
      if (!boat) return
      boat.pos.x = pos.x
      boat.pos.y = pos.y
    })

    Object.values(next.boats).forEach((boat) => {
      boat.fouled = (boat.fouledUntil ?? 0) > next.t
    })
    resolutions.forEach((violation) => {
      const offender = next.boats[violation.offenderId]
      if (offender) {
        offender.fouled = true
        offender.fouledUntil = next.t + 2
      }
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
    const speedMin = WIND_SPEED_MIN_KTS
    const speedMax = WIND_SPEED_MAX_KTS

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

    // Handle START line specially
    if (currentLeg.kind === 'start' && currentLeg.finishLineIndices) {
      const startEvents = this.advanceStartLeg(boat, state, progress, currentLeg)
      events.push(...startEvents)
      return events
    }

    // Handle GATE legs specially
    if (currentLeg.kind === 'gate' && currentLeg.gateMarkIndices) {
      const gateEvents = this.advanceGateLeg(boat, state, progress, currentLeg, lapTarget)
      events.push(...gateEvents)
      return events
    }

    // Handle FINISH line specially
    if (currentLeg.kind === 'finish' && currentLeg.finishLineIndices) {
      const finishEvents = this.advanceFinishLeg(boat, state, currentLeg)
      events.push(...finishEvents)
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
      progress.sweepAngle = undefined
      progress.prevAngle = undefined
      return events
    }

    // Track rounding using radials (primary detection)
    const { completed, debugEvent } = this.trackRadialCrossings(
      boat,
      progress,
      targetMark,
      currentLeg,
    )
    if (debugEvent) {
      events.push(debugEvent)
    }

    // Angular sweep fallback: track cumulative angle swept around the mark.
    // This catches roundings where the boat's approach angle doesn't trigger
    // all radial stages in sequence (e.g., tight layline approach).
    const sweepCompleted = !completed && this.trackAngularSweep(boat, progress, targetMark, currentLeg)

    if (completed || sweepCompleted) {
      progress.sweepAngle = undefined
      progress.prevAngle = undefined
      this.advanceToNextSequence(boat, state, progress, currentLeg, lapTarget)
      events.push({
        eventId: createId('mark'),
        kind: 'mark_rounding',
        t: state.t,
        boats: [boat.id],
        message: `${boat.name} rounded the ${currentLeg.id} mark`,
      })
    }
    return events
  }

  /**
   * Handle start line crossing.
   * Boat must cross between committee and pin marks (from pre-start side to course side).
   */
  private advanceStartLeg(
    boat: BoatState,
    state: RaceState,
    progress: RoundingProgress,
    leg: (typeof courseLegs)[number],
  ): RaceEvent[] {
    const events: RaceEvent[] = []
    const marks = state.marks
    const [committeeIdx, pinIdx] = leg.finishLineIndices!
    const committeeMark = marks[committeeIdx] ?? state.startLine.committee
    const pinMark = marks[pinIdx] ?? state.startLine.pin

    const committee = committeeMark ?? state.startLine.committee
    const pin = pinMark ?? state.startLine.pin

    // Calculate midpoint for distance display
    const midpoint = {
      x: (committee.x + pin.x) / 2,
      y: (committee.y + pin.y) / 2,
    }
    const distance = distanceBetween(boat.pos, midpoint)
    boat.nextMarkIndex = committeeIdx
    boat.distanceToNextMark = distance

    const courseSide = this.courseSideSign ?? 1

    // During prestart, snapshot each boat's side of the line so we have a
    // reliable baseline for the transition check after the gun fires.
    if (state.t < 0) {
      const over = boatOverStartLine(boat, boat.pos, committee, pin, courseSide)
      this.startLineBaseState.set(boat.id, over)
      return events
    }

    // After the gun: detect when a boat crosses FROM the pre-start side TO
    // the course side. We use the stored baseline to know where the boat was
    // at the gun. A boat that was already over must return below first.
    const wasOver = this.startLineBaseState.get(boat.id) ?? false
    const isOver = boatOverStartLine(boat, boat.pos, committee, pin, courseSide)

    // Update baseline: once below the line, record that so the next
    // transition above counts as a proper crossing.
    if (!isOver) {
      this.startLineBaseState.set(boat.id, false)
    }

    const crossed = !wasOver && isOver

    if (crossed) {
      this.startLineBaseState.delete(boat.id)
      lapDebug('boat_started', {
        boatId: boat.id,
        startTime: state.t.toFixed(2),
      })

      // Advance to next sequence (windward mark)
      progress.legIndex += 1
      progress.stage = 0

      // Update next mark to windward
      const nextLeg = courseLegs[progress.legIndex % courseLegs.length]
      boat.nextMarkIndex = nextLeg.markIndices[0]
      const nextMark = state.marks[boat.nextMarkIndex]
      boat.distanceToNextMark = nextMark ? distanceBetween(boat.pos, nextMark) : 0

      events.push({
        eventId: createId('start'),
        kind: 'boat_started',
        t: state.t,
        boats: [boat.id],
        message: `${boat.name} crossed the start line`,
      })
    }

    return events
  }

  /**
   * Check if boat crossed the start line (from pre-start side to course side)
   */
  private _checkStartLineCrossing(
    boat: BoatState,
    state: RaceState,
    committee: { x: number; y: number },
    pin: { x: number; y: number },
  ): boolean {
    const prevPos = boat.prevPos ?? boat.pos

    // Line vector from committee to pin
    const lineVec = { x: pin.x - committee.x, y: pin.y - committee.y }

    // Determine course side based on wind direction
    const windRad = (state.baselineWindDeg * Math.PI) / 180
    const windVec = { x: Math.sin(windRad), y: -Math.cos(windRad) }
    const cross = lineVec.x * windVec.y - lineVec.y * windVec.x
    const courseSideSign = cross >= 0 ? 1 : -1

    const prevOver = boatOverStartLine(boat, prevPos, committee, pin, courseSideSign)
    const currOver = boatOverStartLine(boat, boat.pos, committee, pin, courseSideSign)
    return !prevOver && currOver
  }

  /**
   * Handle finish line crossing.
   * Boat must cross between committee and pin marks.
   */
  private advanceFinishLeg(
    boat: BoatState,
    state: RaceState,
    leg: (typeof courseLegs)[number],
  ): RaceEvent[] {
    const events: RaceEvent[] = []
    const marks = state.marks
    const [committeeIdx, pinIdx] = leg.finishLineIndices!
    const committeeMark = marks[committeeIdx] ?? state.startLine.committee
    const pinMark = marks[pinIdx] ?? state.startLine.pin

    // Use start line marks as fallback
    const committee = committeeMark ?? state.startLine.committee
    const pin = pinMark ?? state.startLine.pin

    // Calculate midpoint for distance display
    const midpoint = {
      x: (committee.x + pin.x) / 2,
      y: (committee.y + pin.y) / 2,
    }
    const distance = distanceBetween(boat.pos, midpoint)
    boat.nextMarkIndex = committeeIdx
    boat.distanceToNextMark = distance

    // Check if boat crossed the finish line
    const crossed = this.checkFinishLineCrossing(boat, state, committee, pin)

    if (crossed) {
      boat.finished = true
      boat.finishTime = state.t
      boat.distanceToNextMark = 0

      lapDebug('boat_finished', {
        boatId: boat.id,
        finishTime: state.t.toFixed(2),
        lap: boat.lap,
      })

      events.push({
        eventId: createId('finish'),
        kind: 'finish',
        t: state.t,
        boats: [boat.id],
        message: `${boat.name} finished!`,
      })
    }

    return events
  }

  /**
   * Check if boat crossed the finish line (between committee and pin)
   */
  private checkFinishLineCrossing(
    boat: BoatState,
    state: RaceState,
    committee: { x: number; y: number },
    pin: { x: number; y: number },
  ): boolean {
    const prevPos = boat.prevPos ?? boat.pos

    // Line vector from committee to pin
    const lineVec = { x: pin.x - committee.x, y: pin.y - committee.y }

    // Check which side of the line we need to cross FROM
    // (based on wind direction - we want to cross from the course side)
    const windRad = (state.baselineWindDeg * Math.PI) / 180
    const windVec = { x: Math.sin(windRad), y: -Math.cos(windRad) }
    const cross = lineVec.x * windVec.y - lineVec.y * windVec.x
    const courseSideSign = cross >= 0 ? 1 : -1

    const prevOver = boatOverFinishSide(boat, prevPos, committee, pin, courseSideSign)
    const currOver = boatOverFinishSide(boat, boat.pos, committee, pin, courseSideSign)
    return !prevOver && currOver
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

    // Debug: log gate entry state when close
    if (appEnv.debugHud && distanceToGate < 150) {
      lapDebug('gate_approach', {
        boatId: boat.id,
        stage: progress.stage,
        gateSide: progress.gateSide,
        activeMarkIndex: progress.activeMarkIndex,
        boatX: boat.pos.x.toFixed(1),
        boatY: boat.pos.y.toFixed(1),
        closestMark: distToLeft < distToRight ? 'left' : 'right',
        distToLeft: distToLeft.toFixed(1),
        distToRight: distToRight.toFixed(1),
        leftMarkPos: `(${leftMark.x}, ${leftMark.y})`,
        rightMarkPos: `(${rightMark.x}, ${rightMark.y})`,
      })
    }

    // If too far from gate, don't track
    if (distanceToGate > ROUND_MAX_RADIUS) {
      progress.stage = 0
      progress.gateSide = undefined
      progress.activeMarkIndex = undefined
      return events
    }

    // STAGE 0: Cross the gate line
    if (progress.stage === 0) {
      // Ensure gate-specific progress is clean when starting fresh
      progress.gateSide = undefined
      progress.activeMarkIndex = undefined

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
      }
      return events
    }

    // STAGE 1: Commit to a mark by crossing its SOUTH radial
    if (progress.stage === 1) {
      // Check south radial for LEFT and RIGHT; commit to whichever is crossed
      const leftSouth = gateRadials.left[0] // { axis:'y', direction:1 }
      const rightSouth = gateRadials.right[0]

      const { crossed: crossedLeft, debugInfo: dbgLeft } = this.checkRadialCrossing(
        boat,
        leftMark,
        leftSouth,
      )
      const { crossed: crossedRight, debugInfo: dbgRight } = this.checkRadialCrossing(
        boat,
        rightMark,
        rightSouth,
      )

      if (appEnv.debugHud) {
        lapDebug('gate_commit_check', {
          boatId: boat.id,
          crossedLeft,
          crossedRight,
          leftMark: `(${leftMark.x},${leftMark.y})`,
          rightMark: `(${rightMark.x},${rightMark.y})`,
          ...(!crossedLeft ? { dbgLeft } : {}),
          ...(!crossedRight ? { dbgRight } : {}),
        })
      }

      if (crossedLeft || crossedRight) {
        const side = crossedLeft ? 'left' : 'right'
        const markIdx = crossedLeft ? leftIdx : rightIdx
        progress.gateSide = side
        progress.activeMarkIndex = markIdx
        progress.stage = 2 // Next stage will track exit radial

        // lap debug event removed
      }
      return events
    }

    // STAGE 2+: Track remaining radials for the committed mark (exit radial)
    if (!progress.gateSide || progress.activeMarkIndex === undefined) {
      progress.stage = 0
      return events
    }

    const chosenMark = marks[progress.activeMarkIndex]
    if (!chosenMark) return events

    // Skip the south radial (index 0) because commitment already required it.
    const radials = gateRadials[progress.gateSide].slice(1)
    const radialStage = progress.stage - 2 // 0-based within remaining radials
    const step = radials[radialStage]

    if (!step) {
      // All stages complete!
      const side = progress.gateSide
      progress.stage = 0
      progress.gateSide = undefined
      progress.activeMarkIndex = undefined
      this.advanceToNextSequence(boat, state, progress, leg, lapTarget)
      events.push({
        eventId: createId('mark'),
        kind: 'mark_rounding',
        t: state.t,
        boats: [boat.id],
        message: `${boat.name} rounded the ${side ?? 'gate'} gate mark`,
      })
      return events
    }

    // Check radial crossing for this stage
    const { crossed, debugInfo } = this.checkRadialCrossing(boat, chosenMark, step)

    if (appEnv.debugHud) {
      lapDebug('gate_radial_state', {
        boatId: boat.id,
        gateSide: progress.gateSide,
        activeMarkIndex: progress.activeMarkIndex,
        markX: chosenMark.x.toFixed(1),
        markY: chosenMark.y.toFixed(1),
        boatX: boat.pos.x.toFixed(1),
        boatY: boat.pos.y.toFixed(1),
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
      // Check if all radials done
      if (radialStage + 1 >= radials.length) {
        const side = progress.gateSide
        progress.stage = 0
        progress.gateSide = undefined
        progress.activeMarkIndex = undefined
        this.advanceToNextSequence(boat, state, progress, leg, lapTarget)
        events.push({
          eventId: createId('mark'),
          kind: 'mark_rounding',
          t: state.t,
          boats: [boat.id],
          message: `${boat.name} rounded the ${side ?? 'gate'} gate mark`,
        })
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
    const crossedY =
      (prevY < gateLineY && currY >= gateLineY) ||
      (prevY > gateLineY && currY <= gateLineY)

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
    const currInSector =
      step.direction === 1
        ? currSectorValue >= sectorThreshold
        : currSectorValue <= sectorThreshold
    const prevInSector =
      step.direction === 1
        ? prevSectorValue >= sectorThreshold
        : prevSectorValue <= sectorThreshold
    const inSector = currInSector || prevInSector

    // Check if crossed perpendicular threshold
    const crossedPerp =
      (prevPerpValue < perpThreshold && currPerpValue >= perpThreshold) ||
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

    // After completing windward-return, check if this is the final lap
    // If NOT final lap, skip finish and go back to gate
    const isFinalLap = boat.lap >= lapTarget - 1
    const completedWindwardReturn =
      completedLeg.kind === 'windward' && completedLeg.id === 'windward-return'

    if (completedWindwardReturn && !isFinalLap) {
      // Go directly to gate (seq 2), skipping finish
      const gateLeg = courseLegs.find((leg) => leg.kind === 'gate')
      if (gateLeg) {
        progress.legIndex = courseLegs.indexOf(gateLeg)
        // Reset gate progress for the new gate rounding
        progress.stage = 0
        progress.gateSide = undefined
        progress.activeMarkIndex = undefined

        boat.nextMarkIndex = gateLeg.markIndices[0]
        const nextMark = state.marks[boat.nextMarkIndex]
        boat.distanceToNextMark = nextMark ? distanceBetween(boat.pos, nextMark) : 0

        lapDebug('advanced_to_gate_for_next_lap', {
          boatId: boat.id,
          lap: boat.lap,
          lapTarget,
        })
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
    const sameMarkAsBefore = [...completedMarkIndices].some((idx) =>
      nextMarkIndices.has(idx),
    )

    if (sameMarkAsBefore) {
      lapDebug('skip_same_mark_sequence', {
        boatId: boat.id,
        completedSequence,
        nextSequence: nextLeg.sequence,
        sharedMarks: [...completedMarkIndices].filter((idx) => nextMarkIndices.has(idx)),
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

    // If entering gate, reset gate-specific progress
    if (finalNextLeg.kind === 'gate') {
      progress.stage = 0
      progress.gateSide = undefined
      progress.activeMarkIndex = undefined
    }

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
    const currInSector =
      step.direction === 1
        ? currSectorValue >= sectorThreshold
        : currSectorValue <= sectorThreshold
    const prevInSector =
      step.direction === 1
        ? prevSectorValue >= sectorThreshold
        : prevSectorValue <= sectorThreshold
    const inSector = currInSector || prevInSector

    // Check if we crossed the perpendicular threshold (in either direction)
    // The sector check ensures this is a valid crossing of the visual ray
    const crossedPerp =
      (prevPerpValue < perpThreshold && currPerpValue >= perpThreshold) ||
      (prevPerpValue > perpThreshold && currPerpValue <= perpThreshold)

    const crossed = inSector && crossedPerp

    let finished = false
    if (crossed) {
      progress.stage += 1
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
      debugEvent: undefined,
    }
  }

  /**
   * Fallback rounding detection using cumulative angular sweep.
   * Tracks the total angle the boat has swept around the mark;
   * if it exceeds ~150° in the correct direction, the rounding counts.
   * This handles cases where the radial stages fail due to unusual approach angles.
   */
  private trackAngularSweep(
    boat: BoatState,
    progress: RoundingProgress,
    mark: { x: number; y: number },
    leg: (typeof courseLegs)[number],
  ): boolean {
    const dx = boat.pos.x - mark.x
    const dy = boat.pos.y - mark.y
    const angle = Math.atan2(dy, dx)

    if (progress.prevAngle === undefined) {
      progress.prevAngle = angle
      progress.sweepAngle = 0
      return false
    }

    let delta = angle - progress.prevAngle
    // Normalize to [-PI, PI] to handle wrapping
    if (delta > Math.PI) delta -= 2 * Math.PI
    if (delta < -Math.PI) delta += 2 * Math.PI
    progress.prevAngle = angle
    progress.sweepAngle = (progress.sweepAngle ?? 0) + delta

    // Port rounding = clockwise = negative sweep in standard math coords
    // Starboard rounding = counter-clockwise = positive sweep
    const isPort = leg.rounding === 'port'
    const sweep = progress.sweepAngle
    const THRESHOLD = (150 * Math.PI) / 180 // ~150°

    const completed = isPort ? sweep < -THRESHOLD : sweep > THRESHOLD
    return completed
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
        // Performance: once the race has started, only boats that are currently OCS
        // need start-line evaluation (to detect when they clear and can start properly).
        if (!beforeStart && !boat.overEarly) return

        const over = boatOverStartLine(
          boat,
          boat.pos,
          committee,
          pin,
          this.courseSideSign ?? 1,
        )

        if (boat.overEarly && !over) {
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

        if (beforeStart && over) {
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


  private checkRaceTimeout(state: RaceState) {
    if (state.phase !== 'running') return
    if (!this.raceStartWallClockMs) return
    const elapsedMs = Date.now() - this.raceStartWallClockMs
    const timeoutMs = appEnv.raceTimeoutMinutes * 60_000
    if (elapsedMs < timeoutMs) return
    if (this.options.onTimeout) {
      // Match the manual "Restart Race" behavior: reset the race rather than freezing in a finished state.
      // Schedule after the current tick returns to avoid racing with store.setState(next).
      setTimeout(() => this.options.onTimeout?.(), 0)
      return true
    }

    // Fallback behavior (if no host controller is wiring onTimeout): finish + stop the loop.
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
    return true
  }

  private startSpinSequence(boatId: string) {
    if (this.spinTimers.has(boatId)) return
    const state = this.store.getState()
    const boat = state.boats[boatId]
    if (!boat) return
    this.spinningBoats.add(boatId)
    const origin = boat.desiredHeadingDeg ?? boat.headingDeg ?? 0
    const headings = [origin + 120, origin + 240, origin].map((deg) => normalizeDeg(deg))
    const timers: Array<ReturnType<typeof setTimeout>> = []
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
