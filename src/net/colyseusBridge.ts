import { Client, type Room } from 'colyseus.js'
import { raceStore } from '@/state/raceStore'
import type { PlayerInput, RaceState } from '@/types/race'
import { identity, setBoatId } from '@/net/identity'

type ColyseusStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

type RaceRoomSchema = {
  race: {
    toJSON: () => RaceState
  }
}

export class ColyseusBridge {
  private client: Client

  private room?: Room<RaceRoomSchema>

  private statusListeners = new Set<(status: ColyseusStatus) => void>()

  constructor(endpoint: string, private roomId: string) {
    this.client = new Client(endpoint)
  }

  onStatusChange(listener: (status: ColyseusStatus) => void) {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  private emitStatus(status: ColyseusStatus) {
    this.statusListeners.forEach((listener) => listener(status))
  }

  async connect() {
    this.emitStatus('connecting')
    this.room = await this.client.joinById<RaceRoomSchema>(this.roomId, {
      name: identity.clientName ?? 'Visitor',
    })
    this.attachHandlers(this.room)
    this.emitStatus('connected')
  }

  disconnect() {
    void this.room?.leave()
    this.room = undefined
    this.emitStatus('disconnected')
  }

  sendInput(input: PlayerInput) {
    if (!this.room) return
    this.room.send('input', {
      ...input,
      boatId: input.boatId ?? identity.boatId,
    })
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
        setBoatId(payload.boatId)
      }
    })
    room.onLeave(() => this.emitStatus('disconnected'))
    room.onError((code) => {
      console.error('[colyseus] room error', code)
      this.emitStatus('error')
    })
  }
}

