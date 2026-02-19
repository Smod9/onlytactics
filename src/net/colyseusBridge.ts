import { Client, type Room } from '@colyseus/sdk'
import { raceStore } from '@/state/raceStore'
import { rosterStore } from '@/state/rosterStore'
import type {
  ChatMessage,
  PlayerInput,
  RaceEvent,
  RaceRole,
  RaceState,
} from '@/types/race'
import { identity, setBoatId } from '@/net/identity'
import { appEnv } from '@/config/env'
import { cloneRaceState } from '@/state/factories'
import { patchRateStore } from '@/state/patchRateStore'

type ColyseusStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export type StatsSavedPayload = {
  success: boolean
  raceId?: string
  scored?: boolean
  error?: string
}

type HostCommand =
  | { kind: 'arm'; seconds?: number }
  | { kind: 'finish_race' }
  | { kind: 'confirm_results'; scored: boolean; dnfMode: 'dnf' | 'position'; leaderboard?: string[] }
  | { kind: 'reset' }
  | { kind: 'pause'; paused: boolean }
  | { kind: 'wind_field'; enabled: boolean }
  | { kind: 'debug_set_pos'; boatId: string; x: number; y: number }
  | { kind: 'debug_lap'; boatId: string }
  | { kind: 'debug_finish'; boatId: string }
  | { kind: 'debug_warp'; boatId: string }

type RaceRoomSchema = {
  race: {
    toJSON: () => RaceState
  }
}

export class ColyseusBridge {
  private client: Client

  private room?: Room<RaceRoomSchema>

  private statusListeners = new Set<(status: ColyseusStatus) => void>()
  private chatListeners = new Set<(message: ChatMessage) => void>()
  private roleListeners = new Set<(role: Exclude<RaceRole, 'host'>) => void>()
  private roomClosedListeners = new Set<(payload: { reason?: string }) => void>()
  private statsSavedListeners = new Set<(payload: StatsSavedPayload) => void>()

  private sessionId?: string

  private endpoint: string

  constructor(
    endpoint: string,
    private roomId: string,
  ) {
    this.endpoint = endpoint
    this.client = new Client(endpoint)
  }

