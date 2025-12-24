import type { ChatMessage } from '@/types/race'
import { raceStore } from '@/state/raceStore'
import type { GameNetwork } from '@/net/gameNetwork'

class RateLimiter {
  private timestamps: number[] = []

  constructor(
    private limit: number,
    private windowMs: number,
  ) {}

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

  async start(network?: GameNetwork) {
    if (this.started) return
    if (!network) return
    this.unsubscribe = network.onChatMessage((message) => {
      raceStore.appendChat(message)
    })
    this.started = true
  }

  stop() {
    this.unsubscribe?.()
    this.unsubscribe = undefined
    this.started = false
  }

  async send(
    text: string,
    _senderRole: ChatMessage['senderRole'],
    network?: GameNetwork,
  ) {
    const trimmed = text.trim()
    if (!trimmed.length) {
      return { ok: false as const, error: 'empty' }
    }
    if (!this.limiter.canSend()) {
      return { ok: false as const, error: 'rate_limit' }
    }
    if (!network) {
      return { ok: false as const, error: 'network' }
    }
    const sent = network.sendChat(trimmed)
    if (!sent) {
      return { ok: false as const, error: 'network' }
    }
    return { ok: true as const }
  }
}

export const chatService = new ChatService()
