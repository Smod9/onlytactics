import type { ChatMessage, RaceRole } from '@/types/race'
import { quantizeHeading } from '@/logic/physics'
import { identity } from '@/net/identity'
import { appEnv } from '@/config/env'
import { raceStore } from '@/state/raceStore'
import { ColyseusBridge } from './colyseusBridge'

const netLog = (...args: unknown[]) => {
  if (!appEnv.debugNetLogs) return
  console.info('[GameNetwork]', ...args)
}

type NonHostRole = Exclude<RaceRole, 'host'>

const ROLE_PREFERENCE_KEY = 'sgame:rolePreference'

export class GameNetwork {
  private colyseusBridge?: ColyseusBridge

  private colyseusRoleUnsub?: () => void
  private colyseusChatUnsub?: () => void
  private colyseusRoleAssignmentUnsub?: () => void
  private colyseusAssignedRole?: Exclude<RaceRole, 'host'>
  private colyseusRoomClosedUnsub?: () => void

  private currentRole: RaceRole = 'spectator'

  private desiredRoleOverride?: Exclude<RaceRole, 'host'>

  private roleListeners = new Set<(role: RaceRole) => void>()

  private status: NetworkStatus = 'idle'

  private statusListeners = new Set<(status: NetworkStatus) => void>()
  private roomClosedListeners = new Set<(payload: { reason?: string }) => void>()

  private startPromise?: Promise<void>
  private stopRequested = false
  private lastLoggedHostId?: string
  private chatListeners = new Set<(message: ChatMessage) => void>()

  private roomId?: string

  constructor(roomId?: string) {
    this.roomId = roomId
    // Allow simple role selection via URL, e.g. `/app?role=judge` or `/app?role=spectator`.
    // If no URL override, fall back to a persisted preference.
    this.desiredRoleOverride =
      this.readRoleOverrideFromUrl() ?? this.readRoleOverrideFromStorage()
  }

  /**
   * Switch between player/spectator/judge. This reconnects so the server
   * can apply the join options (boat assignment or no-boat).
   */
  async switchRole(next: NonHostRole) {
    if (next === 'god' && !appEnv.debugHud) {
      return
    }

    // Persist preference. We store only spectator/judge; player is the default (clear).
    if (typeof window !== 'undefined') {
      if (next === 'spectator' || next === 'judge' || next === 'god') {
        window.localStorage.setItem(ROLE_PREFERENCE_KEY, next)
      } else {
        window.localStorage.removeItem(ROLE_PREFERENCE_KEY)
      }
    }

    this.desiredRoleOverride = next === 'player' ? undefined : next

    this.stop()
    await this.start()
  }

  async start() {
    if (this.startPromise) return this.startPromise
    netLog('start()', { transport: 'colyseus' })
    this.stopRequested = false
    this.startPromise = (async () => {
      this.setStatus('connecting')
      try {
        await this.startColyseus()
      } catch (err) {
        this.setStatus('idle')
        throw err
      }
    })()
    try {
      await this.startPromise
    } finally {
      this.startPromise = undefined
    }
  }

  stop() {
    netLog('stop()', { transport: 'colyseus' })
    this.stopRequested = true
    this.teardownColyseus()
  }

  getRole() {
    return this.currentRole
  }

  getStatus() {
    return this.status
  }

  onRoleChange(listener: (role: RaceRole) => void) {
    this.roleListeners.add(listener)
    return () => this.roleListeners.delete(listener)
  }

