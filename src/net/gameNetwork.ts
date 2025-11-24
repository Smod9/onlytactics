import type { RaceRole, RaceState } from '@/types/race'
import { quantizeHeading } from '@/logic/physics'
import { HostController } from './controllers/hostController'
import { PlayerController } from './controllers/playerController'
import { SpectatorController } from './controllers/spectatorController'
import type { Controller } from './controllers/types'
import { mqttClient } from '@/net/mqttClient'
import { hostTopic, presenceTopic, presenceWildcard, stateTopic } from './topics'
import { identity } from '@/net/identity'
import { appEnv } from '@/config/env'

type HostAnnouncement = { clientId: string; updatedAt: number }

export class GameNetwork {
  private controller?: Controller

  private playerController?: PlayerController

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

  async start() {
    this.setStatus('connecting')
    await mqttClient.connect()
    this.ensureStateSubscription()
    this.setStatus('looking_for_host')
    this.announcePresence('online')
    const role = await this.resolveInitialRole()
    await this.setRole(role)
  }

  stop() {
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

  updateDesiredHeading(headingDeg: number, seq: number, deltaHeadingDeg?: number) {
    const absolute = quantizeHeading(headingDeg)
    this.latestHeadingDeg = absolute
    this.controller?.updateLocalInput?.({
      desiredHeadingDeg: absolute,
      absoluteHeadingDeg: absolute,
      deltaHeadingDeg,
      clientSeq: seq,
    })
  }

  requestSpin(seq?: number) {
    this.controller?.updateLocalInput?.({ spin: 'full', clientSeq: seq })
  }

  private async setRole(role: RaceRole) {
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
    this.currentRole = role
    this.roleListeners.forEach((listener) => listener(role))
  }

  getPlayerController() {
    return this.playerController
  }

  armCountdown(seconds = 15) {
    if (this.controller instanceof HostController) {
      this.controller.armCountdown(seconds)
    }
  }

  private ensureBoatAssignment() {
    // placeholder for future multi-boat assignment logic
  }

  announcePresence(status: 'online' | 'offline' = 'online') {
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
}

type NetworkStatus = 'idle' | 'connecting' | 'looking_for_host' | 'joining' | 'ready'

