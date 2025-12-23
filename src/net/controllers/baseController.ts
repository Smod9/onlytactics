import { GameMqttClient, mqttClient } from '@/net/mqttClient'
import type { Controller } from './types'

export abstract class BaseController implements Controller {
  protected disposers: Array<() => void> = []

  private connectPromise?: Promise<void>

  constructor(protected mqtt: GameMqttClient = mqttClient) {}

  async start() {
    if (!this.connectPromise) {
      this.connectPromise = this.mqtt.connect().catch((error) => {
        console.error('[mqtt] connect failed', error)
      })
    }
    await this.onStart()
  }

  stop() {
    this.disposers.forEach((dispose) => dispose())
    this.disposers = []
    this.onStop()
    this.connectPromise = undefined
  }

  protected abstract onStart(): Promise<void> | void

  protected onStop() {}

  protected track(disposer: () => void) {
    this.disposers.push(disposer)
  }
}
