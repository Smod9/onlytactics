import type { RaceState, BoatState, Vec2 } from '@/types/race'
import type { RaceStore } from '@/state/raceStore'
import type { ControlUpdate } from '@/net/controllers/types'
import { headingFromAwa, angleDiff, normalizeDeg } from '@/logic/physics'
import { distanceBetween } from '@/utils/geometry'

type Leg = 'prestart' | 'upwind' | 'downwind'

type Runtime = {
  leg: Leg
  nextDecisionAt: number
  lastHeading?: number
  lastSentAt?: number
}

export class AiManager {
  private runtimes = new Map<string, Runtime>()
  private timer?: number

  constructor(
    private store: RaceStore,
    private sendInput: (boatId: string, update: ControlUpdate) => void,
    private requestSpin: (boatId: string) => void,
  ) {}

  start(intervalMs = 150) {
    if (this.timer) return
    this.timer = window.setInterval(() => this.update(), intervalMs)
  }

  stop() {
    if (!this.timer) return
    window.clearInterval(this.timer)
    this.timer = undefined
  }

  private update() {
    const state = this.store.getState()
    const now = performance.now()
    const hasAi = Object.values(state.boats).some((boat) => boat.ai?.enabled)
    if (!hasAi) return

    Object.values(state.boats).forEach((boat) => {
      if (!boat.ai?.enabled) return
      if (boat.rightsSuspended) return
      if (boat.penalties > 0) {
        this.requestSpin(boat.id)
        return
      }
      this.updateBoat(state, boat, now)
    })
  }

  private updateBoat(state: RaceState, boat: BoatState, now: number) {
    const runtime = this.ensureRuntime(state, boat.id)
    const profile = boat.ai!

    runtime.leg = this.evaluateLeg(state, boat, runtime.leg)

    if (runtime.leg === 'prestart') {
      if (state.phase === 'running') {
        runtime.leg = 'upwind'
      } else {
        this.publishHeading(boat, this.computePrestartHeading(state, boat, profile), runtime)
        return
      }
    }

    if (boat.overEarly && state.phase !== 'running') {
      const heading = this.computeOcsRecoveryHeading(state, boat)
      this.publishHeading(boat, heading, runtime)
      return
    }

    const nextDecisionAt = runtime.nextDecisionAt
    if (now < nextDecisionAt) return
    runtime.nextDecisionAt = now + this.computeDecisionDelay(profile)

    const heading = this.computeLegHeading(state, boat, profile, runtime.leg)
    this.publishHeading(boat, heading, runtime)
  }

  private publishHeading(boat: BoatState, heading: number, runtime: Runtime) {
    if (runtime.lastHeading !== undefined) {
      const diff = Math.abs(angleDiff(heading, runtime.lastHeading))
      if (diff < 2) {
        return
      }
    }
    const now = performance.now()
    if (runtime.lastSentAt && now - runtime.lastSentAt < 800) {
      return
    }
    runtime.lastSentAt = now
    runtime.lastHeading = heading
    this.sendInput(boat.id, { absoluteHeadingDeg: heading })
  }

  private ensureRuntime(state: RaceState, boatId: string): Runtime {
    let runtime = this.runtimes.get(boatId)
    if (!runtime) {
      runtime = {
        leg: state.phase === 'running' ? 'upwind' : 'prestart',
        nextDecisionAt: 0,
      }
      this.runtimes.set(boatId, runtime)
    }
    return runtime
  }

  private computeDecisionDelay(profile: NonNullable<BoatState['ai']>) {
    const base = profile.reactionMs
    const chillFactor = 1 + (1 - profile.accuracy) * 0.8
    const randomFactor = 0.9 + Math.random() * 0.3
    return base * chillFactor * randomFactor
  }

