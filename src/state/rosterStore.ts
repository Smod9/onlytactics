import { useSyncExternalStore } from 'react'
import type { RaceRole } from '@/types/race'
import { mqttClient } from '@/net/mqttClient'
import { hostTopic, presenceWildcard } from '@/net/topics'

type PresenceMessage = {
  clientId: string
  status: 'online' | 'offline'
  name?: string
  role?: RaceRole
}

type HostAnnouncement = { clientId: string; updatedAt: number }

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

  private snapshot: Snapshot = { hostId: undefined, entries: [] }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): Snapshot => this.snapshot

  updatePresence(message?: PresenceMessage) {
    if (!message) return
    if (message.status === 'offline') {
      if (this.entries.delete(message.clientId)) {
        this.emit()
      }
      return
    }
    const existing = this.entries.get(message.clientId)
    const entry: RosterEntry = {
      clientId: message.clientId,
      name: message.name ?? existing?.name ?? 'Unknown',
      role: message.role ?? existing?.role ?? 'unknown',
      status: 'online',
      lastSeen: Date.now(),
    }
    this.entries.set(message.clientId, entry)
    this.emit()
  }

  updateHost(clientId?: string) {
    this.hostId = clientId
    this.emit()
  }

  private emit() {
    const entries = Array.from(this.entries.values())
      .filter((entry) => entry.status === 'online')
      .map((entry) => ({
        ...entry,
        role: entry.clientId === this.hostId ? 'host' : entry.role,
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
  await mqttClient.connect()
  mqttClient.subscribe<PresenceMessage>(presenceWildcard, (payload) => {
    rosterStore.updatePresence(payload)
  })
  mqttClient.subscribe<HostAnnouncement>(hostTopic, (payload) => {
    rosterStore.updateHost(payload?.clientId)
  })
  injectAiEntries()
}

const injectAiEntries = () => {
  const aiNames = ['Dennis', 'Terry']
  aiNames.forEach((name) => {
    const clientId = `ai-${name.toLowerCase()}`
    rosterStore.updatePresence({
      clientId,
      status: 'online',
      name: `${name} (AI)`,
      role: 'player',
    })
  })
}

export const useRoster = () =>
  useSyncExternalStore(rosterStore.subscribe, rosterStore.getSnapshot)
