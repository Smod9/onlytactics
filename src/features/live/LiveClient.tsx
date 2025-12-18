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
import { TacticianPopout } from './TacticianPopout'
import { ProgressStepper } from './ProgressStepper'
import type { RaceRole } from '@/types/race'
import { OnScreenControls } from './OnScreenControls'
import { useRoster } from '@/state/rosterStore'
import type { CameraMode } from '@/view/scene/RaceScene'
import { ZoomIcon } from '@/view/icons'
import { apparentWindAngleSigned } from '@/logic/physics'

const isInteractiveElement = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    target.isContentEditable ||
    target.getAttribute('role') === 'textbox'
  )
}

export const LiveClient = () => {
  const events = useRaceEvents()
  const race = useRaceState()
  const [network] = useState(() => new GameNetwork())
  const [showDebug, setShowDebug] = useState(false)
  const [nameEntry, setNameEntry] = useState(identity.clientName ?? '')
  const [needsName, setNeedsName] = useState(!identity.clientName)
  const [idleSuspended, setIdleSuspended] = useState(false)
  const [cameraMode, setCameraMode] = useState<CameraMode>('follow')
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

    let idleTimer: number | undefined

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
  }, [idleSuspended, needsName, network])

  const role = useSyncExternalStore<RaceRole>(
    (listener) => network.onRoleChange(listener),
    () => network.getRole(),
    () => 'spectator',
  )

  useTacticianControls(network, role)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleKey = (event: KeyboardEvent) => {
      if (isInteractiveElement(event.target)) return
      if ((event.code ?? event.key) !== 'KeyZ') return
      if (event.repeat) {
        event.preventDefault()
        return
      }
      setCameraMode((mode) => (mode === 'follow' ? 'birdseye' : 'follow'))
      event.preventDefault()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const playerWakeFactor = playerBoat?.wakeFactor ?? 1
  const wakeActive = playerWakeFactor < 0.995
  const wakeSlowPercent = Math.max(1, Math.round((1 - playerWakeFactor) * 100))

  const formatCountdownLabel = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    const minutes = seconds / 60
    return Number.isInteger(minutes) ? `${minutes}min` : `${minutes.toFixed(1)}min`
  }

  const roster = useRoster()
  const rosterHostName =
    roster.hostId && roster.entries.find((entry) => entry.clientId === roster.hostId)?.name

  const countdownLabel = formatCountdownLabel(appEnv.countdownSeconds)
  const showStartOverlay =
    role === 'host' && race.phase === 'prestart' && !race.countdownArmed
  const hostBoat = race.hostBoatId
    ? race.boats[race.hostBoatId]
    : race.hostId
      ? race.boats[race.hostId]
      : undefined
  const hostName =
    hostBoat?.name ??
    rosterHostName ??
    (role === 'host'
      ? identity.clientName ?? 'You'
      : race.hostId
        ? `Host (${race.hostId.slice(0, 6)})`
        : 'Host')
  const hostNameDisplay = hostName ?? 'Host'
  const showWaitingOverlay =
    role !== 'host' && race.phase === 'prestart' && !race.countdownArmed

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
            <div style={{ display: 'none' }}>
              <ReplaySaveButton />
            </div>
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
      <ProgressStepper boat={playerBoat} />
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
          {showStartOverlay && (
            <div className="start-sequence-overlay">
              <div className="start-sequence-card">
                <h2>🛥️ Yay! You are the Race Comittee!</h2>
                <p> Click to start the race with a {countdownLabel} sequence.</p>
                <button
                  type="button"
                  className="start-sequence"
                  onClick={() => network.armCountdown(appEnv.countdownSeconds)}
                >
                  Start {countdownLabel} Sequence
                </button>
              </div>
            </div>
          )}
          {showWaitingOverlay && (
            <div className="start-sequence-overlay">
              <div className="start-sequence-card">
                <h2>Waiting for the start</h2>
                <p>Waiting for Race Comittee ({hostNameDisplay}) to start the race.</p>
              </div>
            </div>
          )}
          {playerBoat && (
            <>
              <div className="top-left-hud">
                <div className={`speed-heading-overlay ${wakeActive ? 'wake-active' : ''}`}>
                  {(() => {
                    const twaSigned = apparentWindAngleSigned(playerBoat.headingDeg, race.wind.directionDeg)
                    const isStarboardTack = twaSigned >= 0
                    const absTwa = Math.abs(twaSigned)

                    // Boat panel: keep AWA label, but show VMG mode status instead of degrees.
                    const boatWindValue = playerBoat.vmgMode ? 'VMG' : `${absTwa.toFixed(0)}°`

                    // Wind panel: mirror the same shift labeling used in the Pixi HUD.
                    const shift = race.wind.directionDeg - race.baselineWindDeg
                    const shiftText =
                      Math.abs(shift) < 0.5 ? 'ON' : shift > 0 ? `${shift.toFixed(1)}° R` : `${shift.toFixed(1)}° L`

                    return (
                      <>
                        <div className="hud-section">
                          <div className="hud-section-header">Boat</div>
                          <div className="hud-grid hud-grid-boat">
                            <div className="hud-metric hud-metric-speed">
                              <span className="hud-label">SPD</span>
                              <span className="hud-value">{playerBoat.speed.toFixed(2)} kts</span>
                            </div>
                            <div className="hud-metric hud-metric-heading">
                              <span className="hud-label">HDG</span>
                              <span className="hud-value">{playerBoat.headingDeg.toFixed(0)}°</span>
                            </div>
                            <div className="hud-metric hud-metric-wind">
                              <span className="hud-label">AWA</span>
                              <span className="hud-value">{boatWindValue}</span>
                            </div>
                            <div className="hud-metric hud-metric-tack">
                              <span className="hud-label">TACK</span>
                              <span className={`hud-value ${isStarboardTack ? 'tack-stbd' : 'tack-port'}`}>
                                {isStarboardTack ? 'STBD' : 'PORT'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="hud-section">
                          <div className="hud-section-header">Wind</div>
                          <div className="hud-grid hud-grid-wind">
                            <div className="hud-metric hud-metric-winddir">
                              <span className="hud-label">DIR</span>
                              <span className="hud-value">{race.wind.directionDeg.toFixed(0)}°</span>
                            </div>
                            <div className="hud-metric hud-metric-windspd">
                              <span className="hud-label">SPD</span>
                              <span className="hud-value">{race.wind.speed.toFixed(1)} kts</span>
                            </div>
                            <div className="hud-metric hud-metric-windshift hud-metric--span2">
                              <span className="hud-label">SHIFT</span>
                              <span className="hud-value">{shiftText}</span>
                            </div>
                          </div>
                        </div>
                      </>
                    )
                  })()}
                  {wakeActive && (
                    <div className="wake-indicator">WS -{wakeSlowPercent}%</div>
                  )}
                </div>

                {(() => {
                  const shift = race.wind.directionDeg - race.baselineWindDeg
                  const shiftColor = shift > 1 ? '#ff8f70' : shift < -1 ? '#70d6ff' : '#ffffff'
                  const downwindDeg = ((race.wind.directionDeg + 180) % 360 + 360) % 360
                  return (
                    <div className="wind-arrow-overlay" aria-label="Wind direction (downwind arrow)">
                      <svg
                        width="74"
                        height="74"
                        viewBox="0 0 80 80"
                        className="wind-arrow-svg"
                        style={{ transform: `rotate(${downwindDeg}deg)` }}
                        role="img"
                        aria-hidden="true"
                      >
                        <line x1="40" y1="54" x2="40" y2="18" stroke={shiftColor} strokeWidth="3" />
                        <polygon points="40,12 48,26 32,26" fill={shiftColor} />
                      </svg>
                    </div>
                  )
                })()}
              </div>
              {playerBoat.penalties > 0 && (
                <div className="spin-overlay">
                  <button
                    type="button"
                    className="spin-button"
                    onClick={() => network.requestSpin()}
                    title="Perform a 360° spin (also clears one penalty if you have any)"
                  >
                    Spin to clear your penalty (360)
                  </button>
                </div>
              )}
              <div className="hud-stack">
                <div className="hud-top-row">
                  <div className="hud-camera-toggle">
                    <button
                      type="button"
                      className="camera-toggle"
                      onClick={() => setCameraMode((mode) => (mode === 'follow' ? 'birdseye' : 'follow'))}
                      title="Toggle camera mode (Z)"
                    >
                      <span className="camera-toggle-icon" aria-hidden="true">
                        <ZoomIcon />
                      </span>
                      <span className="camera-toggle-text">
                        {cameraMode === 'follow' ? 'Birdseye (Z)' : 'Follow (Z)'}
                      </span>
                    </button>
                  </div>
                  <div className="leaderboard-overlay">
                    <div className="leaderboard-panel">
                      <h3>Leaderboard</h3>
                      {race.leaderboard.length ? (
                        <ol>
                          {race.leaderboard.slice(0, 6).map((boatId, index) => {
                            const boat = race.boats[boatId]
                            if (!boat) return null
                            const isHost =
                              (role === 'host' && boatId === identity.boatId) ||
                              boatId === race.hostId ||
                              boatId === race.hostBoatId
                            const internalLap = Math.min(boat.lap ?? 0, race.lapsToFinish)
                            const finished = boat.finished || internalLap >= race.lapsToFinish
                            const atLine = boat.nextMarkIndex === 1 || boat.nextMarkIndex === 2
                            const onFinalLap = internalLap >= race.lapsToFinish - 1
                            const displayLap = internalLap + 1
                            const medal =
                              finished && index === 0
                                ? '🥇'
                                : finished && index === 1
                                  ? '🥈'
                                  : finished && index === 2
                                    ? '🥉'
                                    : ''

                            let statusText = `Lap ${displayLap}/${race.lapsToFinish}`
                            if (finished) {
                              statusText = 'Finished'
                            } else if (atLine && !onFinalLap) {
                              statusText = 'Pre-start'
                            } else if (atLine && onFinalLap) {
                              statusText = 'Finish'
                            }

                            return (
                              <li key={boatId}>
                                <span className="leaderboard-position">{index + 1}.</span>
                                <span className="leaderboard-name">
                                  {medal && <span className="leaderboard-medal">{medal} </span>}
                                  {boat.name}
                                  {isHost && ' (RC)'}
                                </span>
                                <span className="leaderboard-meta">{statusText}</span>
                              </li>
                            )
                          })}
                        </ol>
                      ) : (
                        <p>No leaderboard data yet.</p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="events-overlay">
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
                </div>
              </div>
            </>
          )}
          <PixiStage cameraMode={cameraMode} />
          <OnScreenControls
            cameraMode={cameraMode}
            onToggleCamera={() => setCameraMode((mode) => (mode === 'follow' ? 'birdseye' : 'follow'))}
          />
          <ChatPanel network={network} />
        </div>
      </div>
      <button
        type="button"
        className="debug-toggle"
        onClick={() => setShowDebug((value) => !value)}
      >
        {showDebug ? 'Hide Debug' : 'Show Debug'}
      </button>
      <TacticianPopout />
      {showDebug && (
        <div className="debug-dock">
          <DebugPanel onClose={() => setShowDebug(false)} network={network} />
        </div>
      )}
    </div>
  )
}


