type PresencePayload = {
  clientId: string
  status: 'online' | 'offline'
  name?: string
  role?: RaceRole
  boatId?: string
}
import { HostLoop } from '@/host/loop'
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
import { normalizeDeg } from '@/logic/physics'

const createEventId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `event-${Date.now()}-${Math.random().toString(16).slice(2)}`

export class HostController extends BaseController {
  private loop: HostLoop

  private publishTimer?: number

  private lastInputTs = new Map<string, number>()

  private activeSpins = new Map<string, number[]>()

  constructor(private store: RaceStore = raceStore) {
    super()
    this.loop = new HostLoop(this.store, undefined, undefined, {
      onEvents: (events) => this.publishEvents(events),
      onTick: (state, events) => replayRecorder.recordFrame(state, events),
    })
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
  }

  protected onStop() {
    this.loop.stop()
    if (this.publishTimer) clearInterval(this.publishTimer)
    this.cancelActiveSpins()
    this.mqtt.publish(hostTopic, null, { retain: true })
  }

  private async claimHost() {
    this.mqtt.publish(
      hostTopic,
      { clientId: identity.clientId, updatedAt: Date.now() },
      { retain: true },
    )
  }

  updateLocalInput(update: { desiredHeadingDeg?: number; spin?: 'full' }) {
    const now = Date.now()
    if (update.spin === 'full') {
      const boat = this.store.getState().boats[identity.boatId]
      const heading = boat?.desiredHeadingDeg ?? boat?.headingDeg ?? 0
      const payload: PlayerInput = {
        boatId: identity.boatId,
        desiredHeadingDeg: heading,
        spin: 'full',
        tClient: now,
      }
      console.debug('[inputs] sent', payload)
      this.mqtt.publish(inputsTopic(payload.boatId), payload, { qos: 0 })
      return
    }
    if (typeof update.desiredHeadingDeg !== 'number') return
    const payload: PlayerInput = {
      boatId: identity.boatId,
      desiredHeadingDeg: update.desiredHeadingDeg,
      tClient: now,
    }
    console.debug('[inputs] sent', payload)
    this.mqtt.publish(inputsTopic(payload.boatId), payload, { qos: 0 })
  }

  private startStatePublisher() {
    const intervalMs = 100
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
    })
  }

  private handlePresence(payload?: PresencePayload) {
    const boatId = payload?.boatId
    const name = payload?.name
    if (!boatId || !name) return
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
    const lastTs = this.lastInputTs.get(input.boatId)
    if (lastTs === input.tClient) return
    this.lastInputTs.set(input.boatId, input.tClient)

    if (input.spin === 'full') {
      console.debug('[inputs] spin requested', input)
      this.queueSpin(input.boatId)
      return
    }

    if (this.activeSpins.has(input.boatId)) {
      return
    }

    if (typeof input.desiredHeadingDeg !== 'number') {
      return
    }

    console.debug('[inputs] received', {
      boatId: input.boatId,
      desiredHeadingDeg: input.desiredHeadingDeg,
      tClient: input.tClient,
    })
    this.store.upsertInput(input)
  }

  private queueSpin(boatId: string) {
    if (this.activeSpins.has(boatId)) return
    const state = this.store.getState()
    const boat = state.boats[boatId]
    if (!boat) return
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
    const payload: PlayerInput = {
      boatId,
      desiredHeadingDeg: normalizeDeg(heading),
      tClient: Date.now(),
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

