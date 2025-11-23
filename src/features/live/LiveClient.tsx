import { useEffect, useState, useSyncExternalStore } from 'react'
import { appEnv } from '@/config/env'
import { PixiStage } from '@/view/PixiStage'
import { useRaceEvents } from '@/state/hooks'
import { GameNetwork } from '@/net/gameNetwork'
import { ChatPanel } from './ChatPanel'
import { ReplaySaveButton } from './ReplaySaveButton'
import { useTacticianControls } from './useTacticianControls'
import { DebugPanel } from './DebugPanel'

export const LiveClient = () => {
  const events = useRaceEvents()
  const [network] = useState(() => new GameNetwork())
  const [showDebug, setShowDebug] = useState(appEnv.debugHud)

  useEffect(() => {
    void network.start()
    return () => network.stop()
  }, [network])

  const role = useSyncExternalStore(
    (listener) => network.onRoleChange(listener),
    () => network.getRole(),
    () => appEnv.clientRole,
  )

  useTacticianControls(network, role)

  return (
    <div className="live-client">
      <div className="live-main">
        <PixiStage />
        <aside className="hud-panel">
        <h2>Race Feed</h2>
        <p>
          Race <strong>{appEnv.raceId}</strong> as <strong>{role}</strong>
        </p>
        <div className="event-list">
          {events.slice(-5).map((event) => (
            <div key={event.eventId} className="event-item">
              <span className="event-kind">{event.kind}</span>
              <span className="event-message">{event.message}</span>
            </div>
          ))}
          {!events.length && <p>No rule events yet.</p>}
        </div>
        <ChatPanel network={network} />
        {role === 'host' && <ReplaySaveButton />}
        {role !== 'spectator' && (
          <div className="tactician-help">
            <h3>Tactician Controls</h3>
            <ul>
              <li>
                <kbd>Space</kbd> Sail by telltales (auto VMG heading)
              </li>
              <li>
                <kbd>Enter</kbd> Tack / gybe (locks helm until turn completes)
              </li>
              <li>
                <kbd>↑</kbd> Head up 5°
              </li>
              <li>
                <kbd>↓</kbd> Bear away 5°
              </li>
            </ul>
          </div>
        )}
        <button
          type="button"
          className="debug-toggle"
          onClick={() => setShowDebug((value) => !value)}
        >
          {showDebug ? 'Hide Debug' : 'Show Debug'}
        </button>
      </aside>
      </div>
      {showDebug && (
        <div className="debug-dock">
          <DebugPanel />
        </div>
      )}
    </div>
  )
}