  private evaluateLeg(state: RaceState, boat: BoatState, current: Leg): Leg {
    if (state.phase !== 'running') {
      return 'prestart'
    }
    const windward = state.marks[0]
    const gateCenter = this.getGateCenter(state)

    if (current === 'prestart') {
      return 'upwind'
    }

    if (current === 'upwind' && windward && this.isNear(boat.pos, windward, 25)) {
      return 'downwind'
    }

    if (current === 'downwind' && this.isNear(boat.pos, gateCenter, 30)) {
      return 'upwind'
    }

    return current
  }

  private computeLegHeading(
    state: RaceState,
    boat: BoatState,
    profile: NonNullable<BoatState['ai']>,
    leg: Leg,
  ) {
    const windDir = state.wind.directionDeg
    const windward = state.marks[0]
    const gateCenter = this.getGateCenter(state)
    const target = leg === 'upwind' ? windward : gateCenter
    if (!target) return boat.desiredHeadingDeg

    const bearing = this.bearingTo(boat.pos, target)
    if (leg === 'upwind') {
      return this.computeUpwindHeading(windDir, bearing, profile)
    }
    return this.computeDownwindHeading(windDir, bearing, profile)
  }

  private computeUpwindHeading(
    windDir: number,
    bearing: number,
    profile: NonNullable<BoatState['ai']>,
  ) {
    const relative = angleDiff(bearing, windDir)
    const tackSign = relative >= 0 ? 1 : -1
    if (Math.abs(relative) <= profile.laylineBuffer) {
      return normalizeDeg(bearing + this.noise(profile))
    }
    const base = headingFromAwa(windDir, tackSign * profile.upwindAwa)
    return normalizeDeg(base + this.noise(profile))
  }

  private computeDownwindHeading(
    windDir: number,
    bearing: number,
    profile: NonNullable<BoatState['ai']>,
  ) {
    const relative = angleDiff(bearing, windDir)
    const tackSign = relative >= 0 ? 1 : -1
    if (Math.abs(Math.abs(relative) - 180) <= profile.laylineBuffer) {
      return normalizeDeg(bearing + this.noise(profile))
    }
    const base = headingFromAwa(windDir, tackSign * profile.downwindAwa)
    return normalizeDeg(base + this.noise(profile))
  }

  private computePrestartHeading(
    state: RaceState,
    boat: BoatState,
    profile: NonNullable<BoatState['ai']>,
  ) {
    const windDir = state.wind.directionDeg
    const target = this.getStartHoldingPoint(state)
    const bearing = this.bearingTo(boat.pos, target)
    const relative = angleDiff(bearing, windDir)
    const tackSign = relative >= 0 ? 1 : -1
    const base = headingFromAwa(windDir, tackSign * profile.upwindAwa)
    return normalizeDeg(base + this.noise(profile))
  }

  private computeOcsRecoveryHeading(state: RaceState, boat: BoatState) {
    const safePoint = {
      x: (state.startLine.pin.x + state.startLine.committee.x) / 2,
      y: (state.startLine.pin.y + state.startLine.committee.y) / 2 + 60,
    }
    return this.bearingTo(boat.pos, safePoint)
  }

  private getGateCenter(state: RaceState): Vec2 {
    return {
      x: (state.leewardGate.left.x + state.leewardGate.right.x) / 2,
      y: (state.leewardGate.left.y + state.leewardGate.right.y) / 2,
    }
  }

  private getStartHoldingPoint(state: RaceState): Vec2 {
    return {
      x: (state.startLine.pin.x + state.startLine.committee.x) / 2,
      y: Math.max(state.startLine.pin.y, state.startLine.committee.y) + 80,
    }
  }

  private isNear(a: Vec2, b: Vec2, radius: number) {
    return distanceBetween(a, b) <= radius
  }

  private bearingTo(from: Vec2, to: Vec2) {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const rad = Math.atan2(dx, -dy)
    return normalizeDeg((rad * 180) / Math.PI)
  }

  private noise(profile: NonNullable<BoatState['ai']>) {
    const spread = (1 - profile.accuracy) * 8
    return (Math.random() - 0.5) * spread
  }
}

