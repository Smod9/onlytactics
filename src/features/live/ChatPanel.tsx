import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { chatService } from '@/chat/chatService'
import { useChatLog } from '@/state/hooks'
import type { GameNetwork } from '@/net/gameNetwork'
import type { ChatSenderRole, RaceRole } from '@/types/race'

type Props = {
  network?: GameNetwork
}

const roleToSender = (role: RaceRole): ChatSenderRole => {
  if (role === 'host') return 'host'
  if (role === 'player') return 'player'
  return 'spectator'
}

export const ChatPanel = ({ network }: Props) => {
  const chat = useChatLog()
  const scrollRef = useRef<HTMLDivElement>(null)
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
    void chatService.start()
  }, [])

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [chat])

  const sendMessage = async () => {
    const result = await chatService.send(draft, roleToSender(role))
    if (result.ok) {
      setDraft('')
      setStatus(null)
    } else if (result.error === 'rate_limit') {
      setStatus('Too many messages. Slow down.')
    } else if (result.error === 'empty') {
      setStatus('Message is empty.')
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <h3>Chat</h3>
        <span>{roleToSender(role)}</span>
      </div>
      <div className="chat-log" ref={scrollRef}>
        {chat.map((message) => (
          <div
            key={message.messageId}
            className={`chat-message chat-${message.senderRole}`}
          >
            <span className="chat-author">{message.senderName}</span>
            <span className="chat-text">{message.text}</span>
          </div>
        ))}
        {!chat.length && <p className="chat-empty">No messages yet.</p>}
      </div>
      <div className="chat-input">
        <input
          type="text"
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
      {status && <p className="chat-status">{status}</p>}
    </div>
  )
}

