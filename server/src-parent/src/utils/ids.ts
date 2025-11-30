const fallbackRandom = () => Math.random().toString(36).slice(2, 10)

export const createId = (prefix = 'id') => {
  const base =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : fallbackRandom()
  return `${prefix}-${base}`
}

