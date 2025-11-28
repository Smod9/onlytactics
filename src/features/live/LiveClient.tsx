import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
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
import { OnScreenControls } from './OnScreenControls'

export const LiveClient = () => {
  const events = useRaceEvents()
  const race = useRaceState()
  const [network] = useState(() => new GameNetwork())
  const [showDebug, setShowDebug] = useState(false)
  const [nameEntry, setNameEntry] = useState(identity.clientName ?? '')
  const [needsName, setNeedsName] = useState(!identity.clientName)
  const [idleSuspended, setIdleSuspended] = useState(false)
  const headerCtaEl =
    typeof document === 'undefined' ? null : document.getElementById('header-cta-root')

  const playerBoat = useMemo(() => race.boats[identity.boatId], [race.boats])

  useEffect(() => {
    void startRosterWatcher()
  }, [])

  const skipDevCleanupRef = useRef(import.meta.env.DEV)

  useEffect(() => {
    if (needsName) return
    void network.start()
    return () => {
      if (skipDevCleanupRef.current) {
        skipDevCleanupRef.current = false
        return
      }
      network.stop()
    }
  }, [network, needsName])

  useEffect(() => {
    if (needsName || idleSuspended) return
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    const timeoutMs = appEnv.clientIdleTimeoutMs
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return

    let idleTimer: ReturnType<typeof window.setTimeout> | undefined

    const expireForIdle = () => {
      setIdleSuspended(true)
      network.stop()
    }

    const resetIdleTimer = () => {
      window.clearTimeout(idleTimer)
      idleTimer = window.setTimeout(expireForIdle, timeoutMs)
    }

    const handleActivity = () => {
      if (document.hidden) return
      resetIdleTimer()
    }

    const handleVisibility = () => {
      if (!document.hidden) {
        resetIdleTimer()
      }
    }

    resetIdleTimer()

    const activityEvents: Array<keyof WindowEventMap> = [
      'pointerdown',
      'pointermove',
      'keydown',
      'wheel',
      'touchstart',
    ]

    activityEvents.forEach((event) => window.addEventListener(event, handleActivity))
    window.addEventListener('focus', handleActivity)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.clearTimeout(idleTimer)
      activityEvents.forEach((event) => window.removeEventListener(event, handleActivity))
      window.removeEventListener('focus', handleActivity)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [idleSuspended, needsName, network, appEnv.clientIdleTimeoutMs])

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

  const resumeFromIdle = () => {
    if (!idleSuspended) return
    setIdleSuspended(false)
    void network.start()
  }

  const headerPortal =
    role === 'host' && headerCtaEl
      ? createPortal(
          <div className="header-controls">
            <ReplaySaveButton />
            <button
              type="button"
              className="start-sequence"
              onClick={() => network.setAiEnabled(!race.aiEnabled)}
              style={{ display: 'none' }}
            >
              {race.aiEnabled ? 'Disable AI Boats' : 'Enable AI Boats'}
            </button>
            <button
              type="button"
              className="start-sequence"
              onClick={() => network.resetRace()}
            >
              Restart Race
            </button>
          </div>,
          headerCtaEl,
        )
      : null

  return (
    <div className="live-client">
      {headerPortal}
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
      {idleSuspended && (
        <div className="username-gate">
          <div className="username-card">
            <h2>You went idle</h2>
            <p>We paused your connection so someone else can host while you’re away.</p>
            <button type="button" onClick={resumeFromIdle}>
              Rejoin Race
            </button>
          </div>
        </div>
      )}
      <div className="live-main">
        <div className="stage-shell">
          <PixiStage />
          <OnScreenControls />
        </div>
        <aside className="hud-panel">
        <h2>Race Feed</h2>
        <p>
          Race{' '}
          <strong>{appEnv.netTransport === 'colyseus' ? appEnv.colyseusRoomId : appEnv.raceId}</strong>{' '}
          as <strong>{role}</strong>
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
        <div className="leaderboard-panel">
          <h3>Leaderboard</h3>
          {race.leaderboard.length ? (
            <ol>
              {race.leaderboard.slice(0, 6).map((boatId, index) => {
                const boat = race.boats[boatId]
                if (!boat) return null
                const lap = Math.min(boat.lap ?? 0, race.lapsToFinish)
                const finished = boat.finished || lap >= race.lapsToFinish
                return (
                  <li key={boatId}>
                    <span className="leaderboard-position">{index + 1}.</span>
                    <span className="leaderboard-name">{boat.name}</span>
                    <span className="leaderboard-meta">
                      {finished ? 'Finished' : `Lap ${lap}/${race.lapsToFinish}`}
                    </span>
                  </li>
                )
              })}
            </ol>
          ) : (
            <p>No leaderboard data yet.</p>
          )}
        </div>
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
        {race.phase === 'prestart' && !race.countdownArmed && <RosterPanel role={role} />}
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

