import type { Client } from 'colyseus'
import { Room } from 'colyseus'
import { HostLoop } from '@/host/loop'
import { createBoatState, createInitialRaceState, cloneRaceState } from '@/state/factories'
import type { ChatMessage, ChatSenderRole, RaceEvent, RaceState } from '@/types/race'
import { appEnv } from '@/config/env'
import { createId } from '@/utils/ids'
import { RaceRoomState } from '../state/RaceRoomState'
import { RaceStore } from '../state/serverRaceStore'
import { applyRaceStateToSchema } from '../state/schema/applyRaceState'

const roomDebug = (...args: unknown[]) => {
  if (!appEnv.debugNetLogs) return
  console.info('[RaceRoom:debug]', ...args)
}

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

type ChatMessagePayload = {
  text?: string
}

export class RaceRoom extends Room<RaceRoomState> {
  maxClients = 32

  private raceStore?: RaceStore

  private loop?: HostLoop

  private clientBoatMap = new Map<string, string>()
  private clientIdentityMap = new Map<string, string>()
  private clientNameMap = new Map<string, string>()

  private hostSessionId?: string
  private hostClientId?: string

  private chatRateMap = new Map<string, number[]>()

  onCreate(options: Record<string, unknown>) {
    this.setState(new RaceRoomState())
    console.info('[RaceRoom] created', { options, roomId: this.roomId })
    roomDebug('onCreate', { options, roomId: this.roomId })
    const initialState = createInitialRaceState(`colyseus-${this.roomId}`)
    this.raceStore = new RaceStore(initialState)
    applyRaceStateToSchema(this.state.race, initialState)
    this.loop = new HostLoop(this.raceStore, undefined, undefined, {
      onEvents: (events) => this.broadcastEvents(events),
      onTick: (state) => {
        if (state.hostId !== this.hostClientId) {
          roomDebug('loop host sync', {
            loopHostId: state.hostId,
            currentHostSession: this.hostSessionId,
            currentHostClient: this.hostClientId,
          })
        }
        state.hostId = this.hostClientId ?? state.hostId ?? ''
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
        roomDebug('host_command ignored', {
          clientId: client.sessionId,
          command,
          hostSessionId: this.hostSessionId,
        })
        return
      }
      roomDebug('host_command', { clientId: client.sessionId, command })
      if (command.kind === 'arm') {
        this.armCountdown(command.seconds ?? appEnv.countdownSeconds)
      } else if (command.kind === 'reset') {
        this.resetRaceState()
      }
    })

    this.onMessage<ChatMessagePayload>('chat', (client, payload) => {
      this.handleChat(client, payload)
    })
  }

  onJoin(client: Client, options?: Record<string, unknown>) {
    const clientId = this.resolveClientIdentity(client, options)
    this.clientIdentityMap.set(client.sessionId, clientId)
    const displayName = this.resolvePlayerName(client, options)
    this.clientNameMap.set(client.sessionId, displayName)
    this.state.playerCount += 1
    console.info('[RaceRoom] client joined', {
      clientId: client.sessionId,
      playerCount: this.state.playerCount,
    })
    roomDebug('onJoin', {
      clientId: client.sessionId,
      playerCount: this.state.playerCount,
      hostSessionId: this.hostSessionId,
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
    roomDebug('onLeave', {
      clientId: client.sessionId,
      consented,
      nextHost: this.hostSessionId,
    })
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
      this.clientNameMap.set(client.sessionId, displayName)
    })

    client.send('boat_assignment', { boatId: assignedId })
    roomDebug('assignBoatToClient', {
      clientId: client.sessionId,
      boatId: assignedId,
      hostSessionId: this.hostSessionId,
    })
  }

