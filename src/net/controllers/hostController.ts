import { HostLoop } from '@/host/loop'
import {
  inputsWildcard,
  stateTopic,
  eventsTopic,
  hostTopic,
  chatTopic,
} from '@/net/topics'
import { BaseController } from './baseController'
import { raceStore, RaceStore } from '@/state/raceStore'
import type { ChatMessage, PlayerInput, RaceEvent } from '@/types/race'
import { identity } from '@/net/identity'
import { replayRecorder } from '@/replay/manager'
import { appEnv } from '@/config/env'

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
    this.startStatePublisher()
  }

  protected onStop() {
    this.loop.stop()
    if (this.publishTimer) clearInterval(this.publishTimer)
  }

  private async claimHost() {
    if (appEnv.clientRole !== 'host') {
      return
    }
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
}

