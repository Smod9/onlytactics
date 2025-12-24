import { useSyncExternalStore } from 'react'
import type { RaceRole } from '@/types/race'
import { raceStore } from './raceStore'

export type RosterEntry = {
  clientId: string
  name: string
  role: RaceRole | 'unknown'
  status: 'online' | 'offline'
  lastSeen: number
}

type Snapshot = {
  hostId?: string
  entries: RosterEntry[]
}

class RosterStore {
  private listeners = new Set<() => void>()

  private entries = new Map<string, RosterEntry>()

  private hostId?: string
  private hostBoatId?: string

  private snapshot: Snapshot = { hostId: undefined, entries: [] }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): Snapshot => this.snapshot

  updateFromRaceState() {
    const state = raceStore.getState()
    this.hostId = state.hostId
    this.hostBoatId = state.hostBoatId
    this.entries.clear()
    Object.entries(state.boats).forEach(([boatId, boat]) => {
      this.entries.set(boatId, {
        clientId: boatId,
        name: boat.name,
        role: 'player',
        status: 'online',
        lastSeen: Date.now(),
      })
    })
    this.emit()
  }

  private emit() {
    const entries = Array.from(this.entries.values())
      .filter((entry) => entry.status === 'online')
      .map((entry) => ({
        ...entry,
        role:
          entry.clientId === this.hostBoatId || entry.clientId === this.hostId
            ? 'host'
            : entry.role,
      }))
    entries.sort((a, b) => {
      if (a.role === 'host') return -1
      if (b.role === 'host') return 1
      if (a.status !== b.status) return a.status === 'online' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    this.snapshot = { hostId: this.hostId, entries }
    this.listeners.forEach((listener) => listener())
  }
}

export const rosterStore = new RosterStore()

let started = false

export const startRosterWatcher = async () => {
  if (started) return
  started = true
  raceStore.subscribe(() => rosterStore.updateFromRaceState())
  rosterStore.updateFromRaceState()
}

export const useRoster = () =>
  useSyncExternalStore(rosterStore.subscribe, rosterStore.getSnapshot)
