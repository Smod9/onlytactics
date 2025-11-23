import { appEnv } from '@/config/env'
import type { ChatMessage, PlayerInput, RaceEvent, RaceState } from '@/types/race'
import { cloneRaceState, createBoatState, createInitialRaceState } from './factories'

type Listener = () => void

export class RaceStore {
  private state: RaceState

  private listeners = new Set<Listener>()

  private latestInputs: Record<string, PlayerInput> = {}

  private recentEvents: RaceEvent[] = []

  private chatLog: ChatMessage[] = []

  constructor(initialState: RaceState) {
    this.state = initialState
  }

  getState = () => this.state

  setState = (next: RaceState) => {
    this.state = next
    this.emit()
  }

  patchState = (mutator: (draft: RaceState) => void) => {
    const draft = cloneRaceState(this.state)
    mutator(draft)
    this.setState(draft)
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  upsertInput = (input: PlayerInput, name?: string) => {
    if (!this.state.boats[input.boatId]) {
      this.addBoat(input.boatId, name)
    } else if (name) {
      this.patchState((draft) => {
        const boat = draft.boats[input.boatId]
        if (boat) boat.name = name
      })
    }
    this.latestInputs[input.boatId] = input
  }

  consumeInputs = () => ({ ...this.latestInputs })

  appendEvents = (events: RaceEvent[]) => {
    if (!events.length) return
    this.recentEvents = [...this.recentEvents.slice(-20), ...events]
    this.emit()
  }

  setEvents = (events: RaceEvent[]) => {
    this.recentEvents = events
    this.emit()
  }

  getRecentEvents = () => this.recentEvents

  appendChat = (message: ChatMessage) => {
    if (this.chatLog.some((entry) => entry.messageId === message.messageId)) {
      return
    }
    this.chatLog = [...this.chatLog.slice(-199), message]
    this.emit()
  }

  getChatLog = () => this.chatLog

  reset = (state: RaceState) => {
    this.state = cloneRaceState(state)
    this.latestInputs = {}
    this.recentEvents = []
    this.chatLog = []
    this.emit()
  }

  private emit() {
    this.listeners.forEach((listener) => listener())
  }

  private addBoat(boatId: string, name?: string) {
    this.patchState((draft) => {
      const index = Object.keys(draft.boats).length
      const boatName = name ?? `Boat ${index + 1}`
      draft.boats[boatId] = createBoatState(boatName, index, boatId)
    })
  }
}

export const raceStore = new RaceStore(createInitialRaceState(appEnv.raceId))

