import { Client, type Room } from 'colyseus.js'
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

type ColyseusStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

type HostCommand =
  | { kind: 'arm'; seconds?: number }
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

  private sessionId?: string

  private endpoint: string

  private reconnectionToken?: string
  private intentionalLeave = false
  private reconnectInFlight?: Promise<void>

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

  async connect(options?: { role?: Exclude<RaceRole, 'host'>; joinExisting?: boolean }) {
    this.emitStatus('connecting')
    this.intentionalLeave = false
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
    // Use joinById for existing rooms, joinOrCreate for creating new rooms
    if (options?.joinExisting !== false && this.roomId && this.roomId !== 'race_room') {
      // Try to join existing room by ID
      try {
        this.room = await this.client.joinById<RaceRoomSchema>(this.roomId, joinOptions)
      } catch (err) {
        if (appEnv.debugNetLogs) {
          console.info('[ColyseusBridge]', 'room not found', { roomId: this.roomId, err })
        }
        this.emitStatus('error')
        throw err
      }
    } else {
      // Create or join room type directly
      this.room = await this.client.joinOrCreate<RaceRoomSchema>('race_room', joinOptions)
    }
    this.sessionId = this.room.sessionId
    this.reconnectionToken = (this.room as unknown as { reconnectionToken?: string })
      .reconnectionToken
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
    this.intentionalLeave = true
    this.reconnectionToken = undefined
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

  sendProtestCommand(command: {
    kind: 'file' | 'revoke' | 'judge_clear'
    targetBoatId: string
  }) {
    if (!this.room) return
    this.room.send('protest_command', command)
  }

  private attachHandlers(room: Room<RaceRoomSchema>) {
    const pushState = () => {
      const next = room.state?.race?.toJSON?.()
      if (!next) return
      // Defensive: ensure a new object reference per patch so React subscribers update reliably.
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
    room.onLeave(() => {
      if (appEnv.debugNetLogs) {
        console.info('[ColyseusBridge]', 'room leave event')
      }
      if (this.intentionalLeave) {
        this.emitStatus('disconnected')
        return
      }
      void this.tryReconnect()
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

  private async tryReconnect() {
    if (this.reconnectInFlight) return this.reconnectInFlight
    const token = this.reconnectionToken
    if (!token) {
      this.emitStatus('disconnected')
      return
    }

    this.reconnectInFlight = (async () => {
      const delaysMs = [0, 500, 1000, 2000, 5000, 8000]
      for (const delay of delaysMs) {
        if (delay) {
          await new Promise((r) => setTimeout(r, delay))
        }
        if (appEnv.debugNetLogs) {
          console.info('[ColyseusBridge]', 'reconnect attempt', { delay })
        }
        this.emitStatus('connecting')
        try {
          const nextRoom = (await (this.client as unknown as {
            reconnect: <T>(reconnectionToken: string) => Promise<Room<T>>
          }).reconnect<RaceRoomSchema>(token)) as Room<RaceRoomSchema>

          this.room = nextRoom
          this.sessionId = nextRoom.sessionId
          this.reconnectionToken = (nextRoom as unknown as { reconnectionToken?: string })
            .reconnectionToken ?? this.reconnectionToken
          this.attachHandlers(nextRoom)
          this.emitStatus('connected')
          return
        } catch (err) {
          if (appEnv.debugNetLogs) {
            console.warn('[ColyseusBridge]', 'reconnect failed', err)
          }
        }
      }
      this.emitStatus('disconnected')
    })().finally(() => {
      this.reconnectInFlight = undefined
    })

    return this.reconnectInFlight
  }
}
