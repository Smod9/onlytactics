import type { ChatMessage, RaceRole, RaceState } from '@/types/race'
import { quantizeHeading } from '@/logic/physics'
import { HostController } from './controllers/hostController'
import { PlayerController } from './controllers/playerController'
import { SpectatorController } from './controllers/spectatorController'
import type { Controller } from './controllers/types'
import { mqttClient } from '@/net/mqttClient'
import { hostTopic, presenceTopic, presenceWildcard, stateTopic } from './topics'
import { identity } from '@/net/identity'
import { appEnv } from '@/config/env'
import { raceStore } from '@/state/raceStore'
import { ColyseusBridge } from './colyseusBridge'

const netLog = (...args: unknown[]) => {
  if (!appEnv.debugNetLogs) return
  console.info('[GameNetwork]', ...args)
}

type HostAnnouncement = { clientId: string; updatedAt: number }

export class GameNetwork {
  private controller?: Controller

  private playerController?: PlayerController

  private colyseusBridge?: ColyseusBridge

  private colyseusRoleUnsub?: () => void
  private colyseusChatUnsub?: () => void

  private latestHeadingDeg = 0

  private currentRole: RaceRole = 'spectator'

  private roleListeners = new Set<(role: RaceRole) => void>()

  private status: NetworkStatus = 'idle'

  private statusListeners = new Set<(status: NetworkStatus) => void>()

  private stateUnsubscribe?: () => void
  private hostMonitorTimer?: number
  private lastStateAt = Date.now()
  private knownHostId?: string
  private promotePending = false
  private startPromise?: Promise<void>
  private stopRequested = false
  private lastLoggedHostId?: string
  private chatListeners = new Set<(message: ChatMessage) => void>()

  async start() {
    if (this.startPromise) return this.startPromise
    netLog('start()', { transport: this.useColyseus() ? 'colyseus' : 'mqtt' })
    this.stopRequested = false
    this.startPromise = (async () => {
      this.setStatus('connecting')
      if (this.useColyseus()) {
        await this.startColyseus()
      } else {
        await this.startViaMqtt()
      }
    })()
    try {
      await this.startPromise
    } finally {
      this.startPromise = undefined
    }
  }

