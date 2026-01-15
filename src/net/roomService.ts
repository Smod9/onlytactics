import { appEnv } from '@/config/env'

export type RoomStatus = 'waiting' | 'in-progress' | 'finished'

export type RoomInfo = {
  roomId: string
  roomName: string
  description: string
  playerCount: number
  maxClients: number
  status: RoomStatus
  hostName?: string
  createdAt: number
  timeToStartSeconds?: number | null
  phase?: 'prestart' | 'running' | 'finished'
}

export type CreateRoomRequest = {
  roomName: string
  description?: string
  createdBy?: string
}

export type CreateRoomResponse = {
  roomId: string
}

export class RoomNotFoundError extends Error {
  code = 'ROOM_NOT_FOUND'
  constructor(roomId: string) {
    super(`Room not found: ${roomId}`)
    this.name = 'RoomNotFoundError'
  }
}

const getApiBaseUrl = () => {
  const endpoint = appEnv.colyseusEndpoint
  // Convert ws:// or wss:// to http:// or https://
  if (endpoint.startsWith('ws://')) {
    return endpoint.replace('ws://', 'http://')
  }
  if (endpoint.startsWith('wss://')) {
    return endpoint.replace('wss://', 'https://')
  }
  return endpoint
}

export const roomService = {
  /**
   * List all available rooms
   */
  async listRooms(): Promise<RoomInfo[]> {
    const baseUrl = getApiBaseUrl()
    const response = await fetch(`${baseUrl}/api/rooms`)
    if (!response.ok) {
      throw new Error(`Failed to list rooms: ${response.statusText}`)
    }
    const data = await response.json()
    return data.rooms ?? []
  },

  /**
   * Create a new room
   */
  async createRoom(request: CreateRoomRequest): Promise<CreateRoomResponse> {
    const baseUrl = getApiBaseUrl()
    const response = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(`Failed to create room: ${error.error ?? response.statusText}`)
    }
    return response.json()
  },

  /**
   * Get room details by ID
   */
  async getRoomDetails(roomId: string): Promise<RoomInfo> {
    const baseUrl = getApiBaseUrl()
    const response = await fetch(`${baseUrl}/api/rooms/${encodeURIComponent(roomId)}`)
    if (!response.ok) {
      if (response.status === 404) {
        throw new RoomNotFoundError(roomId)
      }
      throw new Error(`Failed to get room details: ${response.statusText}`)
    }
    return response.json()
  },
}

