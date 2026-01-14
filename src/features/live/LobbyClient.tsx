import { useEffect, useState, type FormEvent } from 'react'
import { roomService, type RoomInfo, type CreateRoomRequest } from '@/net/roomService'
import { identity } from '@/net/identity'

export const LobbyClient = () => {
  const [rooms, setRooms] = useState<RoomInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [roomDescription, setRoomDescription] = useState('')
  const [creating, setCreating] = useState(false)

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
    void refreshRooms()
    // Refresh every 5 seconds
    const interval = setInterval(() => {
      void refreshRooms()
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleCreateRoom = async (event: FormEvent) => {
    event.preventDefault()
    const trimmedName = roomName.trim()
    if (!trimmedName) {
      setError('Room name is required')
      return
    }
    setCreating(true)
    setError(null)
    try {
      const request: CreateRoomRequest = {
        roomName: trimmedName,
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
    <div className="lobby-client" style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Race Lobby</h1>
        <p style={{ opacity: 0.8, marginBottom: '1rem' }}>
          Join an existing race or create a new one.
        </p>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button
            type="button"
            className="start-sequence"
            onClick={() => setShowCreateModal(true)}
          >
            Create Room
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
            <h2>Create New Room</h2>
            <form className="username-form" onSubmit={handleCreateRoom}>
              <input
                value={roomName}
                onChange={(event) => setRoomName(event.target.value)}
                placeholder="Room Name"
                maxLength={50}
                autoFocus
                disabled={creating}
              />
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
                    setRoomName('')
                    setRoomDescription('')
                    setError(null)
                  }}
                  disabled={creating}
                >
                  Cancel
                </button>
                <button type="submit" disabled={!roomName.trim() || creating}>
                  {creating ? 'Creating...' : 'Create Room'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem' }}>Loading rooms...</div>
      ) : rooms.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.7 }}>
          No rooms available. Create a new room to get started!
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gap: '1rem',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          }}
        >
          {rooms.map((room) => (
            <div
              key={room.roomId}
              style={{
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                padding: '1.5rem',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <div>
                <h3 style={{ margin: 0, marginBottom: '0.25rem', fontSize: '1.25rem' }}>
                  {room.roomName}
                </h3>
                {room.description && (
                  <p style={{ margin: 0, opacity: 0.8, fontSize: '0.9rem' }}>
                    {room.description}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span>Players:</span>
                  <span>
                    {room.playerCount} / {room.maxClients}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span>Status:</span>
                  <span>{getStatusLabel(room.status)}</span>
                </div>
                {room.hostName && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <span>Host:</span>
                    <span>{room.hostName}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span>Created:</span>
                  <span>{formatDate(room.createdAt)}</span>
                </div>
              </div>
              <button
                type="button"
                className="start-sequence"
                onClick={() => handleJoinRoom(room.roomId)}
                disabled={room.playerCount >= room.maxClients}
                style={{ width: '100%', marginTop: '0.5rem' }}
              >
                {room.playerCount >= room.maxClients ? 'Room Full' : 'Join Room'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

