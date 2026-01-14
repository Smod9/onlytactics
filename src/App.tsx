import { useState, useEffect } from 'react'
import { LiveClient } from './features/live/LiveClient'
import { ReplayClient } from './features/replay/ReplayClient'
import { LobbyClient } from './features/live/LobbyClient'

type AppMode = 'live' | 'replay' | 'lobby'

const MODES: Array<{ label: string; value: AppMode }> = [
  { label: 'Live Race', value: 'live' },
  { label: 'Replay Viewer', value: 'replay' },
]

export function App() {
  const [mode, setMode] = useState<AppMode>(() => {
    if (typeof window === 'undefined') return 'live'
    const path = window.location.pathname
    if (path.startsWith('/lobby')) return 'lobby'
    if (path.startsWith('/app')) return 'live'
    return 'live'
  })
  const appVersion = `v${__APP_VERSION__}`
  const releaseUrl = __APP_RELEASE_URL__

  useEffect(() => {
    const handleLocationChange = () => {
      if (typeof window === 'undefined') return
      const path = window.location.pathname
      if (path.startsWith('/lobby')) {
        setMode('lobby')
      } else if (path.startsWith('/app')) {
        setMode('live')
      }
    }
    window.addEventListener('popstate', handleLocationChange)
    return () => window.removeEventListener('popstate', handleLocationChange)
  }, [])

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
