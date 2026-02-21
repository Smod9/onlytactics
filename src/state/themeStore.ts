import { useSyncExternalStore } from 'react'

export type ThemePreference = 'light' | 'dark' | 'auto'
export type ResolvedTheme = 'light' | 'dark'

type Listener = () => void

class ThemeStore {
  private preference: ThemePreference = 'auto'
  private resolved: ResolvedTheme = 'dark'
  private listeners = new Set<Listener>()
  private mediaQuery: MediaQueryList | null = null

  constructor() {
    if (typeof window !== 'undefined') {
      this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      this.mediaQuery.addEventListener('change', this.handleMediaChange)
    }
    this.resolve()
  }

  private handleMediaChange = () => {
    if (this.preference === 'auto') {
      this.resolve()
      this.notify()
    }
  }

  private resolve() {
    if (this.preference === 'auto') {
      this.resolved = this.mediaQuery?.matches ? 'dark' : 'light'
    } else {
      this.resolved = this.preference
    }
    this.applyToDOM()
  }

  private applyToDOM() {
    if (typeof document === 'undefined') return
    document.documentElement.setAttribute('data-theme', this.resolved)
    document.documentElement.style.colorScheme = this.resolved
  }

  private notify() {
    this.listeners.forEach((l) => l())
  }

  getPreference(): ThemePreference {
    return this.preference
  }

  getResolved(): ResolvedTheme {
    return this.resolved
  }

  setPreference(pref: ThemePreference) {
    if (pref === this.preference) return
    this.preference = pref
    this.resolve()
    this.notify()
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

export const themeStore = new ThemeStore()

const subscribe = (cb: Listener) => themeStore.subscribe(cb)

interface ThemeSnapshot {
  preference: ThemePreference
  resolved: ResolvedTheme
}

const getSnapshot = (): ThemeSnapshot => ({
  preference: themeStore.getPreference(),
  resolved: themeStore.getResolved(),
})

export const useTheme = () => {
  const state = useSyncExternalStore(subscribe, getSnapshot)
  return {
    ...state,
    setPreference: (pref: ThemePreference) => themeStore.setPreference(pref),
  }
}

export const getResolvedTheme = (): ResolvedTheme => themeStore.getResolved()
