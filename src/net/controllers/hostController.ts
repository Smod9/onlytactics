import { HostLoop } from '@/host/loop'
import { AiManager } from '@/ai/manager'
import { appEnv } from '@/config/env'
import { createBoatState } from '@/state/factories'
import {
  inputsTopic,
  inputsWildcard,
  stateTopic,
  eventsTopic,
  hostTopic,
  chatTopic,
  presenceWildcard,
} from '@/net/topics'
import { BaseController } from './baseController'
import type { ControlUpdate } from './types'
import { raceStore, RaceStore } from '@/state/raceStore'
import type {
  ChatMessage,
  PlayerInput,
  RaceEvent,
  RaceRole,
} from '@/types/race'
import { identity } from '@/net/identity'
import { replayRecorder } from '@/replay/manager'
import { SPIN_HOLD_SECONDS } from '@/logic/constants'
import { normalizeDeg, quantizeHeading } from '@/logic/physics'

type PresencePayload = {
  clientId: string
  status: 'online' | 'offline'
  name?: string
  role?: RaceRole
  boatId?: string
}

const createEventId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `event-${Date.now()}-${Math.random().toString(16).slice(2)}`

export class HostController extends BaseController {
  private loop: HostLoop

  private publishTimer?: number

  private lastInputTs = new Map<string, number>()
  private lastInputSeq = new Map<string, number>()

  private activeSpins = new Map<string, number[]>()
  private localSeq = new Map<string, number>()
  private aiManager?: AiManager

  constructor(private store: RaceStore = raceStore) {
    super()
    this.loop = new HostLoop(this.store, undefined, undefined, {
      onEvents: (events) => this.publishEvents(events),
      onTick: (state, events) => replayRecorder.recordFrame(state, events),
    })
    if (appEnv.aiEnabled) {
      this.aiManager = new AiManager(
        this.store,
        (boatId, update) => this.sendInputForBoat(boatId, update),
        (boatId) => this.queueSpin(boatId),
      )
    }
  }

  protected async onStart() {
    await this.claimHost()
    replayRecorder.reset()
    replayRecorder.start(this.store.getState())
    this.loop.start()
    this.track(
      this.mqtt.subscribe<PlayerInput>(inputsWildcard, (input) =>
        this.handleInput(input),
      ),
    )
    this.track(
      this.mqtt.subscribe<ChatMessage>(chatTopic, (message) =>
        replayRecorder.addChat(message),
      ),
    )
    this.track(
      this.mqtt.subscribe<PresencePayload>(presenceWildcard, (payload) =>
        this.handlePresence(payload),
      ),
    )
    this.startStatePublisher()
    this.aiManager?.start()
  }

  protected onStop() {
    this.loop.stop()
    if (this.publishTimer) clearInterval(this.publishTimer)
    this.cancelActiveSpins()
    this.aiManager?.stop()
    this.mqtt.publish(hostTopic, null, { retain: true })
    this.store.patchState((draft) => {
      if (draft.hostId === identity.clientId) {
        draft.hostId = undefined
      }
    })
  }

  private async claimHost() {
    this.mqtt.publish(
      hostTopic,
      { clientId: identity.clientId, updatedAt: Date.now() },
      { retain: true },
    )
    this.store.patchState((draft) => {
      draft.hostId = identity.clientId
    })
  }

  updateLocalInput(update: ControlUpdate) {
    this.sendInputForBoat(identity.boatId, update)
  }

  private sendInputForBoat(boatId: string, update: ControlUpdate) {
    const seq = update.clientSeq ?? this.bumpLocalSeq(boatId)
    const timestamp = Date.now()
    const payload: PlayerInput = {
      boatId,
      tClient: timestamp,
      seq,
    }
    if (update.spin === 'full') {
      const boat = this.store.getState().boats[boatId]
      const heading = quantizeHeading(boat?.desiredHeadingDeg ?? boat?.headingDeg ?? 0)
      payload.spin = 'full'
      payload.absoluteHeadingDeg = heading
      payload.desiredHeadingDeg = heading
    } else {
      const absolute =
        typeof update.absoluteHeadingDeg === 'number'
          ? quantizeHeading(update.absoluteHeadingDeg)
          : typeof update.desiredHeadingDeg === 'number'
            ? quantizeHeading(update.desiredHeadingDeg)
            : undefined
      if (typeof absolute === 'number') {
        payload.absoluteHeadingDeg = absolute
        payload.desiredHeadingDeg = absolute
      }
      if (typeof update.deltaHeadingDeg === 'number') {
        payload.deltaHeadingDeg = update.deltaHeadingDeg
      }
      if (
        typeof payload.absoluteHeadingDeg !== 'number' &&
        typeof payload.deltaHeadingDeg !== 'number'
      ) {
        return
      }
    }
    this.mqtt.publish(inputsTopic(payload.boatId), payload, { qos: 0 })
  }

  private bumpLocalSeq(boatId: string) {
    const next = (this.localSeq.get(boatId) ?? 0) + 1
    this.localSeq.set(boatId, next)
    return next
  }

  private startStatePublisher() {
    const intervalMs = appEnv.hostPublishIntervalMs
    this.publishTimer = window.setInterval(() => {
      this.mqtt.publish(stateTopic, this.store.getState())
    }, intervalMs)
  }

  private publishEvents(events: RaceEvent[]) {
    events.forEach((event) => this.mqtt.publish(eventsTopic, event))
  }

