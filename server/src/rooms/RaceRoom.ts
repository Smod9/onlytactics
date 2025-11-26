import type { Client } from 'colyseus'
import { Room } from 'colyseus'
import { RaceRoomState } from '../state/RaceRoomState'
import {
  BoatStateSchema,
  Vec2Schema,
} from '../state/schema/RaceSchemas'

type HelloMessage = {
  kind: 'hello'
  name?: string
}

export class RaceRoom extends Room<RaceRoomState> {
  maxClients = 32

  onCreate(options: Record<string, unknown>) {
    this.setState(new RaceRoomState())
    console.info('[RaceRoom] created', { options, roomId: this.roomId })
    this.seedDemoState()
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
  }

  private seedDemoState() {
    const { race } = this.state
    race.meta.raceId = `colyseus-${this.roomId}`
    race.meta.createdAt = Date.now()
    race.meta.seed = Math.floor(Math.random() * 10_000)
    race.wind.directionDeg = 0
    race.wind.speed = 12
    race.baselineWindDeg = 0
    race.lapsToFinish = 3
    race.phase = 'prestart'
    race.countdownArmed = false
    race.clockStartMs = -1
    race.hostId = this.roomId

    const windward = new Vec2Schema()
    windward.x = 0
    windward.y = -240

    race.marks.push(windward)

    const demoBoat = new BoatStateSchema()
    demoBoat.id = 'demo-boat'
    demoBoat.name = 'Demo Boat'
    demoBoat.color = 0x53e0ff
    demoBoat.pos.x = 0
    demoBoat.pos.y = 120
    demoBoat.headingDeg = 0
    demoBoat.desiredHeadingDeg = 0

    race.boats.set(demoBoat.id, demoBoat)
    race.leaderboard.push(demoBoat.id)
  }
}