  onStatusChange(listener: (status: NetworkStatus) => void) {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  onRoomClosed(listener: (payload: { reason?: string }) => void) {
    this.roomClosedListeners.add(listener)
    return () => {
      this.roomClosedListeners.delete(listener)
    }
  }

  onChatMessage(listener: (message: ChatMessage) => void) {
    this.chatListeners.add(listener)
    return () => this.chatListeners.delete(listener)
  }

  sendChat(text: string) {
    if (!text.trim()) return false
    if (!this.colyseusBridge) return false
    this.colyseusBridge.sendChat(text)
    return true
  }

  fileProtest(targetBoatId: string) {
    if (!targetBoatId) return
    this.colyseusBridge?.sendProtestCommand({ kind: 'file', targetBoatId })
  }

  revokeProtest(targetBoatId: string) {
    if (!targetBoatId) return
    this.colyseusBridge?.sendProtestCommand({ kind: 'revoke', targetBoatId })
  }

  judgeClearProtest(targetBoatId: string) {
    if (!targetBoatId) return
    this.colyseusBridge?.sendProtestCommand({ kind: 'judge_clear', targetBoatId })
  }

  private emitChat(message: ChatMessage) {
    this.chatListeners.forEach((listener) => listener(message))
  }

  updateDesiredHeading(headingDeg: number, seq: number, deltaHeadingDeg?: number) {
    const absolute = quantizeHeading(headingDeg)
    this.colyseusBridge?.sendInput({
      boatId: identity.boatId,
      seq,
      desiredHeadingDeg: absolute,
      absoluteHeadingDeg: absolute,
      deltaHeadingDeg,
      tClient: Date.now(),
    })
  }

  requestSpin(seq?: number) {
    this.colyseusBridge?.sendInput({
      boatId: identity.boatId,
      seq: seq ?? 0,
      spin: 'full',
      tClient: Date.now(),
    })
  }

  updateVmgMode(vmgMode: boolean, seq: number) {
    this.colyseusBridge?.sendInput({
      boatId: identity.boatId,
      seq,
      vmgMode,
      tClient: Date.now(),
    })
  }

  setBlowSails(blowSails: boolean, seq: number) {
    this.colyseusBridge?.sendInput({
      boatId: identity.boatId,
      seq,
      blowSails,
      tClient: Date.now(),
    })
  }

  clearOnePenalty() {
    netLog('clearOnePenalty()')
    this.colyseusBridge?.sendInput({
      boatId: identity.boatId,
      seq: 0,
      clearPenalty: true,
      tClient: Date.now(),
    })
  }

  armCountdown(seconds = 15) {
    netLog('send host command', { kind: 'arm', seconds })
    this.colyseusBridge?.sendHostCommand({ kind: 'arm', seconds })
  }

  setAiEnabled(enabled: boolean) {
    // This exists for legacy UI/debug controls. AI enable/disable is not currently wired
    // through Colyseus host commands, so treat this as a no-op for now.
    netLog('setAiEnabled() ignored (not supported)', { enabled })
  }

  debugAdvanceBoatLap(boatId: string) {
    netLog('send host command', { kind: 'debug_lap', boatId })
    this.colyseusBridge?.sendHostCommand({ kind: 'debug_lap', boatId })
  }

  debugFinishBoat(boatId: string) {
    netLog('send host command', { kind: 'debug_finish', boatId })
    this.colyseusBridge?.sendHostCommand({ kind: 'debug_finish', boatId })
  }

  debugJumpBoatToNextMark(boatId: string) {
    netLog('send host command', { kind: 'debug_warp', boatId })
    this.colyseusBridge?.sendHostCommand({ kind: 'debug_warp', boatId })
  }

  relinquishHost() {
    netLog('relinquish host')
    this.colyseusBridge?.sendRelinquishHost()
  }

  finishRace() {
    netLog('send host command', { kind: 'finish_race' })
    this.colyseusBridge?.sendHostCommand({ kind: 'finish_race' })
  }

  resetRace() {
    netLog('send host command', { kind: 'reset' })
    this.colyseusBridge?.sendHostCommand({ kind: 'reset' })
  }

  setPaused(paused: boolean) {
    netLog('send host command', { kind: 'pause', paused })
    this.colyseusBridge?.sendHostCommand({ kind: 'pause', paused: Boolean(paused) })
  }

  setWindFieldEnabled(enabled: boolean) {
    netLog('send host command', { kind: 'wind_field', enabled })
    this.colyseusBridge?.sendHostCommand({
      kind: 'wind_field',
      enabled: Boolean(enabled),
    })
  }

  debugSetBoatPosition(boatId: string, pos: { x: number; y: number }) {
    netLog('send host command', { kind: 'debug_set_pos', boatId, pos })
    this.colyseusBridge?.sendHostCommand({
      kind: 'debug_set_pos',
      boatId,
      x: pos.x,
      y: pos.y,
    })
  }

  /**
   * Set the room ID to connect to
   */
  setRoomId(roomId: string | undefined) {
    this.roomId = roomId
  }

  private async startColyseus() {
    if (!this.colyseusBridge) {
      const roomId = this.roomId ?? 'race_room'
      this.colyseusBridge = new ColyseusBridge(appEnv.colyseusEndpoint, roomId)
      this.colyseusBridge.onStatusChange((status) => {
        netLog('colyseus status', { status })
        if (status === 'connected') {
          this.setStatus('ready')
        } else if (status === 'connecting') {
          this.setStatus('connecting')
        } else if (status === 'disconnected') {
          this.setStatus('idle')
        } else if (status === 'error') {
          this.setStatus('idle')
        }
      })
    }
    const roomId = this.roomId ?? 'race_room'
    netLog('colyseus connect()', {
      endpoint: appEnv.colyseusEndpoint,
      roomId,
      joinExisting: Boolean(this.roomId),
    })
    await this.colyseusBridge.connect({
      role: this.desiredRoleOverride,
      joinExisting: Boolean(this.roomId),
    })
    if (this.stopRequested || !this.colyseusBridge) {
      this.teardownColyseus()
      return
    }
    netLog('colyseus joined', { sessionId: this.colyseusBridge.getSessionId() })
    this.colyseusRoleAssignmentUnsub?.()
    this.colyseusAssignedRole = undefined
    this.colyseusRoleAssignmentUnsub = this.colyseusBridge.onRoleAssignment((role) => {
      this.colyseusAssignedRole = role
      this.syncColyseusRole()
    })
    this.colyseusRoleUnsub?.()
    this.colyseusRoleUnsub = raceStore.subscribe(() => this.syncColyseusRole())
    this.colyseusChatUnsub?.()
    this.colyseusChatUnsub = this.colyseusBridge.onChatMessage((message) =>
      this.emitChat(message),
    )
    this.colyseusRoomClosedUnsub?.()
    this.colyseusRoomClosedUnsub = this.colyseusBridge.onRoomClosed((payload) =>
      this.emitRoomClosed(payload),
    )
    this.syncColyseusRole()
    this.setStatus('ready')
  }

  private teardownColyseus() {
    this.colyseusBridge?.disconnect()
    netLog('colyseus disconnect')
    this.colyseusBridge = undefined
    this.colyseusRoleUnsub?.()
    this.colyseusRoleUnsub = undefined
    this.colyseusChatUnsub?.()
    this.colyseusChatUnsub = undefined
    this.colyseusRoleAssignmentUnsub?.()
    this.colyseusRoleAssignmentUnsub = undefined
    this.colyseusAssignedRole = undefined
    this.colyseusRoomClosedUnsub?.()
    this.colyseusRoomClosedUnsub = undefined
    this.setStatus('idle')
  }

  private syncColyseusRole() {
    if (!this.colyseusBridge) return
    const sessionId = this.colyseusBridge.getSessionId()
    if (!sessionId) return
    const hostId = raceStore.getState().hostId
    const clientId = identity.clientId
    const isHost = Boolean(hostId && hostId === clientId)
    netLog('syncColyseusRole()', { hostId, sessionId, clientId })
    if (hostId !== this.lastLoggedHostId) {
      this.lastLoggedHostId = hostId
      netLog('hostId update', { hostId, sessionId, clientId })
    }
    // Non-host special roles must be acknowledged by the server.
    if (this.colyseusAssignedRole === 'judge') {
      this.setCurrentRole('judge')
      return
    }
    if (this.colyseusAssignedRole === 'spectator') {
      this.setCurrentRole('spectator')
      return
    }
    if (this.colyseusAssignedRole === 'god') {
      this.setCurrentRole('god')
      return
    }

    const nextRole: RaceRole = hostId ? (isHost ? 'host' : 'player') : 'spectator'
    this.setCurrentRole(nextRole)
  }

  private setCurrentRole(role: RaceRole) {
    if (this.currentRole !== role) {
      netLog('role change', { from: this.currentRole, to: role })
    }
    this.currentRole = role
    this.roleListeners.forEach((listener) => listener(role))
  }

  private setStatus(status: NetworkStatus) {
    if (this.status === status) return
    this.status = status
    this.statusListeners.forEach((listener) => listener(status))
  }

  private emitRoomClosed(payload: { reason?: string }) {
    this.roomClosedListeners.forEach((listener) => listener(payload))
  }

  private readRoleOverrideFromUrl(): Exclude<RaceRole, 'host'> | undefined {
    if (typeof window === 'undefined') return undefined
    const params = new URLSearchParams(window.location.search)
    const raw = (params.get('role') ?? '').trim().toLowerCase()
    if (raw === 'judge') return 'judge'
    if (raw === 'spectator') return 'spectator'
    if (raw === 'god' && appEnv.debugHud) return 'god'
    return undefined
  }

  private readRoleOverrideFromStorage(): Exclude<RaceRole, 'host'> | undefined {
    if (typeof window === 'undefined') return undefined
    const raw = (window.localStorage.getItem(ROLE_PREFERENCE_KEY) ?? '')
      .trim()
      .toLowerCase()
    if (raw === 'judge') return 'judge'
    if (raw === 'spectator') return 'spectator'
    if (raw === 'god' && appEnv.debugHud) return 'god'
    return undefined
  }
}

type NetworkStatus = 'idle' | 'connecting' | 'ready'
