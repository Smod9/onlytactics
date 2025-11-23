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
  inputsWildcard,
  stateTopic,
  eventsTopic,
  hostTopic,
  chatTopic,
  presenceWildcard,
} from '@/net/topics'
import { BaseController } from './baseController'
import { raceStore, RaceStore } from '@/state/raceStore'
import type { ChatMessage, PlayerInput, RaceEvent, RaceRole } from '@/types/race'
import { identity } from '@/net/identity'
import { replayRecorder } from '@/replay/manager'

export class HostController extends BaseController {
  private loop: HostLoop

  private publishTimer?: number

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
        this.store.upsertInput(input),
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
    this.mqtt.publish(hostTopic, null, { retain: true })
  }

  private async claimHost() {
    this.mqtt.publish(
      hostTopic,
      { clientId: identity.clientId, updatedAt: Date.now() },
      { retain: true },
    )
  }

  updateLocalInput(update: { desiredHeadingDeg: number }) {
    this.store.upsertInput({
      boatId: identity.boatId,
      desiredHeadingDeg: update.desiredHeadingDeg,
      tClient: Date.now(),
    })
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
}

