import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { chatService } from '@/chat/chatService'
import { useChatLog } from '@/state/hooks'
import type { GameNetwork } from '@/net/gameNetwork'
import type { ChatSenderRole, RaceRole } from '@/types/race'
import { identity } from '@/net/identity'

type Props = {
  network?: GameNetwork
}

const isInteractiveElement = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    target.isContentEditable ||
    target.getAttribute('role') === 'textbox'
  )
}

const roleToSender = (role: RaceRole): ChatSenderRole => {
  if (role === 'host') return 'host'
  if (role === 'player') return 'player'
  return 'spectator'
}

export const ChatPanel = ({ network }: Props) => {
  const chat = useChatLog()
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const role = useSyncExternalStore<RaceRole>(
    (listener) => {
      if (!network) return () => {}
      return network.onRoleChange(listener)
    },
    () => network?.getRole() ?? 'spectator',
    () => 'spectator',
  )

  useEffect(() => {
    void chatService.start(network)
  }, [network])

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [chat])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      // Don't steal typing when the user is in another input (e.g. name entry).
      // We still allow the hotkey when focus is not on an interactive element.
      if (isInteractiveElement(event.target) && document.activeElement !== inputRef.current) {
        return
      }
      if (event.key === 'm' || event.key === 'M' || event.key === 'c' || event.key === 'C') {
        const isFocused = document.activeElement === inputRef.current
        if (!isFocused) {
          inputRef.current?.focus()
          event.preventDefault()
        }
        return
      }
      if (event.key === 'Escape') {
        const node = inputRef.current
        if (node && document.activeElement === node) {
          node.blur()
          event.preventDefault()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const sendMessage = async () => {
    const result = await chatService.send(draft, roleToSender(role), network)
    if (result.ok) {
      setDraft('')
      setStatus(null)
    } else if (result.error === 'rate_limit') {
      setStatus('Too many messages. Slow down.')
    } else if (result.error === 'empty') {
      setStatus('Message is empty.')
    } else if (result.error === 'network') {
      setStatus('Chat is unavailable right now.')
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <h3>Chat</h3>
        <span>{roleToSender(role)}</span>
      </div>
      <div className="chat-log" ref={scrollRef}>
        {chat.slice(-8).map((message) => (
          <div
            key={message.messageId}
            className={`chat-message chat-${message.senderRole} ${
              message.senderId === identity.clientId ? 'chat-mine' : 'chat-other'
            }`}
          >
            <span className="chat-author">{message.senderName}:</span>
            <span className="chat-text">{message.text}</span>
          </div>
        ))}
        {!chat.length && <p className="chat-empty">No messages yet.</p>}
      </div>
      <div className="chat-input">
        <input
          type="text"
          ref={inputRef}
          value={draft}
          placeholder="Message..."
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void sendMessage()
            }
          }}
        />
        <button type="button" onClick={() => void sendMessage()}>
          Send
        </button>
      </div>
      <p className="chat-status" style={{ visibility: status ? 'visible' : 'hidden' }}>
        {status || '\u00A0'}
      </p>
    </div>
  )
}

