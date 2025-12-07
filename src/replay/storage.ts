import { openDB, type IDBPDatabase } from 'idb'
import type { ReplayRecording } from '@/types/race'
import { readJson, writeJson } from '@/utils/storage'

const DB_NAME = 'sgame-replays'
const STORE_NAME = 'recordings'
const INDEX_KEY = 'sgame:replayIndex'
const API_BASE = '/api/replays'

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
  const local = (await db.get(STORE_NAME, keyForRace(raceId))) as ReplayRecording | undefined
  if (local) return local

  const remote = await fetchRemoteRecording(raceId)
  if (remote) {
    await saveRecording(remote)
    return remote
  }

  return undefined
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

const fetchRemoteRecording = async (raceId: string) => {
  try {
    const res = await fetch(`${API_BASE}/${encodeURIComponent(raceId)}`)
    if (!res.ok) return undefined
    const data = (await res.json()) as ReplayRecording
    return data
  } catch {
    return undefined
  }
}

export const fetchRemoteIndex = async (limit = 50): Promise<ReplayIndexEntry[]> => {
  try {
    const res = await fetch(`${API_BASE}?limit=${limit}`)
    if (!res.ok) return []
    const rows = (await res.json()) as Array<{
      raceId: string
      courseName?: string | null
      finishedAt: string
    }>
    return rows.map((row) => ({
      raceId: row.raceId,
      courseName: row.courseName ?? 'Race',
      savedAt: Number.isFinite(Date.parse(row.finishedAt))
        ? new Date(row.finishedAt).getTime()
        : Date.now(),
    }))
  } catch {
    return []
  }
}

export const refreshReplayIndex = async () => {
  const remote = await fetchRemoteIndex()
  if (!remote.length) return listReplayIndex()

  const mergedById = new Map<string, ReplayIndexEntry>()
  listReplayIndex().forEach((entry) => mergedById.set(entry.raceId, entry))
  remote.forEach((entry) => {
    const current = mergedById.get(entry.raceId)
    if (!current || entry.savedAt > current.savedAt) {
      mergedById.set(entry.raceId, entry)
    }
  })

  const merged = Array.from(mergedById.values()).sort((a, b) => b.savedAt - a.savedAt).slice(0, 100)
  writeJson(INDEX_KEY, merged)
  return merged
}

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

