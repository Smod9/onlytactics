import { appEnv } from '@/config/env'
import { mqttClient } from '@/net/mqttClient'
import { chatTopic } from '@/net/topics'
import type { ChatMessage } from '@/types/race'
import { raceStore } from '@/state/raceStore'
import { identity } from '@/net/identity'
import { createId } from '@/utils/ids'

class RateLimiter {
  private timestamps: number[] = []

  constructor(private limit: number, private windowMs: number) {}

  canSend() {
    const now = Date.now()
    this.timestamps = this.timestamps.filter((ts) => now - ts < this.windowMs)
    if (this.timestamps.length >= this.limit) {
      return false
    }
    this.timestamps.push(now)
    return true
  }
}

export class ChatService {
  private limiter = new RateLimiter(5, 10_000)

  private started = false

  private unsubscribe?: () => void

  async start() {
    if (this.started) return
    await mqttClient.connect()
    this.unsubscribe = mqttClient.subscribe<ChatMessage>(chatTopic, (message) => {
      raceStore.appendChat(message)
    })
    this.started = true
  }

  stop() {
    this.unsubscribe?.()
    this.unsubscribe = undefined
    this.started = false
  }

  async send(text: string, senderRole: ChatMessage['senderRole']) {
    const trimmed = text.trim()
    if (!trimmed.length) {
      return { ok: false as const, error: 'empty' }
    }
    if (!this.limiter.canSend()) {
      return { ok: false as const, error: 'rate_limit' }
    }
    await mqttClient.connect()
    const message: ChatMessage = {
      messageId: createId('chat'),
      raceId: raceStore.getState().meta.raceId,
      senderId: identity.clientId,
      senderName: identity.clientName ?? appEnv.clientName,
      senderRole,
      text: trimmed,
      ts: Date.now(),
    }
    mqttClient.publish(chatTopic, message)
    raceStore.appendChat(message)
    return { ok: true as const }
  }
}

export const chatService = new ChatService()

