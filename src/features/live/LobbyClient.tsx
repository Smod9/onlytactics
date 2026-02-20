import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { roomService, type RoomInfo, type CreateRoomRequest } from '@/net/roomService'
import { identity } from '@/net/identity'
import { removeKey } from '@/utils/storage'
import { appEnv } from '@/config/env'
import { useAuth } from '@/state/authStore'
import { TrophyIcon, ReplayIcon } from '@/view/icons'

const apiBase = appEnv.apiUrl.replace(/\/$/, '')

type LeaderboardEntry = {
  userId: string
  displayName: string
  totalRaces: number
  wins: number
  avgPoints: number
  bestPosition: number | null
  totalTillerTimeSeconds: number | null
}

const formatDuration = (seconds: number) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

const LOBBY_RESET_KEYS = ['sgame:boatId', 'sgame:rolePreference']

export const LobbyClient = () => {
  const [rooms, setRooms] = useState<RoomInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [roomEmoji, setRoomEmoji] = useState('⛵')
  const [roomName, setRoomName] = useState('')
  const [roomDescription, setRoomDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [copiedRoomId, setCopiedRoomId] = useState<string | null>(null)
  const [roomNotice, setRoomNotice] = useState<string | null>(null)
  const [showControls, setShowControls] = useState(false)
  const [lbEntries, setLbEntries] = useState<LeaderboardEntry[]>([])
  const [lbLoading, setLbLoading] = useState(true)
  const { user } = useAuth()
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

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${apiBase}/api/stats/leaderboard?minRaces=1&limit=10`)
        if (!res.ok) return
        setLbEntries(await res.json())
      } catch {
        /* leaderboard is non-critical */
      } finally {
        setLbLoading(false)
      }
    }
    load()
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
      // Navigate to the new room
      window.location.href = `/app?roomId=${encodeURIComponent(response.roomId)}`
    } catch (err) {
      console.error('[LobbyClient] error creating room', err)
      setError(err instanceof Error ? err.message : 'Failed to create room')
      setCreating(false)
    }
  }

  const handleJoinRoom = (roomId: string) => {
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
    <div className="lobby-layout">
      <div className="lobby-main">
        <div style={{ marginBottom: '1.25rem' }}>
          <h1 style={{ fontSize: '2.2rem', marginBottom: '0.35rem' }}>Race Lobby</h1>
          <p style={{ opacity: 0.75, margin: 0 }}>Pick a race or start a new one.</p>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            marginBottom: '1rem',
          }}
        >
            <button
              type="button"
              className="start-sequence"
              onClick={() => setShowCreateModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Create Race
            </button>
            <button
              type="button"
              className="start-sequence"
              onClick={() => void refreshRooms()}
              disabled={loading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              Refresh
            </button>
          </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            marginBottom: '1.25rem',
            padding: '0.6rem 1rem',
            borderRadius: 8,
            border: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(255, 255, 255, 0.03)',
          }}
        >
          <span style={{ fontSize: '0.85rem', opacity: 0.65 }}>
            Having fun? Consider{' '}
            <a
              href="https://buymeacoffee.com/onlytactics"
              target="_blank"
              rel="noreferrer"
              style={{ color: '#ffdd00', textDecoration: 'none' }}
            >
              supporting the infrastructure costs
            </a>{' '}
            🙏
          </span>
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
                  <h3 style={{ margin: 0, fontSize: '1.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{room.roomName}</h3>
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
      <aside className="lobby-sidebar">
        <div className="lobby-quick-nav">
          <a href="/leaderboard" className="lobby-quick-nav-link" onClick={(e) => { e.preventDefault(); window.location.href = '/leaderboard' }}>
            <TrophyIcon /> Leaderboard
          </a>
          <a href="/replay" className="lobby-quick-nav-link" onClick={(e) => { e.preventDefault(); window.location.href = '/replay' }}>
            <ReplayIcon /> Replays
          </a>
        </div>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '0.75rem' }}>Top Sailors</h2>
        {lbLoading ? (
          <p style={{ opacity: 0.6, fontSize: '0.9rem' }}>Loading&hellip;</p>
        ) : lbEntries.length === 0 ? (
          <p style={{ opacity: 0.6, fontSize: '0.9rem' }}>No ranked sailors yet.</p>
        ) : (
          <table className="stats-table" style={{ fontSize: '0.82rem' }}>
            <thead>
              <tr>
                <th>#</th>
                <th>Sailor</th>
                <th>Avg Pts</th>
                <th>Races</th>
                <th>Wins</th>
                <th>Tiller</th>
              </tr>
            </thead>
            <tbody>
              {lbEntries.map((entry, i) => {
                const isMe = user?.id === entry.userId
                return (
                  <tr key={entry.userId} className={isMe ? 'stats-row-me' : ''}>
                    <td>{i + 1}</td>
                    <td>
                      <a
                        href={`/profile/${entry.userId}`}
                        onClick={(e) => {
                          e.preventDefault()
                          window.location.href = `/profile/${entry.userId}`
                        }}
                      >
                        {entry.displayName}
                      </a>
                      {isMe && <span className="stats-you-badge">you</span>}
                    </td>
                    <td>{entry.avgPoints}</td>
                    <td>{entry.totalRaces}</td>
                    <td>{entry.wins}</td>
                    <td>
                      {entry.totalTillerTimeSeconds
                        ? formatDuration(entry.totalTillerTimeSeconds)
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <div style={{ marginTop: '0.75rem' }}>
          <a
            href="/leaderboard"
            onClick={(e) => {
              e.preventDefault()
              window.location.href = '/leaderboard'
            }}
            style={{ fontSize: '0.85rem', opacity: 0.7 }}
          >
            View full leaderboard →
          </a>
        </div>

        <div style={{ marginTop: '2rem' }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '0.75rem' }}>Controls</h2>
          <img
            src={helpImageUrl}
            alt="Keyboard layout — click to enlarge"
            onClick={() => setShowControls(true)}
            style={{
              width: '100%',
              height: 'auto',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.15)',
              cursor: 'pointer',
            }}
          />
          <p style={{ fontSize: '0.75rem', opacity: 0.45, marginTop: '0.4rem' }}>
            Click image to enlarge
          </p>
        </div>
      </aside>

      {showControls && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '2rem',
            cursor: 'pointer',
          }}
          onClick={() => setShowControls(false)}
        >
          <img
            src={helpImageUrl}
            alt="Keyboard layout"
            style={{
              maxWidth: '100%',
              maxHeight: '90vh',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.2)',
            }}
          />
        </div>
      )}
    </div>
  )
}
