import { useState, useEffect } from 'react'
import { LiveClient } from './features/live/LiveClient'
import { ReplayClient } from './features/replay/ReplayClient'
import { LobbyClient } from './features/live/LobbyClient'
import { LoginPage } from './features/auth/LoginPage'
import { RegisterPage } from './features/auth/RegisterPage'
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage'
import { ResetPasswordPage } from './features/auth/ResetPasswordPage'
import { AdminDashboard } from './features/admin/AdminDashboard'
import { LeaderboardPage } from './features/stats/LeaderboardPage'
import { ProfilePage } from './features/stats/ProfilePage'
import { useAuth } from './state/authStore'
import './styles/auth.css'

type AppMode = 'live' | 'replay' | 'lobby' | 'login' | 'register' | 'forgot-password' | 'reset-password' | 'admin' | 'leaderboard' | 'profile'

const getInitialMode = (): AppMode => {
  if (typeof window === 'undefined') return 'live'
  const path = window.location.pathname
  if (path.startsWith('/login')) return 'login'
  if (path.startsWith('/register')) return 'register'
  if (path.startsWith('/forgot-password')) return 'forgot-password'
  if (path.startsWith('/reset-password')) return 'reset-password'
  if (path.startsWith('/admin')) return 'admin'
  if (path.startsWith('/leaderboard')) return 'leaderboard'
  if (path.startsWith('/profile')) return 'profile'
  if (path.startsWith('/lobby')) return 'lobby'
  if (path.startsWith('/app')) return 'live'
  return 'live'
}

export function App() {
  const [mode, setMode] = useState<AppMode>(getInitialMode)
  const { user: authUser, isAuthenticated, isAdmin, logout: authLogout } = useAuth()
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
      } else if (path.startsWith('/leaderboard')) {
        setMode('leaderboard')
      } else if (path.startsWith('/profile')) {
        setMode('profile')
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
  if (mode === 'leaderboard') return <LeaderboardPage />
  if (mode === 'profile') return <ProfilePage />

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
          {mode !== 'live' && (
            <div className="header-auth">
              <a href="/leaderboard" className="header-auth-link" onClick={(e) => { e.preventDefault(); window.location.href = '/leaderboard' }}>
                Leaderboard
              </a>
              {isAuthenticated ? (
                <>
                  <a href="/profile" className="header-auth-link" onClick={(e) => { e.preventDefault(); window.location.href = '/profile' }}>
                    {authUser?.displayName ?? 'Account'}
                  </a>
                  {isAdmin && (
                    <a href="/admin" className="header-auth-link" onClick={(e) => { e.preventDefault(); window.location.href = '/admin' }}>
                      Admin
                    </a>
                  )}
                  <button
                    type="button"
                    className="header-auth-link header-auth-logout"
                    onClick={async () => {
                      await authLogout()
                      window.location.href = '/lobby'
                    }}
                  >
                    Log Out
                  </button>
                </>
              ) : (
                <>
                  <a href="/login" className="header-auth-link" onClick={(e) => { e.preventDefault(); window.location.href = '/login' }}>
                    Sign In
                  </a>
                  <a href="/register" className="header-auth-link header-auth-register" onClick={(e) => { e.preventDefault(); window.location.href = '/register' }}>
                    Register
                  </a>
                </>
              )}
            </div>
          )}
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
