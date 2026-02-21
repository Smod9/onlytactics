import { useState, useEffect, useRef } from 'react'
import { LiveClient } from './features/live/LiveClient'
import { ReplayClient } from './features/replay/ReplayClient'
import { LobbyClient } from './features/live/LobbyClient'
import { LoginPage } from './features/auth/LoginPage'
import { RegisterPage } from './features/auth/RegisterPage'
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage'
import { ResetPasswordPage } from './features/auth/ResetPasswordPage'
import { AuthGatePage } from './features/auth/AuthGatePage'
import { isGuestMode, clearGuestMode } from './features/auth/guestMode'
import { AdminDashboard } from './features/admin/AdminDashboard'
import { LeaderboardPage } from './features/stats/LeaderboardPage'
import { ProfilePage } from './features/stats/ProfilePage'
import { useAuth } from './state/authStore'
import { TrophyIcon, ReplayIcon, UserIcon, AdminIcon, LogOutIcon, LobbyIcon } from './view/icons'
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
  if (path.startsWith('/replay')) return 'replay'
  if (path.startsWith('/lobby')) return 'lobby'
  if (path.startsWith('/app')) return 'live'
  return 'live'
}

function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

export function App() {
  const [mode, setMode] = useState<AppMode>(getInitialMode)
  const [gatePassedThisSession, setGatePassedThisSession] = useState(false)
  const { user: authUser, isAuthenticated, isAdmin, logout: authLogout } = useAuth()
  const appVersion = `v${__APP_VERSION__}`
  const releaseUrl = __APP_RELEASE_URL__

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

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
      } else if (path.startsWith('/replay')) {
        setMode('replay')
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

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  // Auth pages render without the app shell
  if (mode === 'login') return <LoginPage />
  if (mode === 'register') return <RegisterPage />
  if (mode === 'forgot-password') return <ForgotPasswordPage />
  if (mode === 'reset-password') return <ResetPasswordPage />
  if (mode === 'admin') return <AdminDashboard />
  if (mode === 'leaderboard') return <LeaderboardPage />
  if (mode === 'profile') return <ProfilePage />

  // Auth gate: require login/register or guest opt-in before lobby/game
  const needsGate = (mode === 'lobby' || mode === 'live') && !isAuthenticated && !isGuestMode() && !gatePassedThisSession

  if (needsGate) {
    return <AuthGatePage onAuthenticated={() => setGatePassedThisSession(true)} />
  }

  const handleLogout = async () => {
    setMenuOpen(false)
    await authLogout()
    clearGuestMode()
    window.location.href = '/lobby'
  }

  const navigateTo = (path: string) => {
    setMenuOpen(false)
    window.location.href = path
  }

  const displayName = isAuthenticated
    ? (authUser?.displayName ?? 'Sailor')
    : 'Guest'

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
          <span className="header-user-label">{displayName}</span>
          <div className="header-menu-wrapper" ref={menuRef}>
            <button
              type="button"
              className="header-hamburger"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="Menu"
              aria-expanded={menuOpen}
            >
              <HamburgerIcon />
            </button>
            {menuOpen && (
              <div className="header-menu-dropdown">
                {isAuthenticated && (
                  <button type="button" className="header-menu-item" onClick={() => navigateTo('/profile')}>
                    <UserIcon /> Profile
                  </button>
                )}
                <button type="button" className="header-menu-item" onClick={() => navigateTo('/leaderboard')}>
                  <TrophyIcon /> Leaderboard
                </button>
                <button type="button" className="header-menu-item" onClick={() => navigateTo('/replay')}>
                  <ReplayIcon /> Replays
                </button>
                {isAuthenticated && (
                  <button type="button" className="header-menu-item" onClick={() => navigateTo('/lobby')}>
                    <LobbyIcon /> Lobby
                  </button>
                )}
                {isAdmin && (
                  <button type="button" className="header-menu-item" onClick={() => navigateTo('/admin')}>
                    <AdminIcon /> Admin
                  </button>
                )}
                <div className="header-menu-divider" />
                {isAuthenticated ? (
                  <button type="button" className="header-menu-item header-menu-item-danger" onClick={handleLogout}>
                    <LogOutIcon /> Log Out
                  </button>
                ) : (
                  <button type="button" className="header-menu-item" onClick={() => navigateTo('/register')}>
                    Create Account
                  </button>
                )}
              </div>
            )}
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
