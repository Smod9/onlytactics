import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { roomService, type RoomInfo, type CreateRoomRequest } from '@/net/roomService'
import { identity } from '@/net/identity'
import { removeKey } from '@/utils/storage'
import { KeyboardIcon } from '@/view/icons'

const LOBBY_RESET_KEYS = ['sgame:boatId', 'sgame:rolePreference']
const PENDING_ROOM_ID_KEY = 'sgame:pendingRoomId'

export const LobbyClient = () => {
  const [rooms, setRooms] = useState<RoomInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [roomEmoji, setRoomEmoji] = useState('⛵')
  const [roomName, setRoomName] = useState('')
  const [roomDescription, setRoomDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [showControls, setShowControls] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [copiedRoomId, setCopiedRoomId] = useState<string | null>(null)
  const [roomNotice, setRoomNotice] = useState<string | null>(null)
  const emojiOptions = [
    '⛵',
    '🌊',
    '🏁',
    '🧭',
    '⚓',
    '🌬️',
    '🏝️',
    '🐬',
    '🐳',
    '🦭',
    '☀️',
    '🌅',
    '🌈',
    '⛱️',
    '🪸',
    '🪼',
    '🧢',
    '⛺',
    '🚤',
    '🎯',
    '🧩',
    '🎲',
  ]
  const helpImageFile = 'Keyboard Layout.svg'
  const helpImageUrl = `${import.meta.env.BASE_URL}${encodeURIComponent(helpImageFile)}`
  const filteredRooms = useMemo(() => {
    if (!searchTerm.trim()) return rooms
    const lower = searchTerm.toLowerCase()
    return rooms.filter((room) => room.roomName.toLowerCase().includes(lower))
  }, [rooms, searchTerm])

  const refreshRooms = async () => {
    try {
      setError(null)
      const roomList = await roomService.listRooms()
      setRooms(roomList)
    } catch (err) {
      console.error('[LobbyClient] error loading rooms', err)
      setError(err instanceof Error ? err.message : 'Failed to load rooms')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    LOBBY_RESET_KEYS.forEach((key) => removeKey(key))
  }, [])

  useEffect(() => {
    void refreshRooms()
    // Refresh every 5 seconds
    const interval = setInterval(() => {
      void refreshRooms()
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const invalidRoomId = params.get('invalidRoomId')
    const closedReason = params.get('closed')
    const closedRoomId = params.get('roomId')
    let notice: string | null = null
    if (invalidRoomId) {
      notice = `Race ${invalidRoomId} is no longer available.`
    } else if (closedReason) {
      const label = closedRoomId ? `Room ${closedRoomId}` : 'Room'
      notice =
        closedReason === 'timeout'
          ? `${label} timed out and was closed.`
          : `${label} closed.`
    }
    if (notice) {
      setRoomNotice(notice)
      window.history.replaceState({}, '', '/lobby')
    }
  }, [])

  const handleCreateRoom = async (event: FormEvent) => {
    event.preventDefault()
    const trimmedName = roomName.trim()
    if (!trimmedName) {
      setError('Name is required')
      return
    }
    setCreating(true)
    setError(null)
    try {
      const displayName = `${roomEmoji} ${trimmedName}`.trim()
      const request: CreateRoomRequest = {
        roomName: displayName,
        description: roomDescription.trim() || undefined,
        createdBy: identity.clientId,
      }
      const response = await roomService.createRoom(request)
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(PENDING_ROOM_ID_KEY, response.roomId)
      }
      // Navigate to the new room
      window.location.href = `/app?roomId=${encodeURIComponent(response.roomId)}`
    } catch (err) {
      console.error('[LobbyClient] error creating room', err)
      setError(err instanceof Error ? err.message : 'Failed to create room')
      setCreating(false)
    }
  }

  const handleJoinRoom = (roomId: string) => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(PENDING_ROOM_ID_KEY, roomId)
    }
    window.location.href = `/app?roomId=${encodeURIComponent(roomId)}`
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString()
  }

  const getStatusLabel = (status: RoomInfo['status']) => {
    switch (status) {
      case 'waiting':
        return 'Waiting'
      case 'in-progress':
        return 'In Progress'
      case 'finished':
        return 'Finished'
      default:
        return status
    }
  }

  return (
    <div
      className="lobby-client"
      style={{
        padding: '2.5rem 2rem 3rem',
        maxWidth: '980px',
        margin: '0 auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1.5rem',
          marginBottom: '1.25rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 240 }}>
          <h1 style={{ fontSize: '2.2rem', marginBottom: '0.35rem' }}>Race Lobby</h1>
          <p style={{ opacity: 0.75, margin: 0 }}>Pick a race or start a new one.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            type="button"
            className="start-sequence"
            onClick={() => setShowCreateModal(true)}
          >
            Create Race
          </button>
          <button
            type="button"
            className="start-sequence"
            onClick={() => void refreshRooms()}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <input
          type="search"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search races"
          style={{
            width: '100%',
            maxWidth: 360,
            padding: '0.45rem 0.75rem',
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(255,255,255,0.04)',
            color: 'inherit',
          }}
        />
      </div>
      <div style={{ marginBottom: '1.5rem' }}>
        <button
          type="button"
          onClick={() => setShowControls(true)}
          className="tactician-toggle"
          title="Learn about the controls"
        >
          <span className="tactician-toggle-icon" aria-hidden="true">
            <KeyboardIcon />
          </span>
          <span className="tactician-toggle-text">
            Click here to learn about the controls
          </span>
        </button>
      </div>

      {roomNotice && (
        <div
          style={{
            padding: '1rem',
            backgroundColor: 'rgba(255, 196, 0, 0.12)',
            border: '1px solid rgba(255, 196, 0, 0.35)',
            borderRadius: '4px',
            marginBottom: '1rem',
            color: '#f5d66b',
          }}
        >
          {roomNotice}
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '1rem',
            backgroundColor: 'rgba(255, 0, 0, 0.1)',
            border: '1px solid rgba(255, 0, 0, 0.3)',
            borderRadius: '4px',
            marginBottom: '1rem',
            color: '#ff6b6b',
          }}
        >
          {error}
        </div>
      )}

      {showCreateModal && (
        <div
          className="username-gate"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div className="username-card" style={{ maxWidth: '500px', width: '90%' }}>
            <h2>Create New Race</h2>
            <form className="username-form" onSubmit={handleCreateRoom}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <select
                  value={roomEmoji}
                  onChange={(event) => setRoomEmoji(event.target.value)}
                  aria-label="Select emoji"
                  disabled={creating}
                  style={{
                    padding: '0.5rem 0.6rem',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    color: 'inherit',
                    borderRadius: '4px',
                    fontFamily: 'inherit',
                    fontSize: '1.8rem',
                    lineHeight: 1,
                  }}
                >
                  {emojiOptions.map((emoji) => (
                    <option key={emoji} value={emoji}>
                      {emoji}
                    </option>
                  ))}
                </select>
                <input
                  value={roomName}
                  onChange={(event) => setRoomName(event.target.value)}
                  placeholder="Race Name"
                  maxLength={50}
                  autoFocus
                  disabled={creating}
                  style={{ flex: 1 }}
                />
              </div>
              <textarea
                value={roomDescription}
                onChange={(event) => setRoomDescription(event.target.value)}
                placeholder="Description (optional)"
                maxLength={200}
                rows={3}
                disabled={creating}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  color: 'inherit',
                  borderRadius: '4px',
                  fontFamily: 'inherit',
                }}
              />
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="username-form-cancel"
                  onClick={() => {
                    setShowCreateModal(false)
                    setRoomEmoji('⛵')
                    setRoomName('')
                    setRoomDescription('')
                    setError(null)
                  }}
                  disabled={creating}
                >
                  Cancel
                </button>
                <button type="submit" disabled={!roomName.trim() || creating}>
                  {creating ? 'Creating...' : 'Create Race'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showControls && (
        <div
          className="username-gate"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1.5rem',
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setShowControls(false)
            }
          }}
        >
          <div
            className="username-card"
            style={{
              maxWidth: '980px',
              width: '100%',
              maxHeight: '85vh',
              overflow: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                marginBottom: '1rem',
              }}
            >
              <h2 style={{ margin: 0 }}>Controls</h2>
              <button
                type="button"
                className="user-menu-close"
                onClick={() => setShowControls(false)}
                aria-label="Close controls"
                title="Close"
              >
                ✕
              </button>
            </div>
            <img
              src={helpImageUrl}
              alt="Keyboard layout"
              style={{
                width: '100%',
                height: 'auto',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.15)',
              }}
            />
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '2.5rem', opacity: 0.8 }}>
          Loading races…
        </div>
      ) : rooms.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '2.5rem',
            opacity: 0.7,
            border: '1px dashed rgba(255,255,255,0.2)',
            borderRadius: 12,
          }}
        >
          No races yet. Start the first one.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gap: '1rem',
            gridTemplateColumns: '1fr',
          }}
        >
          {filteredRooms.map((room) => (
            <div
              key={room.roomId}
              style={{
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '12px',
                padding: '1.25rem 1.5rem',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                display: 'grid',
                gridTemplateColumns: '1.2fr 1fr auto',
                gap: '1rem',
                alignItems: 'center',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '0.25rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{room.roomName}</h3>
                  <span
                    style={{
                      fontSize: 12,
                      padding: '0.2rem 0.5rem',
                      borderRadius: 999,
                      border: '1px solid rgba(255,255,255,0.2)',
                      opacity: 0.8,
                    }}
                  >
                    {getStatusLabel(room.status)}
                  </span>
                </div>
                {room.description && (
                  <p style={{ margin: 0, opacity: 0.8, fontSize: '0.9rem' }}>
                    {room.description}
                  </p>
                )}
              </div>
              <div
                style={{
                  display: 'grid',
                  gap: '0.35rem',
                  fontSize: '0.88rem',
                  opacity: 0.85,
                }}
              >
                <div>
                  Players: {room.playerCount} / {room.maxClients}
                </div>
                {typeof room.timeToStartSeconds === 'number' && (
                  <div>
                    Time to start:{' '}
                    {`${Math.floor(room.timeToStartSeconds / 60)
                      .toString()
                      .padStart(1, '0')}:${Math.floor(room.timeToStartSeconds % 60)
                      .toString()
                      .padStart(2, '0')}`}
                  </div>
                )}
                {room.phase && (
                  <div>
                    Phase:{' '}
                    {room.phase === 'prestart'
                      ? 'Pre-start countdown'
                      : room.phase === 'running'
                        ? 'Running'
                        : 'Finished'}
                  </div>
                )}
                {room.hostName && <div>Host: {room.hostName}</div>}
                <div>Created: {formatDate(room.createdAt)}</div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="start-sequence"
                  onClick={() => handleJoinRoom(room.roomId)}
                  disabled={room.playerCount >= room.maxClients}
                  style={{ minWidth: 140 }}
                >
                  {room.playerCount >= room.maxClients ? 'Full' : 'Join Race'}
                </button>
                <button
                  type="button"
                  title="Copy share link"
                  onClick={() => {
                    const link = `${window.location.origin}/app?roomId=${encodeURIComponent(
                      room.roomId,
                    )}`
                    navigator.clipboard?.writeText(link).then(() => {
                      setCopiedRoomId(room.roomId)
                      setTimeout(() => setCopiedRoomId(null), 2000)
                    })
                  }}
                  style={{
                    borderRadius: 999,
                    border: '1px solid rgba(255,255,255,0.25)',
                    padding: '0.3rem 0.5rem',
                    background: 'transparent',
                    color: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
                    <polyline points="16 6 12 2 8 6" />
                    <line x1="12" y1="2" x2="12" y2="15" />
                  </svg>
                </button>
                {copiedRoomId === room.roomId && (
                  <span style={{ fontSize: 12, opacity: 0.8, alignSelf: 'center' }}>
                    Link copied
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
