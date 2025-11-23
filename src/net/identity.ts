import { createId } from '@/utils/ids'
import { readJson, writeJson, readSessionJson, writeSessionJson } from '@/utils/storage'
import { appEnv } from '@/config/env'

const CLIENT_ID_KEY = 'sgame:clientId'
const BOAT_ID_KEY = 'sgame:boatId'
const CLIENT_NAME_KEY = 'sgame:clientName'

const ensureSessionId = (key: string, fallbackGenerator: () => string) => {
  const existing = readSessionJson<string | null>(key, null)
  if (existing) return existing
  const fresh = fallbackGenerator()
  writeSessionJson(key, fresh)
  return fresh
}

const clientId = ensureSessionId(CLIENT_ID_KEY, () => createId('client'))
const boatId = ensureSessionId(BOAT_ID_KEY, () => createId('boat'))
const storedName = readJson<string | null>(CLIENT_NAME_KEY, null)
const clientName = storedName ?? appEnv.clientName ?? 'Sailor'
if (storedName === null) {
  writeJson(CLIENT_NAME_KEY, clientName)
}

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