  private releaseBoat(client: Client) {
    const boatId = this.clientBoatMap.get(client.sessionId)
    if (!boatId) return
    this.clientBoatMap.delete(client.sessionId)
    this.clientIdentityMap.delete(client.sessionId)
    this.clientNameMap.delete(client.sessionId)
    roomDebug('releaseBoat', { clientId: client.sessionId, boatId })
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

  private resolveClientIdentity(client: Client, options?: Record<string, unknown>) {
    const provided = typeof options?.clientId === 'string' ? options.clientId.trim() : ''
    return provided || client.sessionId
  }

  private resolvePlayerName(client: Client, options?: Record<string, unknown>) {
    const name = typeof options?.name === 'string' ? options.name.trim() : ''
    if (name) return name
    const clientId = this.clientIdentityMap.get(client.sessionId) ?? client.sessionId
    return `Sailor ${clientId.slice(0, 4)}`
  }

  private mutateState(mutator: (draft: RaceState) => void) {
    if (!this.raceStore) return
    const draft = cloneRaceState(this.raceStore.getState())
    mutator(draft)
    draft.hostId = this.hostClientId ?? ''
    this.raceStore.setState(draft)
    applyRaceStateToSchema(this.state.race, draft)
  }

  private describeHost(sessionId?: string) {
    if (!sessionId) {
      return {
        sessionId: undefined,
        clientId: undefined,
        hostBoatId: undefined,
        hostName: undefined,
      }
    }
    const hostBoatId = this.clientBoatMap.get(sessionId)
    const clientId = this.clientIdentityMap.get(sessionId)
    const storeName =
      hostBoatId && this.raceStore ? this.raceStore.getState().boats[hostBoatId]?.name : undefined
    const schemaName = hostBoatId ? this.state.race.boats.get(hostBoatId)?.name : undefined
      return {
      sessionId,
      clientId,
      hostBoatId,
      hostName: storeName ?? schemaName,
    }
  }

  private setHost(sessionId?: string) {
    const previousHost = this.hostSessionId
    this.hostSessionId = sessionId
    this.hostClientId = sessionId ? this.clientIdentityMap.get(sessionId) ?? sessionId : undefined
    roomDebug('setHost', {
      previousHost,
      nextHost: sessionId,
      ...this.describeHost(sessionId),
    })
    this.mutateState((draft) => {
      draft.hostId = this.hostClientId ?? ''
      if (!sessionId) {
        draft.countdownArmed = false
        draft.clockStartMs = null
      }
    })
  }

  private armCountdown(seconds: number) {
    roomDebug('armCountdown', {
      seconds,
      ...this.describeHost(this.hostSessionId),
    })
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
    roomDebug('resetRaceState', {
      assignments: assignment.length,
      ...this.describeHost(this.hostSessionId),
    })
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

  private broadcastEvents(events: RaceEvent[]) {
    if (!events.length) return
    this.broadcast('events', events)
  }

  private handleChat(client: Client, payload: ChatMessagePayload) {
    const text = typeof payload?.text === 'string' ? payload.text.trim() : ''
    if (!text) return
    const senderId = this.clientIdentityMap.get(client.sessionId) ?? client.sessionId
    if (!this.canSendChat(senderId)) {
      roomDebug('chat rate limited', { clientId: client.sessionId })
      return
    }
    const trimmed = text.slice(0, 280)
    const boatId = this.clientBoatMap.get(client.sessionId)
    const senderRole: ChatSenderRole =
      client.sessionId === this.hostSessionId
        ? 'host'
        : boatId
          ? 'player'
          : 'spectator'
    const senderName =
      this.clientNameMap.get(client.sessionId) ??
      (boatId && this.state.race.boats[boatId]?.name) ??
      this.resolvePlayerName(client)
    const message: ChatMessage = {
      messageId: createId('chat'),
      raceId: this.state.race.meta.raceId,
      senderId,
      senderName,
      senderRole,
      text: trimmed,
      ts: Date.now(),
    }
    this.broadcast('chat', message)
  }

  private canSendChat(clientId: string) {
    const windowMs = 10_000
    const limit = 5
    const now = Date.now()
    const recent = (this.chatRateMap.get(clientId) ?? []).filter((ts) => now - ts < windowMs)
    if (recent.length >= limit) {
      this.chatRateMap.set(clientId, recent)
      return false
    }
    recent.push(now)
    this.chatRateMap.set(clientId, recent)
    return true
  }
}

