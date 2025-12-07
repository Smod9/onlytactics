import type { PlayerInput, RaceEvent, RaceState } from '@/types/race'
import { cloneRaceState, createInitialRaceState } from '../../../src/state/factories'
import { appEnv } from '../config/serverEnv'

export class RaceStore {
  private state: RaceState

  private latestInputs: Record<string, PlayerInput> = {}

  private recentEvents: RaceEvent[] = []

  constructor(initialState: RaceState = createInitialRaceState(appEnv.raceId)) {
    this.state = cloneRaceState(initialState)
  }

  getState = () => this.state

  setHostBoat = (boatId?: string) => {
    this.state.hostBoatId = boatId ?? undefined
  }

  getHostBoat = () => this.state.hostBoatId

  setState = (next: RaceState) => {
    this.state = cloneRaceState(next)
  }

  reset = (next: RaceState) => {
    this.state = cloneRaceState(next)
    this.latestInputs = {}
    this.recentEvents = []
  }

  upsertInput = (input: PlayerInput) => {
    this.latestInputs[input.boatId] = input
  }

  consumeInputs = () => {
    const snapshot = { ...this.latestInputs }
    this.latestInputs = {}
    return snapshot
  }

  appendEvents = (events: RaceEvent[]) => {
    if (!events.length) return
    this.recentEvents = [...this.recentEvents.slice(-20), ...events]
  }
}

export const raceStore = new RaceStore()

