import { useState, type FormEvent } from 'react'
import { LiveClient } from './features/live/LiveClient'
import { ReplayClient } from './features/replay/ReplayClient'
import { identity, setClientName } from './net/identity'

type AppMode = 'live' | 'replay'

const MODES: Array<{ label: string; value: AppMode }> = [
  { label: 'Live Race', value: 'live' },
  { label: 'Replay Viewer', value: 'replay' },
]

export function App() {
  const [mode, setMode] = useState<AppMode>('live')
  const [showNameModal, setShowNameModal] = useState(false)
  const [nameEntry, setNameEntry] = useState(identity.clientName ?? '')
  const [currentName, setCurrentName] = useState(identity.clientName)
  const [showConfirm, setShowConfirm] = useState(false)
  const appVersion = `v${__APP_VERSION__}`
  const releaseUrl = __APP_RELEASE_URL__

  const handleNameClick = () => {
    setNameEntry(currentName ?? '')
    setShowConfirm(true)
  }

  const confirmNameChange = () => {
    setShowConfirm(false)
    setShowNameModal(true)
  }

  const submitName = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = nameEntry.trim()
    if (!trimmed) return
    setClientName(trimmed)
    setCurrentName(trimmed)
    setShowNameModal(false)
    // Reload page to apply name change
    window.location.reload()
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
          {currentName && (
            <button
              type="button"
              className="header-name"
              onClick={handleNameClick}
              title="Click to change your name"
            >
              <span className="header-name-text">Sailing as: {currentName}</span>
              <PencilIcon />
            </button>
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
          <nav className="header-links" aria-label="Project resources">
            <a
              className="icon-link"
              href="https://github.com/Smod9/onlytactics/issues"
              target="_blank"
              rel="noreferrer"
              title="Report issues or view on GitHub"
            >
              <span className="sr-only">GitHub Issues</span>
              <GitHubIcon />
            </a>
            <a
              className="icon-link"
              href="https://discord.gg/EJd3yQKP"
              target="_blank"
              rel="noreferrer"
              title="Join our Discord community"
            >
              <span className="sr-only">Discord</span>
              <DiscordIcon />
            </a>
            <a
              className="icon-link"
              href="https://chat.whatsapp.com/HkPbihB8MVeBOY140I3LNO?mode=hqrt1"
              target="_blank"
              rel="noreferrer"
              title="Join our WhatsApp group"
            >
              <span className="sr-only">WhatsApp</span>
              <WhatsAppIcon />
            </a>
          </nav>
        </div>
      </header>
      {showConfirm && (
        <div className="username-gate">
          <div className="username-card">
            <h2>Change Your Name?</h2>
            <p>
              <strong>Warning:</strong> Changing your name will require a page refresh. 
              You may lose your current position in the race.
            </p>
            <div className="username-form-actions">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="username-form-cancel"
              >
                Cancel
              </button>
              <button type="button" onClick={confirmNameChange}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
      {showNameModal && (
        <div className="username-gate">
          <div className="username-card">
            <h2>Change Your Name</h2>
            <p>We use this to label your boat and chat messages in the race.</p>
            <form className="username-form" onSubmit={submitName}>
              <input
                value={nameEntry}
                onChange={(event) => setNameEntry(event.target.value)}
                placeholder="Callsign or Name"
                maxLength={24}
                autoFocus
              />
              <div className="username-form-actions">
                <button
                  type="button"
                  onClick={() => setShowNameModal(false)}
                  className="username-form-cancel"
                >
                  Cancel
                </button>
                <button type="submit" disabled={!nameEntry.trim()}>
                  Update Name
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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

const DiscordIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
)

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
  </svg>
)

const PencilIcon = () => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
    width="14"
    height="14"
  >
    <path
      fill="currentColor"
      d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
    />
  </svg>
)
