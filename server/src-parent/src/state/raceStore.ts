import { appEnv } from '@/config/env'
import type { ChatMessage, PlayerInput, RaceEvent, RaceState } from '@/types/race'
import { cloneRaceState, createInitialRaceState } from './factories'

type Listener = () => void

type InputLatency = {
  boatId: string
  seq: number
  latencyMs: number
  updatedAt: number
}

export type InputTelemetrySnapshot = Record<string, InputLatency>

export class RaceStore {
  private state: RaceState

  private listeners = new Set<Listener>()

  private telemetryListeners = new Set<Listener>()

  private latestInputs: Record<string, PlayerInput> = {}

  private recentEvents: RaceEvent[] = []

  private chatLog: ChatMessage[] = []

  private inputTelemetry: Record<string, InputLatency> = {}

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

  subscribeTelemetry = (listener: Listener) => {
    this.telemetryListeners.add(listener)
    return () => this.telemetryListeners.delete(listener)
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
    const nextEvents: RaceEvent[] = []
    events.forEach((event) => {
      if (
        this.recentEvents.some(
          (existing) =>
            existing.kind === event.kind &&
            existing.message === event.message &&
            Math.abs(existing.t - event.t) < 0.5,
        )
      ) {
        return
      }
      nextEvents.push(event)
    })
    if (!nextEvents.length) return
    this.recentEvents = [...this.recentEvents.slice(-20), ...nextEvents]
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

  recordInputLatency = (boatId: string, seq: number, latencyMs: number) => {
    this.inputTelemetry[boatId] = {
      boatId,
      seq,
      latencyMs,
      updatedAt: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    }
    this.emitTelemetry()
  }

  getInputTelemetry = () => this.inputTelemetry

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

  private emitTelemetry() {
    this.telemetryListeners.forEach((listener) => listener())
  }
}

export const raceStore = new RaceStore(createInitialRaceState(appEnv.raceId))