  stop() {
    netLog('stop()', { transport: this.useColyseus() ? 'colyseus' : 'mqtt' })
    this.stopRequested = true
    if (this.useColyseus()) {
      this.teardownColyseus()
      return
    }
    this.announcePresence('offline')
    this.controller?.stop()
    this.stopHostMonitor()
    this.stateUnsubscribe?.()
    this.stateUnsubscribe = undefined
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

  onChatMessage(listener: (message: ChatMessage) => void) {
    this.chatListeners.add(listener)
    return () => this.chatListeners.delete(listener)
  }

  sendChat(text: string) {
    if (!text.trim()) return false
    if (this.useColyseus()) {
      if (!this.colyseusBridge) return false
      this.colyseusBridge.sendChat(text)
      return true
    }
    netLog('sendChat() ignored for MQTT transport')
    return false
  }

  private emitChat(message: ChatMessage) {
    this.chatListeners.forEach((listener) => listener(message))
  }

  updateDesiredHeading(headingDeg: number, seq: number, deltaHeadingDeg?: number) {
    const absolute = quantizeHeading(headingDeg)
    this.latestHeadingDeg = absolute
    if (this.useColyseus()) {
      this.colyseusBridge?.sendInput({
        boatId: identity.boatId,
        seq,
        desiredHeadingDeg: absolute,
        absoluteHeadingDeg: absolute,
        deltaHeadingDeg,
        tClient: Date.now(),
      })
      return
    }
    this.controller?.updateLocalInput?.({
      desiredHeadingDeg: absolute,
      absoluteHeadingDeg: absolute,
      deltaHeadingDeg,
      clientSeq: seq,
    })
  }

  requestSpin(seq?: number) {
    if (this.useColyseus()) {
      this.colyseusBridge?.sendInput({
        boatId: identity.boatId,
        seq: seq ?? 0,
        spin: 'full',
        tClient: Date.now(),
      })
      return
    }
    this.controller?.updateLocalInput?.({ spin: 'full', clientSeq: seq })
  }

  updateVmgMode(vmgMode: boolean, seq: number) {
    if (this.useColyseus()) {
      this.colyseusBridge?.sendInput({
        boatId: identity.boatId,
        seq,
        vmgMode,
        tClient: Date.now(),
      })
      return
    }
    this.controller?.updateLocalInput?.({
      vmgMode,
      clientSeq: seq,
    })
  }

  clearOnePenalty() {
    netLog('clearOnePenalty()')
    if (!this.useColyseus()) {
      netLog('clearOnePenalty() not supported for MQTT mode')
      return
    }
    this.colyseusBridge?.sendInput({
      boatId: identity.boatId,
      seq: 0,
      clearPenalty: true,
      tClient: Date.now(),
    })
  }

  private async setRole(role: RaceRole) {
    netLog('setRole()', { nextRole: role })
    this.setStatus('joining')
    this.controller?.stop()
    if (role === 'host') {
      this.controller = new HostController()
      this.playerController = undefined
    } else if (role === 'player') {
      this.ensureBoatAssignment()
      this.playerController = new PlayerController(() => this.promoteToHost())
      this.controller = this.playerController
    } else {
      this.controller = new SpectatorController()
      this.playerController = undefined
    }
    await this.controller.start()
    this.controller.updateLocalInput?.({ desiredHeadingDeg: this.latestHeadingDeg })
    this.setCurrentRole(role)
    this.setStatus('ready')
    this.announcePresence('online')
    if (role === 'host') {
      this.knownHostId = identity.clientId
      this.stopHostMonitor()
    } else {
      this.startHostMonitor()
    }
  }

  private async promoteToHost() {
    netLog('promoteToHost()')
    await this.setRole('host')
  }

  private resolveInitialRole() {
    return new Promise<RaceRole>((resolve) => {
      let resolved = false
      const online = new Set<string>([identity.clientId])
      const presenceStatus = new Map<string, 'online' | 'offline'>()
      presenceStatus.set(identity.clientId, 'online')
      const cleanup: Array<() => void> = []

      const finish = (role: RaceRole) => {
        if (resolved) return
        resolved = true
        cleanup.forEach((fn) => fn())
        resolve(role)
      }

      const timeout = window.setTimeout(() => {
        const candidates = Array.from(online).sort()
        finish(candidates[0] === identity.clientId ? 'host' : 'player')
      }, 3000)

      cleanup.push(() => window.clearTimeout(timeout))

      const unsubscribeHost = mqttClient.subscribe<HostAnnouncement>(hostTopic, (payload) => {
        if (resolved) return
        if (!payload?.clientId) return
        const status = presenceStatus.get(payload.clientId)
        if (status && status === 'online') {
          finish(payload.clientId === identity.clientId ? 'host' : 'player')
        }
      })
      cleanup.push(unsubscribeHost)

      const unsubscribePresence = mqttClient.subscribe<{
        clientId: string
        status: 'online' | 'offline'
      }>(presenceWildcard, (message) => {
        if (!message?.clientId) return
        presenceStatus.set(message.clientId, message.status)
        if (message.status === 'online') {
          online.add(message.clientId)
        } else {
          online.delete(message.clientId)
        }
      })
      cleanup.push(unsubscribePresence)

      const unsubscribeState = mqttClient.subscribe<RaceState>(stateTopic, (state) => {
        if (resolved) return
        if (state?.hostId && state.hostId !== identity.clientId) {
          finish('player')
        }
      })
      cleanup.push(unsubscribeState)
    })
  }

  private setCurrentRole(role: RaceRole) {
    if (this.currentRole !== role) {
      netLog('role change', { from: this.currentRole, to: role })
    }
    this.currentRole = role
    this.roleListeners.forEach((listener) => listener(role))
  }

  getPlayerController() {
    return this.playerController
  }

  armCountdown(seconds = 15) {
    if (this.useColyseus()) {
      netLog('send host command', { kind: 'arm', seconds })
      this.colyseusBridge?.sendHostCommand({ kind: 'arm', seconds })
      return
    }
    if (this.controller instanceof HostController) {
      this.controller.armCountdown(seconds)
    }
  }

  setAiEnabled(enabled: boolean) {
    netLog('setAiEnabled()', { enabled })
    if (this.controller instanceof HostController) {
      this.controller.setAiEnabled(enabled)
    }
  }

  resetRace() {
    if (this.useColyseus()) {
      netLog('send host command', { kind: 'reset' })
      this.colyseusBridge?.sendHostCommand({ kind: 'reset' })
      return
    }
    if (this.controller instanceof HostController) {
      this.controller.resetRace()
    }
  }

  private ensureBoatAssignment() {
    // placeholder for future multi-boat assignment logic
  }

  announcePresence(status: 'online' | 'offline' = 'online') {
    if (this.useColyseus()) return
    mqttClient.publish(
      presenceTopic(identity.clientId),
      {
        clientId: identity.clientId,
        status,
        name: identity.clientName,
        role: this.currentRole,
        boatId: identity.boatId,
      },
      { retain: true },
    )
  }

  private setStatus(status: NetworkStatus) {
    if (this.status === status) return
    this.status = status
    this.statusListeners.forEach((listener) => listener(status))
  }

  private ensureStateSubscription() {
    if (this.stateUnsubscribe) return
    this.stateUnsubscribe = mqttClient.subscribe<RaceState>(stateTopic, (state) => {
      if (!state) return
      this.lastStateAt = Date.now()
      if (state.hostId) {
        this.knownHostId = state.hostId
      }
    })
  }

  private startHostMonitor() {
    if (this.hostMonitorTimer) return
    this.hostMonitorTimer = window.setInterval(() => this.checkHostHeartbeat(), 1000)
  }

  private stopHostMonitor() {
    if (this.hostMonitorTimer) {
      window.clearInterval(this.hostMonitorTimer)
      this.hostMonitorTimer = undefined
    }
  }
  private checkHostHeartbeat() {
    if (this.currentRole === 'host') return
    const now = Date.now()
    if (this.knownHostId && this.knownHostId !== identity.clientId) {
      if (now - this.lastStateAt <= appEnv.hostHeartbeatMs) {
        return
      }
    }
    if (this.promotePending) return
    this.promotePending = true
    const jitter = 500 + Math.random() * 1000
    window.setTimeout(() => {
      this.promotePending = false
      if (this.currentRole === 'host') return
      if (Date.now() - this.lastStateAt > appEnv.hostHeartbeatMs) {
        void this.promoteToHost()
      }
    }, jitter)
  }

  private useColyseus() {
    return appEnv.netTransport === 'colyseus'
  }

  private async startViaMqtt() {
    await mqttClient.connect()
    if (this.stopRequested) {
      mqttClient.disconnect()
      return
    }
    this.ensureStateSubscription()
    this.setStatus('looking_for_host')
    this.announcePresence('online')
    const role = await this.resolveInitialRole()
    if (this.stopRequested) {
      this.announcePresence('offline')
      return
    }
    await this.setRole(role)
  }

  private async startColyseus() {
    if (!this.colyseusBridge) {
      this.colyseusBridge = new ColyseusBridge(appEnv.colyseusEndpoint, appEnv.colyseusRoomId)
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
    netLog('colyseus connect()', {
      endpoint: appEnv.colyseusEndpoint,
      roomId: appEnv.colyseusRoomId,
    })
    await this.colyseusBridge.connect()
    if (this.stopRequested || !this.colyseusBridge) {
      this.teardownColyseus()
      return
    }
    netLog('colyseus joined', { sessionId: this.colyseusBridge.getSessionId() })
    this.colyseusRoleUnsub?.()
    this.colyseusRoleUnsub = raceStore.subscribe(() => this.syncColyseusRole())
    this.colyseusChatUnsub?.()
    this.colyseusChatUnsub = this.colyseusBridge.onChatMessage((message) => this.emitChat(message))
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
    const nextRole: RaceRole = hostId ? (isHost ? 'host' : 'player') : 'spectator'
    this.setCurrentRole(nextRole)
  }
}

type NetworkStatus = 'idle' | 'connecting' | 'looking_for_host' | 'joining' | 'ready'

