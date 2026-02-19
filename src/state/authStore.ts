import { auth, type User, type AuthState, type LoginCredentials, type RegisterCredentials } from '@/features/auth'

const AUTH_STORAGE_KEY = 'auth_state'

interface StoredAuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
}

// Simple reactive store for auth state
type Listener = () => void

class AuthStore {
  private state: AuthState = {
    user: null,
    accessToken: null,
    refreshToken: null,
    isLoading: true,
    error: null,
  }

  private listeners: Set<Listener> = new Set()

  constructor() {
    this.loadFromStorage()
  }

  private loadFromStorage() {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as StoredAuthState
        this.state = {
          ...this.state,
          user: parsed.user,
          accessToken: parsed.accessToken,
          refreshToken: parsed.refreshToken,
          isLoading: false,
        }
      } else {
        this.state.isLoading = false
      }
    } catch {
      this.state.isLoading = false
    }
    this.notify()
  }

  private saveToStorage() {
    const toStore: StoredAuthState = {
      user: this.state.user,
      accessToken: this.state.accessToken,
      refreshToken: this.state.refreshToken,
    }
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(toStore))
  }

  private clearStorage() {
    localStorage.removeItem(AUTH_STORAGE_KEY)
  }

  private notify() {
    this.listeners.forEach((listener) => listener())
  }

  private setState(updates: Partial<AuthState>) {
    this.state = { ...this.state, ...updates }
    this.notify()
  }

  getState(): AuthState {
    return this.state
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async login(credentials: LoginCredentials): Promise<void> {
    this.setState({ isLoading: true, error: null })
    try {
      const response = await auth.login(credentials)
      this.setState({
        user: response.user,
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        isLoading: false,
        error: null,
      })
      this.saveToStorage()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed'
      this.setState({ isLoading: false, error: message })
      throw error
    }
  }

  async register(credentials: RegisterCredentials): Promise<void> {
    this.setState({ isLoading: true, error: null })
    try {
      const response = await auth.register(credentials)
      this.setState({
        user: response.user,
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        isLoading: false,
        error: null,
      })
      this.saveToStorage()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed'
      this.setState({ isLoading: false, error: message })
      throw error
    }
  }

  async logout(): Promise<void> {
    try {
      if (this.state.refreshToken) {
        await auth.logout(this.state.refreshToken)
      }
    } catch {
      // Ignore logout errors
    }
    this.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoading: false,
      error: null,
    })
    this.clearStorage()
  }

  async refreshSession(): Promise<boolean> {
    if (!this.state.refreshToken) {
      return false
    }

    try {
      const response = await auth.refreshTokens(this.state.refreshToken)
      this.setState({
        user: response.user,
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
      })
      this.saveToStorage()
      return true
    } catch {
      // Token refresh failed, clear auth state
      this.setState({
        user: null,
        accessToken: null,
        refreshToken: null,
      })
      this.clearStorage()
      return false
    }
  }

  async fetchCurrentUser(): Promise<void> {
    if (!this.state.accessToken) {
      return
    }

    try {
      const user = await auth.getMe(this.state.accessToken)
      this.setState({ user })
      this.saveToStorage()
    } catch {
      // Token might be expired, try to refresh
      const refreshed = await this.refreshSession()
      if (!refreshed) {
        this.setState({ user: null, accessToken: null, refreshToken: null })
        this.clearStorage()
      }
    }
  }

  clearError() {
    this.setState({ error: null })
  }

  isAuthenticated(): boolean {
    return !!this.state.user && !!this.state.accessToken
  }

  isAdmin(): boolean {
    return this.state.user?.role === 'admin'
  }

  getAccessToken(): string | null {
    return this.state.accessToken
  }
}

// Singleton instance
export const authStore = new AuthStore()

// Stable bound references (created once, never change)
const subscribe = (cb: Listener) => authStore.subscribe(cb)
const getSnapshot = () => authStore.getState()
const boundLogin = authStore.login.bind(authStore)
const boundRegister = authStore.register.bind(authStore)
const boundLogout = authStore.logout.bind(authStore)
const boundRefreshSession = authStore.refreshSession.bind(authStore)
const boundClearError = authStore.clearError.bind(authStore)
const boundGetAccessToken = authStore.getAccessToken.bind(authStore)

// React hook for using auth state
import { useEffect, useSyncExternalStore } from 'react'

export const useAuth = () => {
  const state = useSyncExternalStore(subscribe, getSnapshot)

  return {
    ...state,
    login: boundLogin,
    register: boundRegister,
    logout: boundLogout,
    refreshSession: boundRefreshSession,
    clearError: boundClearError,
    isAuthenticated: authStore.isAuthenticated(),
    isAdmin: authStore.isAdmin(),
    getAccessToken: boundGetAccessToken,
  }
}

// Hook for protected routes
export const useRequireAuth = (redirectTo = '/login') => {
  const { isAuthenticated, isLoading } = useAuth()

  // Compute redirect synchronously based on state
  const shouldRedirect = !isLoading && !isAuthenticated

  useEffect(() => {
    if (shouldRedirect) {
      window.history.pushState({}, '', redirectTo)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }
  }, [shouldRedirect, redirectTo])

  return { isLoading, shouldRedirect }
}

// Hook for admin-only routes
export const useRequireAdmin = (redirectTo = '/') => {
  const { isAuthenticated, isAdmin, isLoading } = useAuth()

  // Compute redirect synchronously based on state
  const shouldRedirect = !isLoading && (!isAuthenticated || !isAdmin)

  useEffect(() => {
    if (shouldRedirect) {
      window.history.pushState({}, '', redirectTo)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }
  }, [shouldRedirect, redirectTo])

  return { isLoading, shouldRedirect }
}
