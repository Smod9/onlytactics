import { openDB, type IDBPDatabase } from 'idb'
import type { ReplayRecording } from '@/types/race'
import { readJson, writeJson } from '@/utils/storage'

const DB_NAME = 'sgame-replays'
const STORE_NAME = 'recordings'
const INDEX_KEY = 'sgame:replayIndex'

export type ReplayIndexEntry = {
  raceId: string
  courseName: string
  savedAt: number
}

const getDb = async (): Promise<IDBPDatabase> =>
  openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    },
  })

const keyForRace = (raceId: string) => `replay:${raceId}`

export const saveRecording = async (recording: ReplayRecording) => {
  const db = await getDb()
  await db.put(STORE_NAME, recording, keyForRace(recording.meta.raceId))
  updateIndex(recording)
}

export const loadRecording = async (raceId: string) => {
  const db = await getDb()
  return (await db.get(STORE_NAME, keyForRace(raceId))) as ReplayRecording | undefined
}

export const deleteRecording = async (raceId: string) => {
  const db = await getDb()
  await db.delete(STORE_NAME, keyForRace(raceId))
  const filtered = listReplayIndex().filter((entry) => entry.raceId !== raceId)
  writeJson(INDEX_KEY, filtered)
}

export const listReplayIndex = () =>
  readJson<ReplayIndexEntry[]>(INDEX_KEY, []).sort(
    (a, b) => b.savedAt - a.savedAt,
  )

const updateIndex = (recording: ReplayRecording) => {
  const current = listReplayIndex().filter(
    (entry) => entry.raceId !== recording.meta.raceId,
  )
  current.unshift({
    raceId: recording.meta.raceId,
    courseName: recording.meta.courseName,
    savedAt: Date.now(),
  })
  writeJson(INDEX_KEY, current.slice(0, 25))
}

