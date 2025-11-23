import { createId } from '@/utils/ids'
import { readJson, writeJson, readSessionJson, writeSessionJson } from '@/utils/storage'

const CLIENT_ID_KEY = 'sgame:clientId'
const BOAT_ID_KEY = 'sgame:boatId'
const CLIENT_NAME_KEY = 'sgame:clientName'

const ensureSessionId = (key: string, generator: () => string) => {
  const existing = readSessionJson<string | null>(key, null)
  if (existing) return existing
  const fresh = generator()
  writeSessionJson(key, fresh)
  return fresh
}

const clientId = ensureSessionId(CLIENT_ID_KEY, () => createId('client'))
const boatId = ensureSessionId(BOAT_ID_KEY, () => createId('boat'))
const clientName = readJson<string | null>(CLIENT_NAME_KEY, null)

export const identity = {
  clientId,
  boatId,
  clientName,
}

export const setBoatId = (nextBoatId: string) => {
  identity.boatId = nextBoatId
  writeSessionJson(BOAT_ID_KEY, nextBoatId)
}

export const setClientName = (name: string) => {
  identity.clientName = name
  writeJson(CLIENT_NAME_KEY, name)
}

