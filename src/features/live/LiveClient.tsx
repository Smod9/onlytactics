import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import { createPortal } from 'react-dom'
import { appEnv } from '@/config/env'
import { PixiStage } from '@/view/PixiStage'
import { useRaceEvents, useRaceState } from '@/state/hooks'
import { GameNetwork } from '@/net/gameNetwork'
import { ChatPanel } from './ChatPanel'
import { ReplaySaveButton } from './ReplaySaveButton'
import { useTacticianControls } from './useTacticianControls'
import { DebugPanel } from './DebugPanel'
import { identity, setClientName } from '@/net/identity'
import { startRosterWatcher } from '@/state/rosterStore'
import { RosterPanel } from './RosterPanel'
import { TacticianPopout } from './TacticianPopout'
import type { RaceRole } from '@/types/race'

export const LiveClient = () => {
  const events = useRaceEvents()
  const race = useRaceState()
  const [network] = useState(() => new GameNetwork())
  const [showDebug, setShowDebug] = useState(false)
  const [nameEntry, setNameEntry] = useState(identity.clientName ?? '')
  const [needsName, setNeedsName] = useState(!identity.clientName)
  const headerCtaEl =
    typeof document === 'undefined' ? null : document.getElementById('header-cta-root')

  const playerBoat = useMemo(() => race.boats[identity.boatId], [race.boats])

  useEffect(() => {
    void startRosterWatcher()
  }, [])

  useEffect(() => {
    if (needsName) return
    void network.start()
    return () => network.stop()
  }, [network, needsName])

  const role = useSyncExternalStore<RaceRole>(
    (listener) => network.onRoleChange(listener),
    () => network.getRole(),
    () => 'spectator',
  )

  const networkStatus = useSyncExternalStore<ReturnType<GameNetwork['getStatus']>>(
    (listener) => network.onStatusChange(listener),
    () => network.getStatus(),
    () => 'idle',
  )

  useTacticianControls(network, role)

  const submitName = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = nameEntry.trim()
    if (!trimmed) return
    setClientName(trimmed)
    setNeedsName(false)
    network.announcePresence('online')
  }

  const replayPortal =
    role === 'host' && headerCtaEl ? createPortal(<ReplaySaveButton />, headerCtaEl) : null

  return (
    <div className="live-client">
      {replayPortal}
      {needsName && (
        <div className="username-gate">
          <div className="username-card">
            <h2>Enter Your Name</h2>
            <p>We use this to label your boat and chat messages in the race.</p>
            <form className="username-form" onSubmit={submitName}>
              <input
                value={nameEntry}
                onChange={(event) => setNameEntry(event.target.value)}
                placeholder="Callsign or Name"
                maxLength={24}
              />
              <button type="submit" disabled={!nameEntry.trim()}>
                Join Race
              </button>
            </form>
          </div>
        </div>
      )}
      <div className="live-main">
        <PixiStage />
        <aside className="hud-panel">
        <h2>Race Feed</h2>
        <p>
          Race <strong>{appEnv.raceId}</strong> as <strong>{role}</strong>
        </p>
        <p>
          You are <strong>{identity.clientName}</strong>
        </p>
        {networkStatus === 'looking_for_host' && (
          <p className="countdown-status">Looking for host&hellip;</p>
        )}
        {networkStatus === 'connecting' && (
          <p className="countdown-status">Connecting&hellip;</p>
        )}
        {networkStatus === 'joining' && (
          <p className="countdown-status">Joining race&hellip;</p>
        )}
        {networkStatus === 'ready' && race.phase === 'prestart' && !race.countdownArmed && (
          <p className="countdown-status">
            Waiting for host to start the sequence&hellip;
          </p>
        )}
        {role === 'host' && race.phase === 'prestart' && !race.countdownArmed && (
          <button
            type="button"
            className="start-sequence"
            onClick={() => network.armCountdown(appEnv.countdownSeconds)}
          >
            Start {appEnv.countdownSeconds}s Sequence
          </button>
        )}
        {playerBoat && (
          <div className="player-actions">
            <div className="speed-readout">
              SPD {playerBoat.speed.toFixed(2)} kts
            </div>
            <div className="heading-readout">
              HDG {playerBoat.headingDeg.toFixed(0)}°
            </div>
            {playerBoat.penalties > 0 && (
              <button
                type="button"
                className="spin-button"
                onClick={() => network.requestSpin()}
                title="Perform a 360° spin (also clears one penalty if you have any)"
              >
                360° Spin (S)
              </button>
            )}
          </div>
        )}
        <div className="event-list">
          {events
            .slice()
            .reverse()
            .slice(0, 10)
            .map((event, index) => (
              <div key={event.eventId} className="event-item">
                <span className="event-kind">
                  #{events.length - index} {event.kind}
                  {event.ruleId ? ` (Rule ${event.ruleId})` : ''}
                </span>
                <span className="event-message">{event.message}</span>
              </div>
            ))}
          {!events.length && <p>No rule events yet.</p>}
        </div>
        <RosterPanel role={role} />
        <ChatPanel network={network} />
        <button
          type="button"
          className="debug-toggle"
          onClick={() => setShowDebug((value) => !value)}
        >
          {showDebug ? 'Hide Debug' : 'Show Debug'}
        </button>
      </aside>
      </div>
      <TacticianPopout />
      {showDebug && (
        <div className="debug-dock">
          <DebugPanel onClose={() => setShowDebug(false)} />
        </div>
      )}
    </div>
  )
}

