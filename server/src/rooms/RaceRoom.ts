import type { Client } from 'colyseus'
import { Room } from 'colyseus'
import { HostLoop } from '@/host/loop'
import { createBoatState, createInitialRaceState, cloneRaceState } from '@/state/factories'
import type { RaceState } from '@/types/race'
import { appEnv } from '@/config/env'
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

type HostCommand =
  | { kind: 'arm'; seconds?: number }
  | { kind: 'reset' }

export class RaceRoom extends Room<RaceRoomState> {
  maxClients = 32

  private raceStore?: RaceStore

  private loop?: HostLoop

  private clientBoatMap = new Map<string, string>()

  private hostSessionId?: string

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

    this.onMessage<HostCommand>('host_command', (client, command) => {
      if (client.sessionId !== this.hostSessionId) {
        console.warn('[RaceRoom] ignoring host command from non-host', {
          clientId: client.sessionId,
          command,
        })
        return
      }
      if (command.kind === 'arm') {
        this.armCountdown(command.seconds ?? appEnv.countdownSeconds)
      } else if (command.kind === 'reset') {
        this.resetRaceState()
      }
    })
  }

  onJoin(client: Client, options?: Record<string, unknown>) {
    this.state.playerCount += 1
    console.info('[RaceRoom] client joined', {
      clientId: client.sessionId,
      playerCount: this.state.playerCount,
    })
    this.assignBoatToClient(client, options)
    if (!this.hostSessionId) {
      this.setHost(client.sessionId)
    }
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

  private assignBoatToClient(client: Client, options?: Record<string, unknown>) {
    let assignedId: string | null = null
    this.mutateState((draft) => {
      const taken = new Set(this.clientBoatMap.values())
      const preferAi = Object.values(draft.boats).find(
        (boat) => !taken.has(boat.id) && Boolean(boat.ai),
      )
      const fallback = Object.values(draft.boats).find((boat) => !taken.has(boat.id))
      const existing = preferAi ?? fallback
      const displayName = this.resolvePlayerName(client, options)

      if (existing) {
        existing.ai = undefined
        existing.name = displayName
        assignedId = existing.id
      } else {
        const index = Object.keys(draft.boats).length
        const newBoat = createBoatState(displayName, index, `player-${client.sessionId}`)
        draft.boats[newBoat.id] = newBoat
        assignedId = newBoat.id
      }

      if (assignedId) {
        this.clientBoatMap.set(client.sessionId, assignedId)
        if (!draft.leaderboard.includes(assignedId)) {
          draft.leaderboard.push(assignedId)
        }
      }
    })

    client.send('boat_assignment', { boatId: assignedId })
  }

  private releaseBoat(client: Client) {
    const boatId = this.clientBoatMap.get(client.sessionId)
    if (!boatId) return
    this.clientBoatMap.delete(client.sessionId)
    this.mutateState((draft) => {
      if (draft.boats[boatId]) {
        delete draft.boats[boatId]
        draft.leaderboard = draft.leaderboard.filter((id) => id !== boatId)
      }
    })
    if (this.hostSessionId === client.sessionId) {
      const nextHost = this.clientBoatMap.keys().next().value as string | undefined
      this.setHost(nextHost)
    }
  }

  private resolveBoatId(client: Client, preferredId?: string) {
    if (preferredId && Object.values(this.raceStore?.getState().boats ?? {}).some((boat) => boat.id === preferredId)) {
      this.clientBoatMap.set(client.sessionId, preferredId)
      return preferredId
    }
    return this.clientBoatMap.get(client.sessionId)
  }

  private resolvePlayerName(client: Client, options?: Record<string, unknown>) {
    const name = typeof options?.name === 'string' ? options.name.trim() : ''
    if (name) return name
    return `Sailor ${client.sessionId.slice(0, 4)}`
  }

  private mutateState(mutator: (draft: RaceState) => void) {
    if (!this.raceStore) return
    const draft = cloneRaceState(this.raceStore.getState())
    mutator(draft)
    draft.hostId = this.hostSessionId ?? ''
    this.raceStore.setState(draft)
    applyRaceStateToSchema(this.state.race, draft)
  }

  private setHost(sessionId?: string) {
    this.hostSessionId = sessionId
    this.mutateState((draft) => {
      draft.hostId = sessionId ?? ''
      if (!sessionId) {
        draft.countdownArmed = false
        draft.clockStartMs = null
      }
    })
  }

  private armCountdown(seconds: number) {
    this.mutateState((draft) => {
      draft.phase = 'prestart'
      draft.countdownArmed = true
      draft.clockStartMs = Date.now() + seconds * 1000
      draft.t = -seconds
    })
  }

  private resetRaceState() {
    const assignment = Array.from(this.clientBoatMap.entries()).map(([sessionId, boatId], idx) => ({
      boatId,
      name: this.state.race.boats[boatId]?.name ?? `Sailor ${sessionId.slice(0, 4)}`,
      index: idx,
    }))
    this.mutateState((draft) => {
      draft.phase = 'prestart'
      draft.countdownArmed = false
      draft.clockStartMs = null
      draft.t = -appEnv.countdownSeconds
      const nextBoats: RaceState['boats'] = {}
      assignment.forEach(({ boatId, name, index }) => {
        nextBoats[boatId] = createBoatState(name, index, boatId)
      })
      draft.boats = nextBoats
      draft.leaderboard = assignment.map((entry) => entry.boatId)
    })
    const nextState = this.raceStore?.getState()
    if (nextState) {
      this.loop?.reset(nextState)
    }
  }
}

