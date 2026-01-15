import type { Client } from 'colyseus'
import { Room } from 'colyseus'
import { HostLoop } from '@/host/loop'
import {
  createBoatState,
  createInitialRaceState,
  cloneRaceState,
} from '@/state/factories'
import type {
  ChatMessage,
  ChatSenderRole,
  RaceEvent,
  RaceState,
  PlayerInput,
  RaceRole,
  ProtestStatus,
} from '@/types/race'
import { appEnv } from '@/config/env'
import { createId } from '@/utils/ids'
import { assignLeaderboard } from '@/logic/leaderboard'
import { placeBoatNearNextMark } from '@/logic/debugPlacement'
import { normalizeDeg, quantizeHeading } from '@/logic/physics'
import { SPIN_HOLD_SECONDS } from '@/logic/constants'
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
  vmgMode?: boolean
  blowSails?: boolean
  clearPenalty?: boolean
}

type JoinRoleOption = Exclude<RaceRole, 'host'>

type ProtestCommand =
  | { kind: 'file'; targetBoatId: string }
  | { kind: 'revoke'; targetBoatId: string }
  | { kind: 'judge_clear'; targetBoatId: string }

type HostCommand =
  | { kind: 'arm'; seconds?: number }
  | { kind: 'reset' }
  | { kind: 'pause'; paused: boolean }
  | { kind: 'wind_field'; enabled: boolean }
  | { kind: 'debug_set_pos'; boatId: string; x: number; y: number }
  | { kind: 'debug_lap'; boatId: string }
  | { kind: 'debug_finish'; boatId: string }
  | { kind: 'debug_warp'; boatId: string }

type ChatMessagePayload = {
  text?: string
}

type RosterEntryPayload = {
  clientId: string
  name: string
  role: RaceRole
  boatId: string | null
}

export class RaceRoom extends Room<{ state: RaceRoomState }> {
  maxClients = 32

  private raceStore?: RaceStore

  private loop?: HostLoop

  private clientBoatMap = new Map<string, string>()
  private clientIdentityMap = new Map<string, string>()
  private clientNameMap = new Map<string, string>()
  private clientRoleMap = new Map<string, JoinRoleOption>()

  private hostSessionId?: string
  private hostClientId?: string

  private chatRateMap = new Map<string, number[]>()
  // Track active spins: maps boatId to array of timeout IDs for the spin sequence
  private activeSpins = new Map<string, NodeJS.Timeout[]>()
  private lastCountdownLogAtMs = 0
  private lastLobbyUpdateAtMs = 0
  private lastLobbyStatus?: string
  private lastLobbyTimeToStart?: number | null
  private timeoutTriggered = false

  // Room metadata
  public metadataRoomName: string = 'Unnamed Race'
  public description: string = ''
  public createdAt: number = Date.now()
  public createdBy?: string
  private lastPlayerLeaveTime?: number
  private cleanupTimer?: NodeJS.Timeout

