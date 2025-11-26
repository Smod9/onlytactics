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

type InputMessage = {
  kind: 'input'
  boatId: string
  seq: number
  desiredHeadingDeg?: number
  absoluteHeadingDeg?: number
  deltaHeadingDeg?: number
  spin?: 'full'
}

export class RaceRoom extends Room<RaceRoomState> {
  maxClients = 32

  private raceStore?: RaceStore

  private loop?: HostLoop

  private clientBoatMap = new Map<string, string>()

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

    this.onMessage<InputMessage>('input', (client, message) => {
      if (!this.raceStore) return
      const boatId = this.resolveBoatId(client, message.boatId)
      if (!boatId) return
      const payload = {
        boatId,
        seq: message.seq ?? 0,
        desiredHeadingDeg: message.desiredHeadingDeg,
        absoluteHeadingDeg: message.absoluteHeadingDeg,
        deltaHeadingDeg: message.deltaHeadingDeg,
        spin: message.spin,
        tClient: Date.now(),
      }
      this.raceStore.upsertInput(payload)
    })
  }

  onJoin(client: Client) {
    this.state.playerCount += 1
    console.info('[RaceRoom] client joined', {
      clientId: client.sessionId,
      playerCount: this.state.playerCount,
    })
    this.assignBoatToClient(client)
  }

  onLeave(client: Client, consented: boolean) {
    this.state.playerCount = Math.max(0, this.state.playerCount - 1)
    console.info('[RaceRoom] client left', {
      clientId: client.sessionId,
      consented,
      playerCount: this.state.playerCount,
    })
    this.releaseBoat(client)
  }

  onDispose() {
    console.info('[RaceRoom] disposed', { roomId: this.roomId })
    this.loop?.stop()
  }

  private assignBoatToClient(client: Client) {
    if (!this.raceStore) return
    const state = this.raceStore.getState()
    const available = Object.values(state.boats).find(
      (boat) => !Array.from(this.clientBoatMap.values()).includes(boat.id),
    )
    if (available) {
      this.clientBoatMap.set(client.sessionId, available.id)
      client.send('boat_assignment', { boatId: available.id })
    } else {
      client.send('boat_assignment', { boatId: null })
    }
  }

  private releaseBoat(client: Client) {
    this.clientBoatMap.delete(client.sessionId)
  }

  private resolveBoatId(client: Client, preferredId?: string) {
    if (preferredId && Object.values(this.raceStore?.getState().boats ?? {}).some((boat) => boat.id === preferredId)) {
      this.clientBoatMap.set(client.sessionId, preferredId)
      return preferredId
    }
    return this.clientBoatMap.get(client.sessionId)
  }
}

