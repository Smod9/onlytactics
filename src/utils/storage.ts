const getLocalStorage = () =>
  typeof window === 'undefined' ? undefined : window.localStorage

const safeRead = <T>(storage: Storage | undefined, key: string, fallback: T): T => {
  try {
    if (!storage) return fallback
    const raw = storage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

const safeWrite = (storage: Storage | undefined, key: string, value: unknown) => {
  if (!storage) return
  storage.setItem(key, JSON.stringify(value))
}

export const readJson = <T>(key: string, fallback: T): T =>
  safeRead(getLocalStorage(), key, fallback)

export const writeJson = (key: string, value: unknown) =>
  safeWrite(getLocalStorage(), key, value)

export const removeKey = (key: string) => {
  const ls = getLocalStorage()
  if (!ls) return
  ls.removeItem(key)
}
