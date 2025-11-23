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

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Only Tactics!</h1>
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
      </header>
      <main className="app-main">
        {mode === 'live' ? <LiveClient /> : <ReplayClient />}
      </main>
    </div>
  )
}