  onCreate(options: Record<string, unknown>) {
    // Set patch rate to match configured publish interval (must be called before setState)
    this.setPatchRate(appEnv.hostPublishIntervalMs)
    this.setState(new RaceRoomState())

    // Initialize room metadata from options
    const fallbackName = `Race ${this.roomId.slice(0, 4).toUpperCase()}`
    const normalizedName = this.normalizeRoomName(options.roomName)
    this.metadataRoomName = normalizedName ?? fallbackName
    this.description = this.normalizeRoomDescription(options.description)
    this.createdAt = Date.now()
    this.createdBy = typeof options.createdBy === 'string' ? options.createdBy : undefined

    // Expose metadata to matchMaker listings if needed.
    this.setMetadata({
      roomName: this.metadataRoomName,
      description: this.description,
      createdAt: this.createdAt,
      createdBy: this.createdBy ?? '',
      status: 'waiting',
      timeToStartSeconds: null,
      phase: 'prestart',
    })

    console.info('[RaceRoom] created', {
      options,
      roomId: this.roomId,
      roomName: this.metadataRoomName,
    })
    roomDebug('onCreate', {
      options,
      roomId: this.roomId,
      roomName: this.metadataRoomName,
    })
    const initialState = createInitialRaceState(`colyseus-${this.roomId}`)
    this.raceStore = new RaceStore(initialState)
    applyRaceStateToSchema(this.state.race, initialState)
    this.loop = new HostLoop(this.raceStore, undefined, undefined, {
      onEvents: (events) => this.broadcastEvents(events),
      onTimeout: () => this.handleTimeout(),
      onTick: (state) => {
        // Debug: confirm countdown is ticking server-side.
        // Logs at most once per second while countdown is armed.
        if (state.phase === 'prestart' && state.countdownArmed) {
          const now = Date.now()
          if (now - this.lastCountdownLogAtMs > 1000) {
            this.lastCountdownLogAtMs = now
            console.info('[RaceRoom]', 'countdown_tick', {
              t: Number.isFinite(state.t) ? state.t.toFixed(2) : state.t,
              phase: state.phase,
              countdownArmed: state.countdownArmed,
              clockStartMs: state.clockStartMs ?? null,
            })
          }
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
        this.updateLobbyMetadata(state)
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
        this.handlePenaltyClearRequest(boatId)
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
        blowSails: message.blowSails,
        tClient: Date.now(),
      }
      this.raceStore.upsertInput(payload)
    })

    this.onMessage<ProtestCommand>('protest_command', (client, command) => {
      if (!this.raceStore) return
      if (!command?.targetBoatId) return
      const targetBoatId = command.targetBoatId
      const role = this.clientRoleMap.get(client.sessionId) ?? 'player'
      if (command.kind === 'judge_clear') {
        if (role !== 'judge') {
          console.warn('[RaceRoom] ignoring judge_clear from non-judge', {
            sessionId: client.sessionId,
            role,
            command,
          })
          return
        }
        this.clearProtestAsJudge(targetBoatId)
        return
      }

      // file/revoke must come from a player with an assigned boat
      const protestorBoatId = this.clientBoatMap.get(client.sessionId)
      if (!protestorBoatId) {
        console.warn('[RaceRoom] ignoring protest command from non-player', {
          sessionId: client.sessionId,
          role,
          command,
        })
        return
      }

      if (command.kind === 'file') {
        this.fileProtest(protestorBoatId, targetBoatId)
      } else if (command.kind === 'revoke') {
        this.revokeProtest(protestorBoatId, targetBoatId)
      }
    })

    this.onMessage<HostCommand>('host_command', (client, command) => {
      const role = this.clientRoleMap.get(client.sessionId) ?? 'player'
      const isHost = client.sessionId === this.hostSessionId
      const isGod = role === 'god' && appEnv.debugHud
      const godAllowed = command.kind === 'pause' || command.kind === 'debug_set_pos'
      if (!isHost && !(isGod && godAllowed)) {
        console.warn('[RaceRoom] ignoring host command from non-host', {
          clientId: client.sessionId,
          role,
          command,
        })
        roomDebug('host_command ignored', {
          clientId: client.sessionId,
          role,
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
      } else if (command.kind === 'pause') {
        this.setPaused(command.paused)
      } else if (command.kind === 'wind_field') {
        this.setWindFieldEnabled(command.enabled)
      } else if (command.kind === 'debug_set_pos') {
        this.debugSetBoatPosition(command.boatId, command.x, command.y)
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

    // Client may miss the initial roster broadcast during join; allow requesting it explicitly.
    this.onMessage('roster_request', (client) => {
      client.send('roster', { entries: this.buildRosterEntries() })
    })
  }

  private normalizeRoomName(value: unknown) {
    if (typeof value !== 'string') return undefined
    const cleaned = value
      .replace(/[\u0000-\u001f\u007f]+/g, '')
      .trim()
      .replace(/\s+/g, ' ')
    if (!cleaned) return undefined
    return cleaned.slice(0, 40)
  }

  private normalizeRoomDescription(value: unknown) {
    if (typeof value !== 'string') return ''
    const cleaned = value
      .replace(/[\u0000-\u001f\u007f]+/g, '')
      .trim()
      .replace(/\s+/g, ' ')
    return cleaned.slice(0, 160)
  }

  private buildRosterEntries(): RosterEntryPayload[] {
    const entries: RosterEntryPayload[] = []
    for (const sessionId of this.clientIdentityMap.keys()) {
      const clientId = this.clientIdentityMap.get(sessionId) ?? sessionId
      const name =
        this.clientNameMap.get(sessionId) ??
        `Sailor ${(clientId ?? sessionId).slice(0, 4)}`
      const joinRole = this.clientRoleMap.get(sessionId) ?? 'player'
      const role: RaceRole = sessionId === this.hostSessionId ? 'host' : joinRole
      const boatId = this.clientBoatMap.get(sessionId) ?? null
      entries.push({ clientId, name, role, boatId })
    }
    entries.sort((a, b) => {
      if (a.role === 'host') return -1
      if (b.role === 'host') return 1
      if (a.role !== b.role) return a.role.localeCompare(b.role)
      return a.name.localeCompare(b.name)
    })
    return entries
  }

  private broadcastRoster() {
    this.broadcast('roster', { entries: this.buildRosterEntries() })
  }

  onJoin(client: Client, options?: Record<string, unknown>) {
    const clientId = this.resolveClientIdentity(client, options)
    const joinRole = this.resolveJoinRole(options)
    client.send('role_assignment', { role: joinRole })

    // Cancel cleanup timer if room was empty
    this.cancelCleanup()

    // De-dupe: if the same clientId is already connected, evict the previous session.
    const existingSessionId = this.findExistingSessionId(clientId, client.sessionId)
    const existingWasHost = Boolean(
      existingSessionId && existingSessionId === this.hostSessionId,
    )
    const existingBoatId = existingSessionId
      ? this.clientBoatMap.get(existingSessionId)
      : undefined
    if (existingSessionId) {
      console.info('[RaceRoom] evicting duplicate session for clientId', {
        clientId,
        previousSessionId: existingSessionId,
        nextSessionId: client.sessionId,
        nextRole: joinRole,
      })
      // Preserve the previous boat so a hard refresh can seamlessly resume control.
      this.evictSession(existingSessionId, { preserveBoat: true })
    }

    this.clientIdentityMap.set(client.sessionId, clientId)
    const displayName = this.resolvePlayerName(client, options)
    this.clientNameMap.set(client.sessionId, displayName)
    this.clientRoleMap.set(client.sessionId, joinRole)
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
    if (joinRole === 'player') {
      // If we're replacing our own previous session, try to re-attach the same boat.
      if (existingBoatId && this.raceStore?.getState().boats?.[existingBoatId]) {
        this.reattachBoatToClient(client, existingBoatId, options)
      } else {
        this.assignBoatToClient(client, options)
      }
      if (existingWasHost) {
        this.setHost(client.sessionId)
      } else if (!this.hostSessionId) {
        this.setHost(client.sessionId)
      }
    } else {
      // Judges and spectators do not control a boat.
      client.send('boat_assignment', { boatId: null })
      // If the previous session was host and the replacement is not a player, drop host selection.
      if (existingWasHost) {
        this.setHost(undefined)
      }
    }
    this.broadcastRoster()
  }

  async onLeave(client: Client, code?: number) {
    const consented = code === 1000 || code === 1001
    // If a client disconnects unexpectedly, allow a brief reconnection window.
    // This prevents "freeze -> refresh -> new boat" churn for transient network drops.
    if (!consented) {
      try {
        await this.allowReconnection(client, 30)
        roomDebug('onLeave:reconnected', { clientId: client.sessionId })
        return
      } catch {
        // fall through to cleanup
      }
    }

    this.state.playerCount = Math.max(0, this.state.playerCount - 1)
    console.info('[RaceRoom] client left', {
      clientId: client.sessionId,
      consented,
      playerCount: this.state.playerCount,
    })
    this.releaseBoat(client)
    this.broadcastRoster()

    // Track when room becomes empty for cleanup
    if (this.clients.length === 0) {
      this.lastPlayerLeaveTime = Date.now()
      this.scheduleCleanup()
    } else {
      // Cancel cleanup if someone joins
      this.cancelCleanup()
    }

    roomDebug('onLeave', {
      clientId: client.sessionId,
      consented,
      nextHost: this.hostSessionId,
    })
  }

  onDispose() {
    console.info('[RaceRoom] disposed', {
      roomId: this.roomId,
      roomName: this.metadataRoomName,
    })
    this.loop?.stop()
    // Clean up any active spins when room is disposed
    this.activeSpins.forEach((timers) => timers.forEach((timer) => clearTimeout(timer)))
    this.activeSpins.clear()
    this.cancelCleanup()
  }

  private handleTimeout() {
    if (this.timeoutTriggered) return
    this.timeoutTriggered = true
    console.info('[RaceRoom] timeout reached, closing room', {
      roomId: this.roomId,
      roomName: this.metadataRoomName,
    })
    this.broadcast('room_closed', { reason: 'timeout' })
    this.loop?.stop()
    setTimeout(() => {
      try {
        this.disconnect()
      } catch (err) {
        console.warn('[RaceRoom] failed to disconnect after timeout', err)
      }
    }, 250)
  }

  /**
   * Get room status based on race phase
   */
  getStatus(): 'waiting' | 'in-progress' | 'finished' {
    if (!this.raceStore) return 'waiting'
    const state = this.raceStore.getState()
    // Check if all boats finished
    const allFinished = Object.values(state.boats).every((boat) => boat.finished)
    if (allFinished && Object.keys(state.boats).length > 0) return 'finished'
    if (
      state.phase === 'running' ||
      (state.phase === 'prestart' && (state.countdownArmed || state.clockStartMs !== null))
    ) {
      return 'in-progress'
    }
    return 'waiting'
  }

  /**
   * Get time-to-start in seconds for pre-start countdowns.
   */
  getTimeToStartSeconds(): number | null {
    if (!this.raceStore) return null
    const state = this.raceStore.getState()
    if (state.phase !== 'prestart' || !state.countdownArmed) return null
    if (!Number.isFinite(state.t)) return null
    if (state.t >= 0) return 0
    return Math.max(0, Math.ceil(-state.t))
  }

  private updateLobbyMetadata(state: RaceState) {
    const now = Date.now()
    if (now - this.lastLobbyUpdateAtMs < 1000) return
    this.lastLobbyUpdateAtMs = now
    const status = this.getStatus()
    const timeToStartSeconds = this.getTimeToStartSeconds()
    if (status === this.lastLobbyStatus && timeToStartSeconds === this.lastLobbyTimeToStart) {
      return
    }
    this.lastLobbyStatus = status
    this.lastLobbyTimeToStart = timeToStartSeconds
    void this.setMetadata({
      roomName: this.metadataRoomName,
      description: this.description,
      createdAt: this.createdAt,
      createdBy: this.createdBy ?? '',
      status,
      phase: state.phase,
      timeToStartSeconds,
    })
  }

  /**
   * Get host name for display
   */
  getHostName(): string | undefined {
    if (!this.hostSessionId) return undefined
    const hostBoatId = this.clientBoatMap.get(this.hostSessionId)
    if (hostBoatId && this.raceStore) {
      return this.raceStore.getState().boats[hostBoatId]?.name
    }
    return this.clientNameMap.get(this.hostSessionId)
  }

  /**
   * Schedule cleanup timer for empty room (5 minutes)
   */
  private scheduleCleanup() {
    this.cancelCleanup()
    const CLEANUP_DELAY_MS = 5 * 60 * 1000 // 5 minutes
    this.cleanupTimer = setTimeout(() => {
      console.info('[RaceRoom] cleanup timer fired, disposing empty room', {
        roomId: this.roomId,
        roomName: this.metadataRoomName,
      })
      this.disconnect()
    }, CLEANUP_DELAY_MS)
  }

  /**
   * Cancel cleanup timer
   */
  private cancelCleanup() {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer)
      this.cleanupTimer = undefined
    }
    this.lastPlayerLeaveTime = undefined
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
        target.blowSails = false
      }
    })

    // Calculate the three headings for the spin sequence (120° increments)
    const origin = boat.desiredHeadingDeg ?? boat.headingDeg
    const headings = [origin + 120, origin + 240, origin].map((deg) => normalizeDeg(deg))

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
    // Clear one penalty if the boat has any; and clear any active protest on that boat.
    this.clearOnePenaltyAfterSpin(boatId)
  }

  /**
   * Handle "P" clear requests from the client.
   * If the penalty is protest-derived and a protest exists, this is treated as a waiver:
   * the penalty clears but the protest remains as `active_waived`.
   */
  private handlePenaltyClearRequest(boatId: string) {
    if (!this.raceStore) return
    let cleared = false
    let waived = false
    let boatName: string | undefined
    let remaining = 0
    this.mutateState((draft) => {
      const boat = draft.boats[boatId]
      if (!boat) return
      boatName = boat.name

      const protest = (draft.protests ?? {})[boatId]
      const hasProtest = Boolean(protest)
      const hasProtestPenalty = (boat.protestPenalties ?? 0) > 0

      if (hasProtest && hasProtestPenalty) {
        // Waive: clear protest-derived penalty but leave protest active.
        waived = true
        boat.protestPenalties = Math.max(0, (boat.protestPenalties ?? 0) - 1)
        boat.penalties = Math.max(0, (boat.penalties ?? 0) - 1)
        ;(draft.protests ?? {})[boatId] = {
          ...protest,
          status: 'active_waived' satisfies ProtestStatus,
        }
        cleared = true
      } else if ((boat.penalties ?? 0) > 0) {
        // Fallback: clear any penalty (prefer protestPenalties if they exist).
        if ((boat.protestPenalties ?? 0) > 0) {
          boat.protestPenalties = Math.max(0, boat.protestPenalties - 1)
        }
        boat.penalties = Math.max(0, boat.penalties - 1)
        cleared = true
      }
      boat.fouled = (boat.penalties ?? 0) > 0
      remaining = boat.penalties ?? 0
    })

    if (!cleared || !boatName) return

    const state = this.raceStore.getState()
    const event: RaceEvent = {
      eventId: createId('event'),
      kind: 'rule_hint',
      ruleId: 'other',
      boats: [boatId],
      t: state.t,
      message: waived
        ? `${boatName} waived the protest penalty (protest remains)`
        : `${boatName} cleared a penalty (${remaining} remaining)`,
    }
    this.broadcastEvents([event])
  }

  /**
   * Clear one penalty after a spin, and clear any active protest on this boat.
   */
  private clearOnePenaltyAfterSpin(boatId: string) {
    if (!this.raceStore) return
    let clearedPenalty = false
    let clearedProtest = false
    let boatName: string | undefined
    let remaining = 0

    this.mutateState((draft) => {
      const boat = draft.boats[boatId]
      if (!boat) return
      boatName = boat.name

      if ((boat.penalties ?? 0) > 0) {
        if ((boat.protestPenalties ?? 0) > 0) {
          boat.protestPenalties = Math.max(0, boat.protestPenalties - 1)
        }
        boat.penalties = Math.max(0, boat.penalties - 1)
        clearedPenalty = true
      }
      boat.fouled = (boat.penalties ?? 0) > 0
      remaining = boat.penalties ?? 0

      if (draft.protests && draft.protests[boatId]) {
        delete draft.protests[boatId]
        clearedProtest = true
      }
    })

    if (!boatName) return

    const state = this.raceStore.getState()
    const events: RaceEvent[] = []
    if (clearedPenalty) {
      events.push({
        eventId: createId('event'),
        kind: 'rule_hint',
        ruleId: 'other',
        boats: [boatId],
        t: state.t,
        message: `${boatName} completed a 360° spin and cleared a penalty (${remaining} remaining)`,
      })
    }
    if (clearedProtest) {
      events.push({
        eventId: createId('event'),
        kind: 'rule_hint',
        ruleId: 'other',
        boats: [boatId],
        t: state.t,
        message: `${boatName} resolved the protest with a 360° spin`,
      })
    }
    this.broadcastEvents(events)
  }

  private fileProtest(protestorBoatId: string, targetBoatId: string) {
    if (!this.raceStore) return
    if (protestorBoatId === targetBoatId) return

    let filed = false
    let protestorName: string | undefined
    let targetName: string | undefined
    this.mutateState((draft) => {
      draft.protests ??= {}
      const protestor = draft.boats[protestorBoatId]
      const target = draft.boats[targetBoatId]
      if (!protestor || !target) return
      protestorName = protestor.name
      targetName = target.name
      if (draft.protests[targetBoatId]) return

      draft.protests[targetBoatId] = {
        protestedBoatId: targetBoatId,
        protestorBoatId,
        createdAtT: draft.t,
        status: 'active',
      }
      target.penalties = (target.penalties ?? 0) + 1
      target.protestPenalties = (target.protestPenalties ?? 0) + 1
      filed = true
    })

    if (!filed || !protestorName || !targetName) return
    const state = this.raceStore.getState()
    this.broadcastEvents([
      {
        eventId: createId('event'),
        kind: 'rule_hint',
        ruleId: 'other',
        boats: [protestorBoatId, targetBoatId],
        t: state.t,
        message: `${protestorName} protested ${targetName} (penalty applied)`,
      },
    ])
  }

  private revokeProtest(protestorBoatId: string, targetBoatId: string) {
    if (!this.raceStore) return
    let revoked = false
    let protestorName: string | undefined
    let targetName: string | undefined
    let penaltyRemoved = false
    this.mutateState((draft) => {
      const protest = draft.protests?.[targetBoatId]
      if (!protest) return
      if (protest.protestorBoatId !== protestorBoatId) return
      const protestor = draft.boats[protestorBoatId]
      const target = draft.boats[targetBoatId]
      if (!protestor || !target) return
      protestorName = protestor.name
      targetName = target.name

      delete draft.protests?.[targetBoatId]
      revoked = true

      if ((target.protestPenalties ?? 0) > 0) {
        target.protestPenalties = Math.max(0, target.protestPenalties - 1)
        target.penalties = Math.max(0, (target.penalties ?? 0) - 1)
        penaltyRemoved = true
      }
      target.fouled = (target.penalties ?? 0) > 0
    })

    if (!revoked || !protestorName || !targetName) return
    const state = this.raceStore.getState()
    this.broadcastEvents([
      {
        eventId: createId('event'),
        kind: 'rule_hint',
        ruleId: 'other',
        boats: [protestorBoatId, targetBoatId],
        t: state.t,
        message: penaltyRemoved
          ? `${protestorName} revoked the protest vs ${targetName} (penalty removed)`
          : `${protestorName} revoked the protest vs ${targetName}`,
      },
    ])
  }

  private clearProtestAsJudge(targetBoatId: string) {
    if (!this.raceStore) return
    let cleared = false
    let targetName: string | undefined
    let penaltyRemoved = false
    this.mutateState((draft) => {
      const protest = draft.protests?.[targetBoatId]
      if (!protest) return
      const target = draft.boats[targetBoatId]
      if (!target) return
      targetName = target.name
      delete draft.protests?.[targetBoatId]
      cleared = true
      if ((target.protestPenalties ?? 0) > 0) {
        target.protestPenalties = Math.max(0, target.protestPenalties - 1)
        target.penalties = Math.max(0, (target.penalties ?? 0) - 1)
        penaltyRemoved = true
      }
      target.fouled = (target.penalties ?? 0) > 0
    })

    if (!cleared || !targetName) return
    const state = this.raceStore.getState()
    this.broadcastEvents([
      {
        eventId: createId('event'),
        kind: 'rule_hint',
        ruleId: 'other',
        boats: [targetBoatId],
        t: state.t,
        message: penaltyRemoved
          ? `Judge cleared the protest vs ${targetName} (penalty removed)`
          : `Judge cleared the protest vs ${targetName}`,
      },
    ])
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

  private reattachBoatToClient(
    client: Client,
    boatId: string,
    options?: Record<string, unknown>,
  ) {
    this.mutateState((draft) => {
      const boat = draft.boats[boatId]
      if (!boat) return
      const displayName = this.resolvePlayerName(client, options)
      boat.ai = undefined
      boat.name = displayName

      this.clientBoatMap.set(client.sessionId, boatId)
      if (!draft.leaderboard.includes(boatId)) {
        draft.leaderboard.push(boatId)
      }
      if (client.sessionId === this.hostSessionId) {
        draft.hostBoatId = boatId
        this.raceStore?.setHostBoat(boatId)
      }
      this.clientNameMap.set(client.sessionId, displayName)
    })

    client.send('boat_assignment', { boatId })
    roomDebug('reattachBoatToClient', {
      clientId: client.sessionId,
      boatId,
      hostSessionId: this.hostSessionId,
    })
  }

  private releaseBoat(client: Client) {
    const boatId = this.clientBoatMap.get(client.sessionId)
    this.clientRoleMap.delete(client.sessionId)
    this.clientIdentityMap.delete(client.sessionId)
    this.clientNameMap.delete(client.sessionId)
    if (!boatId) {
      return
    }
    this.clientBoatMap.delete(client.sessionId)
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
    const role = this.clientRoleMap.get(client.sessionId) ?? 'player'
    if (role !== 'player') {
      return undefined
    }
    if (
      preferredId &&
      Object.values(this.raceStore?.getState().boats ?? {}).some(
        (boat) => boat.id === preferredId,
      )
    ) {
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

  private resolveJoinRole(options?: Record<string, unknown>): JoinRoleOption {
    const raw = typeof options?.role === 'string' ? options.role.trim() : ''
    if (raw === 'judge') return 'judge'
    if (raw === 'spectator') return 'spectator'
    if (raw === 'god' && appEnv.debugHud) return 'god'
    // default: join as a controlling player
    return 'player'
  }

  private setPaused(paused: boolean) {
    if (!this.raceStore) return
    const next = Boolean(paused)
    this.loop?.setPaused?.(next)
    this.mutateState((draft) => {
      draft.paused = next
      if (next) {
        // Freeze the race clock while paused.
        draft.clockStartMs = null
      } else if (draft.phase === 'running') {
        // Resume wall clock so that t continues smoothly from the current value.
        draft.clockStartMs = Date.now() - draft.t * 1000
      }
    })
  }

  private setWindFieldEnabled(enabled: boolean) {
    if (!this.raceStore) return
    const next = Boolean(enabled)
    this.mutateState((draft) => {
      // Ensure a config object exists (older recordings / mismatched clients could omit it).
      draft.windField = draft.windField ?? {
        enabled: next,
        intensityKts: appEnv.windFieldIntensityKts,
        count: appEnv.windFieldCount,
        sizeWorld: appEnv.windFieldSizeWorld,
        domainLengthWorld: appEnv.windFieldDomainLengthWorld,
        domainWidthWorld: appEnv.windFieldDomainWidthWorld,
        advectionFactor: appEnv.windFieldAdvectionFactor,
        tileSizeWorld: appEnv.windFieldTileSizeWorld,
      }
      draft.windField.enabled = next
    })
  }

  private debugSetBoatPosition(boatId: string, x: number, y: number) {
    if (!this.raceStore) return
    const state = this.raceStore.getState()
    if (!state.paused) return
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    this.mutateState((draft) => {
      const boat = draft.boats[boatId]
      if (!boat) return
      boat.pos = { x, y }
      boat.prevPos = { x, y }
    })
  }

  private findExistingSessionId(clientId: string, currentSessionId: string) {
    for (const [sessionId, knownClientId] of this.clientIdentityMap.entries()) {
      if (sessionId === currentSessionId) continue
      if (knownClientId === clientId) return sessionId
    }
    return undefined
  }

  private evictSession(sessionId: string, opts?: { preserveBoat?: boolean }) {
    // Ask the old client to leave.
    const oldClient = this.clients.find((c) => c.sessionId === sessionId)
    try {
      oldClient?.leave(4001, 'replaced')
    } catch (err) {
      console.warn('[RaceRoom] failed to leave() old client', { sessionId, err })
    }

    // Remove any boat controlled by the old session, and clear bookkeeping maps.
    const boatId = this.clientBoatMap.get(sessionId)
    this.clientBoatMap.delete(sessionId)
    this.clientIdentityMap.delete(sessionId)
    this.clientNameMap.delete(sessionId)
    this.clientRoleMap.delete(sessionId)

    if (!boatId) return
    if (opts?.preserveBoat) return
    this.mutateState((draft) => {
      if (draft.boats[boatId]) {
        delete draft.boats[boatId]
        draft.leaderboard = draft.leaderboard.filter((id) => id !== boatId)
      }
    })
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
      hostBoatId && this.raceStore
        ? this.raceStore.getState().boats[hostBoatId]?.name
        : undefined
    const schemaName = hostBoatId
      ? this.state.race.boats.get(hostBoatId)?.name
      : undefined
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
    this.hostClientId = sessionId
      ? (this.clientIdentityMap.get(sessionId) ?? sessionId)
      : undefined
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
    this.broadcastRoster()
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

  private resetRaceState() {
    const assignment = Array.from(this.clientBoatMap.entries()).map(
      ([sessionId, boatId], idx) => ({
        boatId,
        name:
          this.state.race.boats.get(boatId)?.name ?? `Sailor ${sessionId.slice(0, 4)}`,
        index: idx,
      }),
    )
    roomDebug('resetRaceState', {
      assignments: assignment.length,
      ...this.describeHost(this.hostSessionId),
    })
    this.mutateState((draft) => {
      // Refresh course geometry on reset so edits in shared `createInitialRaceState`
      // (marks/gate/start line) take effect without recreating the room.
      const fresh = createInitialRaceState(draft.meta.raceId, appEnv.countdownSeconds)
      draft.marks = fresh.marks
      draft.startLine = fresh.startLine
      draft.leewardGate = fresh.leewardGate

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
      const hostBoatId = this.hostSessionId
        ? this.clientBoatMap.get(this.hostSessionId)
        : this.raceStore?.getState().hostBoatId
      draft.hostBoatId = hostBoatId ?? draft.hostBoatId ?? ''
    })
    const nextState = this.raceStore?.getState()
    if (nextState) {
      this.loop?.reset(nextState)
      const hostBoatId = this.hostSessionId
        ? this.clientBoatMap.get(this.hostSessionId)
        : nextState.hostBoatId
      this.raceStore?.setHostBoat(hostBoatId)
      if (hostBoatId && this.raceStore) {
        const mutable = this.raceStore.getState()
        mutable.hostBoatId = hostBoatId
        this.loop?.reset(mutable)
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
      client.sessionId === this.hostSessionId ? 'host' : boatId ? 'player' : 'spectator'
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
  }

  private canSendChat(clientId: string) {
    const windowMs = 10_000
    const limit = 5
    const now = Date.now()
    const recent = (this.chatRateMap.get(clientId) ?? []).filter(
      (ts) => now - ts < windowMs,
    )
    if (recent.length >= limit) {
      this.chatRateMap.set(clientId, recent)
      return false
    }
    recent.push(now)
    this.chatRateMap.set(clientId, recent)
    return true
  }
}
