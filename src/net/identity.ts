import { createId } from '@/utils/ids'
import { readJson, writeJson } from '@/utils/storage'

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

const clientId = ensureSessionId(
  CLIENT_ID_KEY,
  () => createId('client'),
  readJson,
  writeJson,
)
const boatId = ensureSessionId(BOAT_ID_KEY, () => createId('boat'))
const clientName = readJson<string | null>(CLIENT_NAME_KEY, null)

export const identity = {
  clientId,
  boatId,
  clientName,
}

export const setBoatId = (nextBoatId: string) => {
  identity.boatId = nextBoatId
  writeJson(BOAT_ID_KEY, nextBoatId)
}

export const setClientName = (name: string) => {
  identity.clientName = name
  writeJson(CLIENT_NAME_KEY, name)
}
