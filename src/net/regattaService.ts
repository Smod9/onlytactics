import { appEnv } from '@/config/env'

export type RegattaStatus = 'active' | 'completed' | 'cancelled'

export type Regatta = {
  id: string
  name: string
  description: string
  numRaces: number
  throwoutCount: number
  status: RegattaStatus
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export type RegattaRaceEntry = {
  raceId: string
  raceNumber: number
  createdAt: string
}

export type RegattaStandingEntry = {
  userId: string
  displayName: string
  racePoints: (number | null)[]
  droppedIndices: number[]
  totalPoints: number
  racesCompleted: number
}

export type RegattaDetail = Regatta & {
  races: RegattaRaceEntry[]
  standings: RegattaStandingEntry[]
  completedRaceCount: number
}

export type CreateRegattaRequest = {
  name: string
  description?: string
  numRaces?: number
  throwoutCount?: number
}

const getApiBaseUrl = () => {
  const endpoint = appEnv.colyseusEndpoint
  if (endpoint.startsWith('ws://')) return endpoint.replace('ws://', 'http://')
  if (endpoint.startsWith('wss://')) return endpoint.replace('wss://', 'https://')
  return endpoint
}

const authHeaders = (token: string | null): Record<string, string> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

export const regattaService = {
  async listRegattas(statusFilter?: RegattaStatus): Promise<Regatta[]> {
    const baseUrl = getApiBaseUrl()
    const url = statusFilter
      ? `${baseUrl}/api/regattas?status=${encodeURIComponent(statusFilter)}`
      : `${baseUrl}/api/regattas`
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Failed to list regattas: ${response.statusText}`)
    return response.json()
  },

  async createRegatta(request: CreateRegattaRequest, accessToken: string | null): Promise<Regatta> {
    const baseUrl = getApiBaseUrl()
    const response = await fetch(`${baseUrl}/api/regattas`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify(request),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(`Failed to create regatta: ${err.error ?? response.statusText}`)
    }
    return response.json()
  },

  async getRegatta(id: string): Promise<RegattaDetail> {
    const baseUrl = getApiBaseUrl()
    const response = await fetch(`${baseUrl}/api/regattas/${encodeURIComponent(id)}`)
    if (!response.ok) throw new Error(`Failed to get regatta: ${response.statusText}`)
    return response.json()
  },

  async updateRegatta(
    id: string,
    fields: Partial<Pick<Regatta, 'name' | 'description' | 'numRaces' | 'throwoutCount' | 'status'>>,
    accessToken: string | null,
  ): Promise<Regatta> {
    const baseUrl = getApiBaseUrl()
    const response = await fetch(`${baseUrl}/api/regattas/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: authHeaders(accessToken),
      body: JSON.stringify(fields),
    })
    if (!response.ok) throw new Error(`Failed to update regatta: ${response.statusText}`)
    return response.json()
  },

  async deleteRegatta(id: string, accessToken: string | null): Promise<void> {
    const baseUrl = getApiBaseUrl()
    const response = await fetch(`${baseUrl}/api/regattas/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(accessToken),
    })
    if (!response.ok) throw new Error(`Failed to delete regatta: ${response.statusText}`)
  },

  async addRace(
    regattaId: string,
    raceId: string,
    raceNumber: number | undefined,
    accessToken: string | null,
  ): Promise<void> {
    const baseUrl = getApiBaseUrl()
    const response = await fetch(
      `${baseUrl}/api/regattas/${encodeURIComponent(regattaId)}/races`,
      {
        method: 'POST',
        headers: authHeaders(accessToken),
        body: JSON.stringify({ raceId, raceNumber }),
      },
    )
    if (!response.ok) throw new Error(`Failed to add race to regatta: ${response.statusText}`)
  },
}
