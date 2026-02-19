import { useSyncExternalStore } from 'react'

let currentHz = 0
const listeners = new Set<() => void>()

export const patchRateStore = {
  getHz: () => currentHz,
  setHz: (hz: number) => {
    currentHz = hz
    listeners.forEach((l) => l())
  },
  subscribe: (listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}

export function usePatchRate(): number {
  return useSyncExternalStore(patchRateStore.subscribe, patchRateStore.getHz)
}
