import type { Client } from 'colyseus'
import { Room } from 'colyseus'
import { HostLoop } from '@/host/loop'
import { createInitialRaceState } from '@/state/factories'
import { RaceRoomState } from '../state/RaceRoomState'
import { RaceStore } from '../state/serverRaceStore'
import { applyRaceStateToSchema } from '../state/schema/applyRaceState'

type HelloMessage = {
  kind: 'hello'
  name?: string
}

export class RaceRoom extends Room<RaceRoomState> {
  maxClients = 32

  private raceStore?: RaceStore

  private loop?: HostLoop

  onCreate(options: Record<string, unknown>) {
    this.setState(new RaceRoomState())
    console.info('[RaceRoom] created', { options, roomId: this.roomId })
    const initialState = createInitialRaceState(`colyseus-${this.roomId}`)
    this.raceStore = new RaceStore(initialState)
    applyRaceStateToSchema(this.state.race, initialState)
    this.loop = new HostLoop(this.raceStore, undefined, undefined, {
      onTick: (state) => {
        applyRaceStateToSchema(this.state.race, state)
      },
    })
    this.loop.start()
    this.state.setReady()

    this.onMessage<HelloMessage>('hello', (client, message) => {
      console.info('[RaceRoom] hello message', { clientId: client.sessionId, message })
      client.send('hello_ack', {
        message: `Hello ${message.name ?? 'Sailor'}!`,
      })
    })
  }

  onJoin(client: Client) {
    this.state.playerCount += 1
    console.info('[RaceRoom] client joined', {
      clientId: client.sessionId,
      playerCount: this.state.playerCount,
    })
  }

  onLeave(client: Client, consented: boolean) {
    this.state.playerCount = Math.max(0, this.state.playerCount - 1)
    console.info('[RaceRoom] client left', {
      clientId: client.sessionId,
      consented,
      playerCount: this.state.playerCount,
    })
  }

  onDispose() {
    console.info('[RaceRoom] disposed', { roomId: this.roomId })
    this.loop?.stop()
  }
}

