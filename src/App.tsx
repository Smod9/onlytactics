import { useState, useEffect } from 'react'
import { LiveClient } from './features/live/LiveClient'
import { ReplayClient } from './features/replay/ReplayClient'
import { LobbyClient } from './features/live/LobbyClient'
import { LoginPage } from './features/auth/LoginPage'
import { RegisterPage } from './features/auth/RegisterPage'
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage'
import { ResetPasswordPage } from './features/auth/ResetPasswordPage'
import { AdminDashboard } from './features/admin/AdminDashboard'
import { useAuth } from './state/authStore'
import './styles/auth.css'

type AppMode = 'live' | 'replay' | 'lobby' | 'login' | 'register' | 'forgot-password' | 'reset-password' | 'admin'

const MODES: Array<{ label: string; value: AppMode }> = [
  { label: 'Live Race', value: 'live' },
  { label: 'Replay Viewer', value: 'replay' },
]

const getInitialMode = (): AppMode => {
  if (typeof window === 'undefined') return 'live'
  const path = window.location.pathname
  if (path.startsWith('/login')) return 'login'
  if (path.startsWith('/register')) return 'register'
  if (path.startsWith('/forgot-password')) return 'forgot-password'
  if (path.startsWith('/reset-password')) return 'reset-password'
  if (path.startsWith('/admin')) return 'admin'
  if (path.startsWith('/lobby')) return 'lobby'
  if (path.startsWith('/app')) return 'live'
  return 'live'
}

export function App() {
  const [mode, setMode] = useState<AppMode>(getInitialMode)
  const { user, isAuthenticated, isAdmin, logout } = useAuth()
  const appVersion = `v${__APP_VERSION__}`
  const releaseUrl = __APP_RELEASE_URL__

  useEffect(() => {
    const handleLocationChange = () => {
      if (typeof window === 'undefined') return
      const path = window.location.pathname
      if (path.startsWith('/login')) {
        setMode('login')
      } else if (path.startsWith('/register')) {
        setMode('register')
      } else if (path.startsWith('/forgot-password')) {
        setMode('forgot-password')
      } else if (path.startsWith('/reset-password')) {
        setMode('reset-password')
      } else if (path.startsWith('/admin')) {
        setMode('admin')
      } else if (path.startsWith('/lobby')) {
        setMode('lobby')
      } else if (path.startsWith('/app')) {
        setMode('live')
      } else if (path === '/') {
        setMode('live')
      }
    }
    window.addEventListener('popstate', handleLocationChange)
    return () => window.removeEventListener('popstate', handleLocationChange)
  }, [])

  // Auth pages render without the app shell
  if (mode === 'login') return <LoginPage />
  if (mode === 'register') return <RegisterPage />
  if (mode === 'forgot-password') return <ForgotPasswordPage />
  if (mode === 'reset-password') return <ResetPasswordPage />
  if (mode === 'admin') return <AdminDashboard />

  const handleLogout = async () => {
    await logout()
    window.history.pushState({}, '', '/')
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  const navigateTo = (path: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <a href="/" title="Return to landing page">
            <h1>Only Tactics!</h1>
          </a>
          <a
            className="app-version"
            href={releaseUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`Application version ${appVersion}. View release notes.`}
            title={`View release notes for ${appVersion}`}
          >
            {appVersion}
          </a>
        </div>
        <div className="header-right">
          <div id="header-cta-root" className="header-cta" />
          {isAuthenticated ? (
            <div className="header-user-menu">
              <span className="header-user-name">{user?.displayName}</span>
              {isAdmin && (
                <a href="/admin" onClick={navigateTo('/admin')} className="header-admin-link">
                  Admin
                </a>
              )}
              <button onClick={handleLogout} className="header-logout-btn">
                Logout
              </button>
            </div>
          ) : (
            <div className="header-auth-links">
              <a href="/login" onClick={navigateTo('/login')} className="header-login-link">
                Sign In
              </a>
              <a href="/register" onClick={navigateTo('/register')} className="header-register-link">
                Register
              </a>
            </div>
          )}
          <div className="mode-switcher" style={{ display: 'none' }}>
            {MODES.map(({ label, value }) => (
              <button
                key={value}
                className={value === mode ? 'active' : ''}
                onClick={() => setMode(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>
      <main className="app-main">
        {mode === 'lobby' ? (
          <LobbyClient />
        ) : mode === 'live' ? (
          <LiveClient />
        ) : (
          <ReplayClient />
        )}
      </main>
    </div>
  )
}
