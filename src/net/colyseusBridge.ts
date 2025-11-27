import { Client, type Room } from 'colyseus.js'
import { raceStore } from '@/state/raceStore'
import type { ChatMessage, PlayerInput, RaceState } from '@/types/race'
import { identity, setBoatId } from '@/net/identity'
import { appEnv } from '@/config/env'

type ColyseusStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

type HostCommand =
  | { kind: 'arm'; seconds?: number }
  | { kind: 'reset' }

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

  private sessionId?: string

  private endpoint: string

  constructor(endpoint: string, private roomId: string) {
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

  async connect() {
    this.emitStatus('connecting')
    if (appEnv.debugNetLogs) {
      console.info('[ColyseusBridge]', 'connect()', {
        endpoint: this.endpoint,
        roomId: this.roomId,
      })
    }
    this.room = await this.client.joinOrCreate<RaceRoomSchema>(this.roomId, {
      name: identity.clientName ?? 'Visitor',
      clientId: identity.clientId,
    })
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

  private attachHandlers(room: Room<RaceRoomSchema>) {
    const pushState = () => {
      const next = room.state?.race?.toJSON?.()
      if (!next) return
      raceStore.setState(next)
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
    room.onLeave(() => {
      if (appEnv.debugNetLogs) {
        console.info('[ColyseusBridge]', 'room leave event')
      }
      this.emitStatus('disconnected')
    })
    room.onError((code) => {
      console.error('[colyseus] room error', code)
      this.emitStatus('error')
    })
  }
}

