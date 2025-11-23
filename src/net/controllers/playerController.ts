import { appEnv } from '@/config/env'
import { identity } from '@/net/identity'
import {
  hostTopic,
  inputsTopic,
  presenceWildcard,
} from '@/net/topics'
import { SubscriberController } from './subscriberController'
import type { PlayerInput, RaceRole, RaceState } from '@/types/race'
import type { ControlUpdate } from './types'
import type { RaceStore } from '@/state/raceStore'

type HostAnnouncement = { clientId: string; updatedAt: number }
type PresencePayload = {
  clientId: string
  status: 'online' | 'offline'
  name?: string
  role?: RaceRole
}

export class PlayerController extends SubscriberController {
  private currentInput: PlayerInput = {
    boatId: identity.boatId,
    desiredHeadingDeg: 0,
    tClient: Date.now(),
  }

  private inputTimer?: number

  private failoverTimer?: number

  private lastStateMs = Date.now()

  private lastPublished?: PlayerInput

  private currentHostId?: string

  private hostOnline = false

  private presenceMap = new Map<string, PresencePayload['status']>()

  constructor(
    private onPromote?: () => void,
    store?: RaceStore,
  ) {
    super(store)
  }

  protected onStart() {
    super.onStart()
    this.track(
      this.mqtt.subscribe<HostAnnouncement>(hostTopic, (payload) =>
        this.handleHostAnnouncement(payload),
      ),
    )
    this.track(
      this.mqtt.subscribe<PresencePayload>(presenceWildcard, (payload) =>
        this.handlePresence(payload),
      ),
    )
    this.inputTimer = window.setInterval(() => this.flushInput(), 100)
    this.failoverTimer = window.setInterval(() => this.checkFailover(), 1000)
  }

  protected onStop() {
    super.onStop()
    if (this.inputTimer) clearInterval(this.inputTimer)
    if (this.failoverTimer) clearInterval(this.failoverTimer)
  }

  updateLocalInput(update: ControlUpdate) {
    if (update.spin === 'full') {
      const payload: PlayerInput = {
        boatId: identity.boatId,
        desiredHeadingDeg: this.currentInput.desiredHeadingDeg,
        spin: 'full',
        tClient: Date.now(),
      }
      console.debug('[inputs] sent', payload)
      this.mqtt.publish(inputsTopic(identity.boatId), payload, { qos: 0 })
      this.lastPublished = undefined
      return
    }
    if (typeof update.desiredHeadingDeg !== 'number') {
      return
    }
    this.currentInput = {
      ...this.currentInput,
      desiredHeadingDeg: update.desiredHeadingDeg,
      tClient: Date.now(),
    }
    this.store.upsertInput(this.currentInput)
  }

  protected onState(snapshot: RaceState) {
    this.lastStateMs = Date.now()
    super.onState(snapshot)
    const boat = snapshot.boats[identity.boatId]
    if (boat) {
      this.currentInput = {
        ...this.currentInput,
        desiredHeadingDeg: boat.desiredHeadingDeg ?? boat.headingDeg,
      }
      this.lastPublished = { ...this.currentInput }
      this.store.upsertInput(this.currentInput)
    }
  }

  private flushInput() {
    const hasChanged =
      !this.lastPublished ||
      this.lastPublished.boatId !== this.currentInput.boatId ||
      this.lastPublished.desiredHeadingDeg !== this.currentInput.desiredHeadingDeg

    if (!hasChanged) return

    this.lastPublished = { ...this.currentInput }
    console.debug('[inputs] sent', this.currentInput)
    this.mqtt.publish(inputsTopic(this.currentInput.boatId), this.currentInput, { qos: 0 })
  }

  private handleHostAnnouncement(payload?: HostAnnouncement) {
    this.currentHostId = payload?.clientId
    this.watchHostPresence()
    if (!payload && this.canPromote()) {
      this.onPromote?.()
    }
  }

  private watchHostPresence() {
    if (!this.currentHostId) {
      this.hostOnline = false
      return
    }
    const status = this.presenceMap.get(this.currentHostId)
    if (!status) {
      this.hostOnline = true
      return
    }
    this.hostOnline = status === 'online'
  }

  private handlePresence(payload?: PresencePayload) {
    if (!payload) {
      return
    }
    this.presenceMap.set(payload.clientId, payload.status)
    if (payload.clientId === this.currentHostId) {
      this.hostOnline = payload.status === 'online'
    }
  }

  private checkFailover() {
    if (!this.currentHostId) {
      if (this.canPromote()) {
        this.onPromote?.()
      }
      return
    }
    if (Date.now() - this.lastStateMs < appEnv.hostFailoverMs) return
    if (this.hostOnline) return
    if (!this.canPromote()) return

    const onlineCandidates = [...this.presenceMap.entries()]
      .filter(([, status]) => status === 'online')
      .map(([id]) => id)
    if (!onlineCandidates.includes(identity.clientId)) {
      onlineCandidates.push(identity.clientId)
    }
    onlineCandidates.sort()
    if (onlineCandidates[0] !== identity.clientId) return
    this.onPromote?.()
  }

  private canPromote() {
    return false
  }
}