  armCountdown(seconds = 15) {
    this.store.patchState((draft) => {
      draft.countdownArmed = true
      draft.phase = 'prestart'
      draft.t = -seconds
      draft.clockStartMs = Date.now() + seconds * 1000
    })
  }

  private handlePresence(payload?: PresencePayload) {
    const boatId = payload?.boatId
    if (!boatId) return

    if (payload?.status === 'offline') {
      this.store.patchState((draft) => {
        if (draft.boats[boatId]) {
          delete draft.boats[boatId]
        }
      })
      this.lastInputSeq.delete(boatId)
      this.lastInputTs.delete(boatId)
      this.activeSpins.delete(boatId)
      this.localSeq.delete(boatId)
      return
    }

    const name = payload?.name
    if (!name) return
    this.store.patchState((draft) => {
      let boat = draft.boats[boatId]
      if (!boat) {
        const index = Object.keys(draft.boats).length
        boat = createBoatState(name, index, boatId)
        draft.boats[boatId] = boat
      } else {
        boat.name = name
      }
    })
  }

  private handleInput(input: PlayerInput) {
    const timestamp =
      typeof input.tClient === 'number' ? input.tClient : Number(input.tClient ?? 0)
    if (!Number.isFinite(timestamp)) return

    const seq = input.seq
    if (typeof seq === 'number') {
      const lastSeq = this.lastInputSeq.get(input.boatId)
      if (lastSeq === seq) {
        return
      }
      this.lastInputSeq.set(input.boatId, seq)
    } else {
      const lastTs = this.lastInputTs.get(input.boatId)
      if (lastTs === timestamp) return
      this.lastInputTs.set(input.boatId, timestamp)
    }

    if (input.spin === 'full') {
      console.debug('[inputs] spin requested', input)
      this.queueSpin(input.boatId)
      return
    }

    if (this.activeSpins.has(input.boatId)) {
      return
    }

    const state = this.store.getState()
    const boat = state.boats[input.boatId]
    const baseHeading = boat ? boat.desiredHeadingDeg ?? boat.headingDeg : undefined
    let desired: number | undefined
    if (typeof input.absoluteHeadingDeg === 'number') {
      desired = quantizeHeading(input.absoluteHeadingDeg)
    } else if (typeof input.deltaHeadingDeg === 'number' && typeof baseHeading === 'number') {
      desired = quantizeHeading(baseHeading + input.deltaHeadingDeg)
    } else if (typeof input.desiredHeadingDeg === 'number') {
      desired = quantizeHeading(input.desiredHeadingDeg)
    } else if (typeof baseHeading === 'number') {
      desired = quantizeHeading(baseHeading)
    }

    if (typeof desired !== 'number') {
      return
    }

    this.store.upsertInput({
      ...input,
      desiredHeadingDeg: desired,
      tClient: timestamp,
      seq: seq ?? input.seq ?? -1,
    })
  }

  private queueSpin(boatId: string) {
    if (this.activeSpins.has(boatId)) return
    const state = this.store.getState()
    const boat = state.boats[boatId]
    if (!boat) return
    this.store.patchState((draft) => {
      const target = draft.boats[boatId]
      if (target) target.rightsSuspended = true
    })
    const origin = boat.desiredHeadingDeg ?? boat.headingDeg
    const headings = [
      origin + 120,
      origin + 240,
      origin,
    ].map((deg) => normalizeDeg(deg))
    let delay = 0
    const timers: number[] = headings.map((heading, index) => {
      const timer = window.setTimeout(() => {
        this.injectHeading(boatId, heading)
        if (index === headings.length - 1) {
          this.finishSpin(boatId)
        }
      }, delay)
      delay += SPIN_HOLD_SECONDS * 1000
      return timer
    })
    this.activeSpins.set(boatId, timers)
  }

  private injectHeading(boatId: string, heading: number) {
    const seq = this.bumpLocalSeq(boatId)
    const normalized = normalizeDeg(heading)
    const payload: PlayerInput = {
      boatId,
      desiredHeadingDeg: normalized,
      absoluteHeadingDeg: normalized,
      tClient: Date.now(),
      seq,
    }
    this.lastInputTs.set(boatId, payload.tClient)
    console.debug('[inputs] spin step', payload)
    this.store.upsertInput(payload)
  }

  private finishSpin(boatId: string) {
    const timers = this.activeSpins.get(boatId)
    if (timers) {
      timers.forEach((timer) => clearTimeout(timer))
      this.activeSpins.delete(boatId)
    }
    this.store.patchState((draft) => {
      const boat = draft.boats[boatId]
      if (boat) boat.rightsSuspended = false
    })
    this.clearPenalty(boatId)
  }

  private clearPenalty(boatId: string) {
    let cleared = false
    let boatName: string | undefined
    let remaining = 0
    this.store.patchState((draft) => {
      const boat = draft.boats[boatId]
      if (!boat) return
      boatName = boat.name
      if (boat.penalties > 0) {
        boat.penalties -= 1
        cleared = true
      }
      boat.fouled = boat.penalties > 0
      remaining = boat.penalties
    })
    if (!cleared || !boatName) return
    const event: RaceEvent = {
      eventId: createEventId(),
      kind: 'rule_hint',
      ruleId: 'other',
      boats: [boatId],
      t: this.store.getState().t,
      message: `${boatName} completed a 360° spin and cleared a penalty (${remaining} remaining)`,
    }
    this.publishEvents([event])
  }

  private cancelActiveSpins() {
    this.activeSpins.forEach((timers) => timers.forEach((id) => clearTimeout(id)))
    this.activeSpins.clear()
  }
}

