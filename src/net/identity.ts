import { createId } from '@/utils/ids'
import { readJson, writeJson } from '@/utils/storage'
import { authStore } from '@/state/authStore'

const CLIENT_ID_KEY = 'sgame:clientId'
const BOAT_ID_KEY = 'sgame:boatId'
const CLIENT_NAME_KEY = 'sgame:clientName'

const ensureSessionId = (
  key: string,
  generator: () => string,
  read: typeof readJson = readJson,
  write: typeof writeJson = writeJson,
) => {
  const existing = read<string | null>(key, null)
  if (existing) return existing
  const fresh = generator()
  write(key, fresh)
  return fresh
}

// Fallback identity from localStorage (for anonymous users)
const fallbackClientId = ensureSessionId(
  CLIENT_ID_KEY,
  () => createId('client'),
  readJson,
  writeJson,
)
const fallbackBoatId = ensureSessionId(BOAT_ID_KEY, () => createId('boat'))
const fallbackClientName = readJson<string | null>(CLIENT_NAME_KEY, null)

// Dynamic identity that prefers authenticated user data
export const identity = {
  get clientId(): string {
    const authState = authStore.getState()
    // Use authenticated user ID if available, otherwise fallback
    return authState.user?.id ?? fallbackClientId
  },
  boatId: fallbackBoatId,
  get clientName(): string | null {
    const authState = authStore.getState()
    // Use authenticated user's display name if available
    return authState.user?.displayName ?? fallbackClientName
  },
}

export const setBoatId = (nextBoatId: string) => {
  identity.boatId = nextBoatId
  writeJson(BOAT_ID_KEY, nextBoatId)
}

export const setClientName = (name: string) => {
  // For authenticated users, the name comes from the auth system
  // For anonymous users, store in localStorage
  const authState = authStore.getState()
  if (!authState.user) {
    writeJson(CLIENT_NAME_KEY, name)
  }
}

// Get the current identity state (snapshot for network calls)
export const getIdentitySnapshot = () => ({
  clientId: identity.clientId,
  boatId: identity.boatId,
  clientName: identity.clientName,
})

// Check if user is authenticated
export const isAuthenticated = (): boolean => {
  return authStore.isAuthenticated()
}
