import { appEnv } from '@/config/env'
import { readJson } from '@/utils/storage'

const RACE_KEY = 'sgame:raceId'

const getRaceId = () => readJson<string>(RACE_KEY, appEnv.raceId)

export const raceTopic = (raceId: string) => `sgame/${raceId}`

const base = raceTopic(getRaceId())

export const hostTopic = `${base}/host`
export const stateTopic = `${base}/state`
export const eventsTopic = `${base}/events`
export const chatTopic = `${base}/chat`

export const presenceTopic = (clientId: string) => `${base}/presence/${clientId}`
export const inputsTopic = (boatId: string) => `${base}/inputs/${boatId}`
export const inputsWildcard = `${base}/inputs/+`
export const presenceWildcard = `${base}/presence/+`
