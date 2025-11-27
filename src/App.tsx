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
  const promptLogHref = `${import.meta.env.BASE_URL ?? '/'}onlytactics_prompt_log.html`
  const appVersion = `v${__APP_VERSION__}`
  const releaseUrl = __APP_RELEASE_URL__
  const [showMaintenance, setShowMaintenance] = useState(true)

  return (
    <div className="app-shell">
      {showMaintenance && (
        <div className="maintenance-overlay" role="alertdialog" aria-modal="true">
          <div className="maintenance-card">
            <h2>Hang tight!</h2>
            <p>
              Sorry <span role="img" aria-label="smiling face">😊</span> we broke the app. I got stuck trying to deploy the
              new backend, but you&apos;re really going to love it when it&apos;s working again.
            </p>
            <button type="button" onClick={() => setShowMaintenance(false)}>
              Close
            </button>
          </div>
        </div>
      )}
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
          <div className="mode-switcher">
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
          <nav className="header-links" aria-label="Project resources">
            <a
              className="icon-link"
              href="https://github.com/Smod9/onlytactics/issues"
              target="_blank"
              rel="noreferrer"
              title="View issues on GitHub"
            >
              <span className="sr-only">GitHub Issues</span>
              <GitHubIcon />
            </a>
            <a
              className="icon-link"
              href={promptLogHref}
              target="_blank"
              rel="noreferrer"
              title="Prompt log"
            >
              <span className="sr-only">Prompt Log</span>
              <DocumentIcon />
            </a>
          </nav>
        </div>
      </header>
      <main className="app-main">
        {mode === 'live' ? <LiveClient /> : <ReplayClient />}
      </main>
    </div>
  )
}

const GitHubIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48l-.01-1.68c-2.78.61-3.37-1.34-3.37-1.34-.45-1.17-1.1-1.48-1.1-1.48-.9-.61.07-.6.07-.6 1 .07 1.52 1.02 1.52 1.02.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.95 0-1.09.39-1.99 1.02-2.69-.1-.25-.44-1.28.1-2.68 0 0 .83-.27 2.73 1.02a9.45 9.45 0 0 1 4.97 0c1.9-1.29 2.72-1.02 2.72-1.02.55 1.4.21 2.43.1 2.68.63.7 1.02 1.6 1.02 2.69 0 3.85-2.33 4.7-4.56 4.95.36.31.67.92.67 1.86l-.01 2.76c0 .26.18.58.69.48A10 10 0 0 0 12 2z" />
  </svg>
)

const DocumentIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M6 2h7l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4c0-1.1.9-2 2-2zm6 1.5V8h4.5L12 3.5zM8 11v-1h8v1H8zm0 3v-1h8v1H8zm0 3v-1h5v1H8z" />
  </svg>
)
