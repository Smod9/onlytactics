import { eventsTopic, stateTopic } from '@/net/topics'
import { BaseController } from './baseController'
import type { RaceState, RaceEvent } from '@/types/race'
import { raceStore, RaceStore } from '@/state/raceStore'

export class SubscriberController extends BaseController {
  constructor(protected store: RaceStore = raceStore) {
    super()
  }

  protected onStart() {
    this.track(
      this.mqtt.subscribe<RaceState>(stateTopic, (snapshot) =>
        this.onState(snapshot),
      ),
    )

    this.track(
      this.mqtt.subscribe<RaceEvent>(eventsTopic, (event) =>
        this.store.appendEvents([event]),
      ),
    )
  }

  protected onState(snapshot: RaceState) {
    this.store.setState(snapshot)
  }
}

