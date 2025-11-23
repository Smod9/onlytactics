import mqtt, { type IClientOptions, type MqttClient } from 'mqtt'
import { presenceTopic } from './topics'
import { identity } from './identity'
const MQTT_URL = 'wss://cf22679c9b2c46ef967a2b4b1bf0f46f.s1.eu.hivemq.cloud:8884/mqtt'
const MQTT_USERNAME = 'onlytacticsfrontend'
const MQTT_PASSWORD = 'Sailing123'

type Handler<T> = (payload: T) => void

const toBuffer = (value: unknown) => JSON.stringify(value)

const fromBuffer = <T>(raw: Uint8Array | string) => {
  try {
    const text =
      typeof raw === 'string' ? raw : new TextDecoder().decode(raw as Uint8Array)
    return JSON.parse(text) as T
  } catch (error) {
    console.error('Failed to parse MQTT payload', error)
    return undefined
  }
}

const topicMatches = (filter: string, topic: string) => {
  if (filter === topic) return true
  const filterLevels = filter.split('/')
  const topicLevels = topic.split('/')

  for (let i = 0; i < filterLevels.length; i += 1) {
    const filterLevel = filterLevels[i]
    const topicLevel = topicLevels[i]

    if (filterLevel === '#') {
      return true
    }
    if (filterLevel === '+') {
      if (topicLevel === undefined) return false
      continue
    }
    if (topicLevel === undefined || filterLevel !== topicLevel) {
      return false
    }
  }

  return filterLevels.length === topicLevels.length
}

export class GameMqttClient {
  private client?: MqttClient

  private handlers = new Map<string, Set<(payload: unknown) => void>>()

  private connectionPromise?: Promise<void>

  connect() {
    if (this.client) return this.connectionPromise ?? Promise.resolve()

    const { endpoint, options } = this.buildConnectionOptions()
    console.info('[mqtt] connecting', {
      endpoint,
      clientId: options.clientId,
      protocol: options.protocol ?? 'auto',
      hasUsername: Boolean(options.username),
    })

    this.client = mqtt.connect(endpoint, options)
    this.connectionPromise = new Promise((resolve, reject) => {
      this.client?.once('connect', () => {
        console.log('connected to mqtt broker')
        this.publish(
          presenceTopic(identity.clientId),
          {
            clientId: identity.clientId,
            status: 'online' as const,
          },
          { retain: true },
        )
        resolve()
      })
      this.client?.once('error', (err) => reject(err))
    })

    this.client.on('message', (topic, payload) => {
      const parsed = fromBuffer(payload)
      if (parsed === undefined) return

      let matched = false
      this.handlers.forEach((handlers, filter) => {
        if (!handlers.size) return
        if (!topicMatches(filter, topic)) return
        matched = true
        handlers.forEach((handler) => handler(parsed))
      })

      if (!matched) {
        console.debug('[mqtt] message dropped (no handler)', topic)
      }
    })

    return this.connectionPromise
  }

  private buildConnectionOptions(): { endpoint: string; options: IClientOptions } {
    const endpoint = MQTT_URL
    const options: IClientOptions = {
      clientId: identity.clientId,
      reconnectPeriod: 2000,
      keepalive: 30,
      clean: true,
      connectTimeout: 6000,
      protocolVersion: 4,
      protocol: 'wss',
      username: MQTT_USERNAME,
      password: MQTT_PASSWORD,
      will: {
        topic: presenceTopic(identity.clientId),
        payload: toBuffer({
          clientId: identity.clientId,
          status: 'offline' as const,
        }),
        retain: true,
        qos: 1,
      },
    }

    return { endpoint, options }
  }

  publish(
    topic: string,
    payload: unknown,
    options?: { retain?: boolean; qos?: 0 | 1 | 2 },
  ) {
    if (!this.client) return
    this.client.publish(topic, toBuffer(payload), {
      qos: options?.qos ?? 1,
      retain: options?.retain ?? false,
    })
  }

  subscribe<T>(topic: string, handler: Handler<T>) {
    if (!this.client) throw new Error('MQTT client not connected')
    if (!this.handlers.has(topic)) {
      this.handlers.set(topic, new Set())
      this.client.subscribe(topic, { qos: 1 })
    }
    const set = this.handlers.get(topic)!
    const wrapped = (payload: unknown) => handler(payload as T)
    set.add(wrapped)
    return () => {
      const bucket = this.handlers.get(topic)
      if (!bucket) return
      bucket.delete(wrapped)
      if (bucket.size === 0) {
        this.client?.unsubscribe(topic)
        this.handlers.delete(topic)
      }
    }
  }

  disconnect() {
    this.publish(presenceTopic(identity.clientId), {
      clientId: identity.clientId,
      status: 'offline' as const,
    }, { retain: true })
    this.client?.end(true)
    this.handlers.clear()
    this.client = undefined
    this.connectionPromise = undefined
  }
}

export const mqttClient = new GameMqttClient()

