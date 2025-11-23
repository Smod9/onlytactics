import type { RaceRole } from '@/types/race'
import { normalizeDeg } from '@/logic/physics'
import { HostController } from './controllers/hostController'
import { PlayerController } from './controllers/playerController'
import { SpectatorController } from './controllers/spectatorController'
import type { Controller } from './controllers/types'
import { mqttClient } from '@/net/mqttClient'
import { hostTopic, presenceTopic, presenceWildcard } from './topics'
import { identity } from '@/net/identity'

type HostAnnouncement = { clientId: string; updatedAt: number }

export class GameNetwork {
  private controller?: Controller

  private playerController?: PlayerController

  private latestHeadingDeg = 0

  private currentRole: RaceRole = 'spectator'

  private roleListeners = new Set<(role: RaceRole) => void>()

  async start() {
    await mqttClient.connect()
    this.announcePresence('online')
    const role = await this.resolveInitialRole()
    await this.setRole(role)
  }

  stop() {
    this.announcePresence('offline')
    this.controller?.stop()
  }

  getRole() {
    return this.currentRole
  }

  onRoleChange(listener: (role: RaceRole) => void) {
    this.roleListeners.add(listener)
    return () => this.roleListeners.delete(listener)
  }

  updateDesiredHeading(headingDeg: number) {
    this.latestHeadingDeg = normalizeDeg(headingDeg)
    this.controller?.updateLocalInput?.({ desiredHeadingDeg: this.latestHeadingDeg })
  }

  requestSpin() {
    this.controller?.updateLocalInput?.({ spin: 'full' })
  }

  private async setRole(role: RaceRole) {
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
    this.announcePresence('online')
  }

  private async promoteToHost() {
    await this.setRole('host')
  }

  private resolveInitialRole() {
    return new Promise<RaceRole>((resolve) => {
      let resolved = false
      const online = new Set<string>([identity.clientId])
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

      const unsubscribeHost = mqttClient.subscribe<HostAnnouncement>(
        hostTopic,
        (payload) => {
          if (resolved) return
          if (!payload?.clientId) return
          mqttClient.publish(hostTopic, payload, { retain: true })
          finish(payload.clientId === identity.clientId ? 'host' : 'player')
        },
      )
      cleanup.push(unsubscribeHost)

      const unsubscribePresence = mqttClient.subscribe<{
        clientId: string
        status: 'online' | 'offline'
      }>(presenceWildcard, (message) => {
        if (!message?.clientId) return
        if (message.status === 'online') {
          online.add(message.clientId)
        } else {
          online.delete(message.clientId)
        }
      })
      cleanup.push(unsubscribePresence)
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
}

