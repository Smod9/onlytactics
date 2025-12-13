import type { Client } from 'colyseus'
import { Room } from 'colyseus'
import { HostLoop } from '@/host/loop'
import { ReplayRecorder } from '@/replay/record'
import {
  createBoatState,
  createInitialRaceState,
  createRaceMeta,
  cloneRaceState,
} from '@/state/factories'
import type { ChatMessage, ChatSenderRole, RaceEvent, RaceState, PlayerInput } from '@/types/race'
import { appEnv } from '@/config/env'
import { createId } from '@/utils/ids'
import { assignLeaderboard } from '@/logic/leaderboard'
import { placeBoatNearNextMark } from '@/logic/debugPlacement'
import { normalizeDeg, quantizeHeading } from '@/logic/physics'
import { SPIN_HOLD_SECONDS } from '@/logic/constants'
import { RaceRoomState } from '../state/RaceRoomState'
import { RaceStore } from '../state/serverRaceStore'
import { applyRaceStateToSchema } from '../state/schema/applyRaceState'
import { saveRace } from '../db/raceStorage'

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
  vmgMode?: boolean
  clearPenalty?: boolean
}

type HostCommand =
  | { kind: 'arm'; seconds?: number }
  | { kind: 'reset' }
  | { kind: 'debug_lap'; boatId: string }
  | { kind: 'debug_finish'; boatId: string }
  | { kind: 'debug_warp'; boatId: string }

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
  // Track active spins: maps boatId to array of timeout IDs for the spin sequence
  private activeSpins = new Map<string, NodeJS.Timeout[]>()
  private replayRecorder = new ReplayRecorder()
  private replaySaved = false
  private persistingReplay = false

  onCreate(options: Record<string, unknown>) {
    this.setState(new RaceRoomState())
    console.info('[RaceRoom] created', { options, roomId: this.roomId })
    roomDebug('onCreate', { options, roomId: this.roomId })
    const initialRaceId = createId(`race-${this.roomId}`)
    const initialState = createInitialRaceState(initialRaceId)
    this.raceStore = new RaceStore(initialState)
    applyRaceStateToSchema(this.state.race, initialState)
    this.replayRecorder.start(initialState)
    this.replaySaved = false
    this.loop = new HostLoop(this.raceStore, undefined, undefined, {
      onEvents: (events) => {
        this.broadcastEvents(events)
        const latestState = this.raceStore?.getState()
        if (latestState) {
          this.replayRecorder.recordFrame(latestState, events, true)
        }
      },
      onTick: (state) => {
        this.replayRecorder.recordFrame(state, [])
        const anyFinished = Object.values(state.boats ?? {}).some((boat) => boat.finished)
        if (anyFinished && !this.replaySaved) {
          void this.persistReplay('winner_recorded')
        }
        if (state.phase === 'finished' && !this.replaySaved) {
          void this.persistReplay('race_finished')
        }
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
      
      // Handle penalty clear requests
      if (message.clearPenalty) {
        this.clearPenalty(boatId)
        return
      }
      
      // Handle spin requests: queue a 360° spin sequence
      if (message.spin === 'full') {
        this.queueSpin(boatId)
        return
      }
      
      // Ignore other inputs during active spin to prevent interference
      if (this.activeSpins.has(boatId)) {
        return
      }
      
      // Process normal heading/VMG inputs
      const payload = {
        boatId,
        seq: message.seq ?? 0,
        desiredHeadingDeg: message.desiredHeadingDeg,
        absoluteHeadingDeg: message.absoluteHeadingDeg,
        deltaHeadingDeg: message.deltaHeadingDeg,
        spin: message.spin,
        vmgMode: message.vmgMode,
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
      } else if (command.kind === 'debug_lap') {
        this.debugAdvanceLap(command.boatId)
      } else if (command.kind === 'debug_finish') {
        this.debugFinishBoat(command.boatId)
      } else if (command.kind === 'debug_warp') {
        this.debugWarpBoat(command.boatId)
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
    void this.persistReplay('room_dispose')
    this.loop?.stop()
    // Clean up any active spins when room is disposed
    this.activeSpins.forEach((timers) => timers.forEach((timer) => clearTimeout(timer)))
    this.activeSpins.clear()
  }
  
  /**
   * Queue a 360° spin sequence for a boat.
   * The spin consists of three heading changes: +120°, +240°, then back to origin.
   * Each heading is held for SPIN_HOLD_SECONDS before moving to the next.
   */
  private queueSpin(boatId: string) {
    // Prevent multiple simultaneous spins for the same boat
    if (this.activeSpins.has(boatId)) return
    if (!this.raceStore) return
    const state = this.raceStore.getState()
    const boat = state.boats[boatId]
    if (!boat) return
    
    // Disable VMG mode and set rightsSuspended to prevent other inputs during spin
    this.mutateState((draft) => {
      const target = draft.boats[boatId]
      if (target) {
        target.rightsSuspended = true
        target.vmgMode = false
      }
    })
    
    // Calculate the three headings for the spin sequence (120° increments)
    const origin = boat.desiredHeadingDeg ?? boat.headingDeg
    const headings = [
      origin + 120,
      origin + 240,
      origin,
    ].map((deg) => normalizeDeg(deg))
    
    // Schedule each heading change with increasing delays
    let delay = 0
    const timers: NodeJS.Timeout[] = headings.map((heading, index) => {
      const timer = setTimeout(() => {
        this.injectHeading(boatId, heading)
        // On the last heading (back to origin), finish the spin
        if (index === headings.length - 1) {
          this.finishSpin(boatId)
        }
      }, delay)
      delay += SPIN_HOLD_SECONDS * 1000
      return timer
    })
    this.activeSpins.set(boatId, timers)
  }
  
  /**
   * Inject a heading change into the race state as part of a spin sequence.
   * This simulates the boat turning during a 360° spin.
   */
  private injectHeading(boatId: string, heading: number) {
    if (!this.raceStore) return
    const normalized = quantizeHeading(normalizeDeg(heading))
    const payload: PlayerInput = {
      boatId,
      desiredHeadingDeg: normalized,
      absoluteHeadingDeg: normalized,
      tClient: Date.now(),
      seq: 0,
    }
    this.raceStore.upsertInput(payload)
  }
  
  /**
   * Finish a spin sequence: clean up timers and restore normal boat state.
   * This is called after the final heading change (back to origin) completes.
   */
  private finishSpin(boatId: string) {
    // Clear all timers for this spin
    const timers = this.activeSpins.get(boatId)
    if (timers) {
      timers.forEach((timer) => clearTimeout(timer))
      this.activeSpins.delete(boatId)
    }
    // Restore normal boat state (clear rightsSuspended flag)
    this.mutateState((draft) => {
      const boat = draft.boats[boatId]
      if (boat) {
        boat.rightsSuspended = false
      }
    })
    // Clear one penalty if the boat has any
    this.clearPenalty(boatId)
  }
  
  /**
   * Clear one penalty from a boat after completing a 360° spin.
   * Creates and broadcasts an event if a penalty was cleared.
   */
  private clearPenalty(boatId: string) {
    if (!this.raceStore) return
    let cleared = false
    let boatName: string | undefined
    let remaining = 0
    
    this.mutateState((draft) => {
      const boat = draft.boats[boatId]
      if (!boat) return
      boatName = boat.name
      if (boat.penalties > 0) {
        boat.penalties -= 1
        cleared = true
      }
      boat.fouled = boat.penalties > 0
      remaining = boat.penalties
    })
    
    // Only create event if a penalty was actually cleared
    if (!cleared || !boatName) return
    
    const state = this.raceStore.getState()
    const event: RaceEvent = {
      eventId: createId('event'),
      kind: 'rule_hint',
      ruleId: 'other',
      boats: [boatId],
      t: state.t,
      message: `${boatName} completed a 360° spin and cleared a penalty (${remaining} remaining)`,
    }
    this.broadcastEvents([event])
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
        if (client.sessionId === this.hostSessionId) {
          draft.hostBoatId = assignedId
          this.raceStore?.setHostBoat(assignedId)
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
    const hostBoatId = sessionId ? this.clientBoatMap.get(sessionId) : undefined
    roomDebug('setHost', {
      previousHost,
      nextHost: sessionId,
      ...this.describeHost(sessionId),
    })
    this.mutateState((draft) => {
      draft.hostId = this.hostClientId ?? ''
      draft.hostBoatId = hostBoatId ?? ''
      if (!sessionId) {
        draft.countdownArmed = false
        draft.clockStartMs = null
      }
    })
    this.raceStore?.setHostBoat(hostBoatId)
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
      const hostBoatId = this.hostSessionId
        ? this.clientBoatMap.get(this.hostSessionId)
        : this.raceStore?.getState().hostBoatId
      draft.hostBoatId = hostBoatId ?? draft.hostBoatId ?? ''
    })
  }

  private debugAdvanceLap(boatId: string) {
    if (!boatId) return
    roomDebug('debugAdvanceLap', { boatId, ...this.describeHost(this.hostSessionId) })
    this.mutateState((draft) => {
      const boat = draft.boats[boatId]
      if (!boat) return
      boat.lap = Math.min((boat.lap ?? 0) + 1, draft.lapsToFinish)
      boat.nextMarkIndex = 0
      if (boat.lap >= draft.lapsToFinish) {
        this.finishBoatDraft(boat, draft)
      }
      assignLeaderboard(draft)
    })
  }

  private debugFinishBoat(boatId: string) {
    if (!boatId) return
    roomDebug('debugFinishBoat', { boatId, ...this.describeHost(this.hostSessionId) })
    this.mutateState((draft) => {
      const boat = draft.boats[boatId]
      if (!boat) return
      boat.lap = draft.lapsToFinish
      this.finishBoatDraft(boat, draft)
      assignLeaderboard(draft)
    })
  }

  private debugWarpBoat(boatId: string) {
    if (!boatId) return
    roomDebug('debugWarpBoat', { boatId, ...this.describeHost(this.hostSessionId) })
    this.mutateState((draft) => {
      const boat = draft.boats[boatId]
      if (!boat) return
      placeBoatNearNextMark(boat, draft)
      assignLeaderboard(draft)
    })
  }

  private finishBoatDraft(boat: RaceState['boats'][string], draft: RaceState) {
    boat.finished = true
    boat.finishTime = draft.t
    boat.distanceToNextMark = 0
    boat.nextMarkIndex = 0
    boat.inMarkZone = false
  }

  private async persistReplay(reason: string, finalStateOverride?: RaceState) {
    if (this.persistingReplay) return
    const recording = this.replayRecorder.getRecording()
    const finalState = finalStateOverride ?? this.raceStore?.getState()
    if (!recording || !finalState || recording.frames.length <= 1) return

    this.persistingReplay = true
    try {
      await saveRace(recording, cloneRaceState(finalState))
      this.replaySaved = true
      console.info('[RaceRoom] saved replay', { raceId: recording.meta.raceId, reason })
    } catch (error) {
      console.error('[RaceRoom] failed to save replay', {
        raceId: recording?.meta.raceId,
        reason,
        error,
      })
    } finally {
      this.persistingReplay = false
    }
  }

  private resetRaceState() {
    const previousState = this.raceStore?.getState()
    void this.persistReplay('race_reset', previousState)
    const assignment = Array.from(this.clientBoatMap.entries()).map(([sessionId, boatId], idx) => ({
      boatId,
      name: this.state.race.boats.get(boatId)?.name ?? `Sailor ${sessionId.slice(0, 4)}`,
      index: idx,
    }))
    roomDebug('resetRaceState', {
      assignments: assignment.length,
      ...this.describeHost(this.hostSessionId),
    })
    this.replayRecorder.reset()
    this.replaySaved = false
    this.mutateState((draft) => {
      draft.phase = 'prestart'
      draft.countdownArmed = false
      draft.clockStartMs = null
      draft.t = -appEnv.countdownSeconds
      draft.meta = createRaceMeta(createId('race'))
      const nextBoats: RaceState['boats'] = {}
      assignment.forEach(({ boatId, name, index }) => {
        nextBoats[boatId] = createBoatState(name, index, boatId)
      })
      draft.boats = nextBoats
      draft.leaderboard = assignment.map((entry) => entry.boatId)
      const hostBoatId = this.hostSessionId
        ? this.clientBoatMap.get(this.hostSessionId)
        : this.raceStore?.getState().hostBoatId
      draft.hostBoatId = hostBoatId ?? draft.hostBoatId ?? ''
    })
    const nextState = this.raceStore?.getState()
    if (nextState) {
      const hostBoatId = this.hostSessionId
        ? this.clientBoatMap.get(this.hostSessionId)
        : nextState.hostBoatId
      this.raceStore?.setHostBoat(hostBoatId)
      if (hostBoatId && this.raceStore) {
        const mutable = this.raceStore.getState()
        mutable.hostBoatId = hostBoatId
        this.loop?.reset(mutable)
        this.replayRecorder.start(mutable)
      } else {
        this.loop?.reset(nextState)
        this.replayRecorder.start(nextState)
      }
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
      (boatId && this.state.race.boats.get(boatId)?.name) ??
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
    this.replayRecorder.addChat(message)
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