  onStatusChange(listener: (status: ColyseusStatus) => void) {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  private emitStatus(status: ColyseusStatus) {
    this.statusListeners.forEach((listener) => listener(status))
  }

  onChatMessage(listener: (message: ChatMessage) => void) {
    this.chatListeners.add(listener)
    return () => this.chatListeners.delete(listener)
  }

  onRoleAssignment(listener: (role: Exclude<RaceRole, 'host'>) => void) {
    this.roleListeners.add(listener)
    return () => this.roleListeners.delete(listener)
  }

  onRoomClosed(listener: (payload: { reason?: string }) => void) {
    this.roomClosedListeners.add(listener)
    return () => {
      this.roomClosedListeners.delete(listener)
    }
  }

  onStatsSaved(listener: (payload: StatsSavedPayload) => void) {
    this.statsSavedListeners.add(listener)
    return () => {
      this.statsSavedListeners.delete(listener)
    }
  }

  async connect(options?: { role?: Exclude<RaceRole, 'host'>; joinExisting?: boolean }) {
    this.emitStatus('connecting')
    if (appEnv.debugNetLogs) {
      console.info('[ColyseusBridge]', 'connect()', {
        endpoint: this.endpoint,
        roomId: this.roomId,
        joinExisting: options?.joinExisting,
      })
    }
    const joinOptions = {
      name: identity.clientName ?? 'Visitor',
      clientId: identity.clientId,
      role: options?.role,
    }
    // Use joinById whenever a concrete roomId is provided.
    if (this.roomId && this.roomId !== 'race_room') {
      // Try to join existing room by ID, with a few retries for matchmaker propagation.
      const maxAttempts = 5
      const retryDelayMs = 400
      let lastError: unknown
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          this.room = await this.client.joinById<RaceRoomSchema>(this.roomId, joinOptions)
          lastError = undefined
          break
        } catch (err) {
          lastError = err
          if (appEnv.debugNetLogs) {
            console.info('[ColyseusBridge]', 'joinById failed', {
              roomId: this.roomId,
              attempt,
              err,
            })
          }
          if (attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
          }
        }
      }
      if (!this.room) {
        this.emitStatus('error')
        throw lastError
      }
    } else {
      // Create or join room type directly
      this.room = await this.client.joinOrCreate<RaceRoomSchema>('race_room', joinOptions)
    }
    this.sessionId = this.room.sessionId
    if (appEnv.debugNetLogs) {
      console.info('[ColyseusBridge]', 'joined room', {
        sessionId: this.sessionId,
      })
    }
    this.attachHandlers(this.room)
    this.emitStatus('connected')
  }

  disconnect() {
    if (appEnv.debugNetLogs) {
      console.info('[ColyseusBridge]', 'disconnect()')
    }
    void this.room?.leave()
    this.room = undefined
    this.sessionId = undefined
    this.emitStatus('disconnected')
  }

  getSessionId() {
    return this.sessionId
  }

  sendInput(input: PlayerInput) {
    if (!this.room) return
    this.room.send('input', {
      ...input,
      boatId: input.boatId ?? identity.boatId,
    })
  }

  sendHostCommand(command: HostCommand) {
    if (!this.room) return
    if (appEnv.debugNetLogs) {
      console.info('[ColyseusBridge]', 'sendHostCommand', command)
    }
    this.room.send('host_command', command)
  }

  sendChat(text: string) {
    if (!this.room) return
    this.room.send('chat', { text })
  }

  sendRelinquishHost() {
    if (!this.room) return
    this.room.send('relinquish_host', {})
  }

  sendProtestCommand(command: {
    kind: 'file' | 'revoke' | 'judge_clear'
    targetBoatId: string
  }) {
    if (!this.room) return
    this.room.send('protest_command', command)
  }

  private attachHandlers(room: Room<RaceRoomSchema>) {
    let patchCount = 0
    let patchWindowStart = performance.now()
    const PATCH_LOG_INTERVAL_MS = 5000

    const pushState = () => {
      const next = room.state?.race?.toJSON?.()
      if (!next) return

      patchCount++
      const now = performance.now()
      const elapsed = now - patchWindowStart
      if (elapsed >= PATCH_LOG_INTERVAL_MS) {
        const hz = (patchCount / elapsed) * 1000
        if (appEnv.debugNetLogs) {
          console.info(`[ColyseusBridge] patches/sec: ${hz.toFixed(1)} (${patchCount} in ${(elapsed / 1000).toFixed(1)}s)`)
        }
        patchRateStore.setHz(hz)
        patchCount = 0
        patchWindowStart = now
      }

      raceStore.setState(cloneRaceState(next))
    }

    pushState()
    room.onStateChange(() => pushState())
    room.onMessage('boat_assignment', (payload: { boatId?: string | null }) => {
      if (payload?.boatId) {
        if (appEnv.debugNetLogs) {
          console.info('[ColyseusBridge]', 'boat assignment', payload.boatId)
        }
        setBoatId(payload.boatId)
      }
    })
    room.onMessage('chat', (payload: ChatMessage) => {
      this.chatListeners.forEach((listener) => listener(payload))
    })
    room.onMessage(
      'roster',
      (payload: {
        entries?: Array<{
          clientId: string
          name: string
          role: RaceRole
          boatId?: string | null
        }>
      }) => {
        rosterStore.updateFromServerRoster(payload?.entries ?? [])
      },
    )
    room.onMessage('events', (payload: RaceEvent[]) => {
      if (Array.isArray(payload) && payload.length) {
        raceStore.appendEvents(payload)
      }
    })
    room.onMessage('role_assignment', (payload: { role?: Exclude<RaceRole, 'host'> }) => {
      const role = payload?.role
      if (!role) return
      if (appEnv.debugNetLogs) {
        console.info('[ColyseusBridge]', 'role assignment', role)
      }
      this.roleListeners.forEach((listener) => listener(role))
    })
    room.onMessage('room_closed', (payload: { reason?: string }) => {
      this.roomClosedListeners.forEach((listener) => listener(payload ?? {}))
    })
    room.onMessage('stats_saved', (payload: StatsSavedPayload) => {
      this.statsSavedListeners.forEach((listener) => listener(payload ?? {}))
    })
    room.onDrop((code, reason) => {
      if (appEnv.debugNetLogs) {
        console.info('[ColyseusBridge]', 'connection dropped, SDK reconnecting', { code, reason })
      }
      this.emitStatus('connecting')
    })
    room.onReconnect(() => {
      if (appEnv.debugNetLogs) {
        console.info('[ColyseusBridge]', 'reconnected successfully')
      }
      this.sessionId = room.sessionId
      this.emitStatus('connected')
    })
    room.onLeave((code, reason) => {
      if (appEnv.debugNetLogs) {
        console.info('[ColyseusBridge]', 'room leave event', { code, reason })
      }
      this.emitStatus('disconnected')
    })
    room.onError((code) => {
      console.error('[colyseus] room error', code)
      this.emitStatus('error')
    })

    // Ensure we get the roster even if the server broadcast happened before handlers attached.
    try {
      room.send('roster_request', {})
    } catch {
      // ignore
    }
  }

}
