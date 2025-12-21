import { useState } from 'react'
import { LiveClient } from './features/live/LiveClient'
import { ReplayClient } from './features/replay/ReplayClient'

type AppMode = 'live' | 'replay'

const MODES: Array<{ label: string; value: AppMode }> = [
  { label: 'Live Race', value: 'live' },
  { label: 'Replay Viewer', value: 'replay' },
]

export function App() {
  const [mode, setMode] = useState<AppMode>('live')
  const appVersion = `v${__APP_VERSION__}`
  const releaseUrl = __APP_RELEASE_URL__

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
        {mode === 'live' ? <LiveClient /> : <ReplayClient />}
      </main>
    </div>
  )
}
