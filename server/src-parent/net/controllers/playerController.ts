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
import { quantizeHeading } from '@/logic/physics'

type HostAnnouncement = { clientId: string; updatedAt: number }
type PresencePayload = {
  clientId: string
  status: 'online' | 'offline'
  name?: string
  role?: RaceRole
}

const formatHeadingLabel = (deg?: number) =>
  typeof deg === 'number' ? `${quantizeHeading(deg)}°` : 'n/a'

export class PlayerController extends SubscriberController {
  private currentInput: PlayerInput = {
    boatId: identity.boatId,
    desiredHeadingDeg: 0,
    tClient: Date.now(),
    seq: 0,
  }

  private failoverTimer?: number

  private lastStateMs = Date.now()

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
    this.failoverTimer = window.setInterval(() => this.checkFailover(), 1000)
  }

  protected onStop() {
    super.onStop()
    if (this.failoverTimer) clearInterval(this.failoverTimer)
  }

  updateLocalInput(update: ControlUpdate) {
    const seq =
      update.clientSeq ??
      (typeof this.currentInput.seq === 'number' ? this.currentInput.seq + 1 : 1)
    const timestamp = Date.now()
    const payload: PlayerInput = {
      boatId: identity.boatId,
      tClient: timestamp,
      seq,
    }

    if (update.spin === 'full') {
      payload.spin = 'full'
      payload.desiredHeadingDeg = this.currentInput.desiredHeadingDeg
    } else {
      if (
        typeof update.absoluteHeadingDeg !== 'number' &&
        typeof update.desiredHeadingDeg !== 'number' &&
        typeof update.deltaHeadingDeg !== 'number'
      ) {
        return
      }
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

    console.debug('[inputs] sent', {
      ...payload,
      headingText: formatHeadingLabel(payload.desiredHeadingDeg ?? payload.absoluteHeadingDeg),
    })
    this.mqtt.publish(inputsTopic(identity.boatId), payload, { qos: 0 })
    this.currentInput = {
      ...this.currentInput,
      desiredHeadingDeg: payload.desiredHeadingDeg ?? this.currentInput.desiredHeadingDeg,
      tClient: timestamp,
      seq,
    }
    this.store.upsertInput(this.currentInput)
  }

  protected onState(snapshot: RaceState) {
    this.lastStateMs = Date.now()
    super.onState(snapshot)
    const boat = snapshot.boats[identity.boatId]
    if (boat) {
      const desiredHeading = quantizeHeading(boat.desiredHeadingDeg ?? boat.headingDeg)
      this.currentInput = {
        ...this.currentInput,
        desiredHeadingDeg: desiredHeading,
        seq: boat.lastInputSeq ?? this.currentInput.seq,
      }
      this.store.upsertInput(this.currentInput)
    }
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

