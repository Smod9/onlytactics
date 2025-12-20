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
import { useInputTelemetry, useRaceEvents, useRaceState } from '@/state/hooks'
import { GameNetwork } from '@/net/gameNetwork'
import { ChatPanel } from './ChatPanel'
import { ReplaySaveButton } from './ReplaySaveButton'
import { useTacticianControls } from './useTacticianControls'
import { DebugPanel } from './DebugPanel'
import { identity, setClientName } from '@/net/identity'
import { startRosterWatcher } from '@/state/rosterStore'
import { TacticianPopout } from './TacticianPopout'
import { ProgressStepper } from './ProgressStepper'
import type { Protest, RaceRole } from '@/types/race'
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
  const telemetry = useInputTelemetry()
  const [network] = useState(() => new GameNetwork())
  const [showDebug, setShowDebug] = useState(false)
  const [nameEntry, setNameEntry] = useState(identity.clientName ?? '')
  const [needsName, setNeedsName] = useState(!identity.clientName)
  const [idleSuspended, setIdleSuspended] = useState(false)
  const [cameraMode, setCameraMode] = useState<CameraMode>('follow')
  const [selectedBoatId, setSelectedBoatId] = useState<string | null>(null)
  const [selectedBoatAnchor, setSelectedBoatAnchor] = useState<{ x: number; y: number } | null>(
    null,
  )
  const stageShellRef = useRef<HTMLDivElement>(null)
  const headerCtaEl =
    typeof document === 'undefined' ? null : document.getElementById('header-cta-root')

  const playerBoat = useMemo(() => race.boats[identity.boatId], [race.boats])
  const myLatency = telemetry[identity.boatId]
  const selectedBoat = selectedBoatId ? race.boats[selectedBoatId] : undefined
  const selectedProtest: Protest | undefined = selectedBoatId ? race.protests?.[selectedBoatId] : undefined
  const iAmProtestor = Boolean(selectedProtest && selectedProtest.protestorBoatId === identity.boatId)

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

  const canShowBoatInfo = Boolean(playerBoat) && (role === 'player' || role === 'host')

  const effectiveCameraMode: CameraMode =
    role === 'spectator' || role === 'judge' ? 'birdseye' : cameraMode

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleKey = (event: KeyboardEvent) => {
      if (isInteractiveElement(event.target)) return
      const code = event.code || event.key
      if (code !== 'KeyZ' && event.key !== 'z' && event.key !== 'Z') return
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
    headerCtaEl
      ? createPortal(
          <div className="header-controls" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ display: 'none' }}>
              <ReplaySaveButton />
            </div>

            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ opacity: 0.8, fontSize: 12 }}>Role</span>
              <select
                value={role}
                onChange={(event) => {
                  const next = event.target.value as RaceRole
                  if (next === 'host') return
                  void network.switchRole(next)
                }}
                aria-label="Select role"
              >
                <option value="host" disabled>
                  Host
                </option>
                <option value="player">Player</option>
                <option value="spectator">Spectator</option>
                <option value="judge">Judge</option>
              </select>
            </label>

            {role === 'host' && (
              <>
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
              </>
            )}
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
        <div className="stage-shell" ref={stageShellRef}>
          {selectedBoat && (
            <div
              className="events-overlay"
              style={{
                position: 'absolute',
                top: selectedBoatAnchor ? selectedBoatAnchor.y : 12,
                left: selectedBoatAnchor ? selectedBoatAnchor.x : 'auto',
                right: selectedBoatAnchor ? 'auto' : 12,
                bottom: 'auto',
                maxWidth: 320,
                zIndex: 8,
                transform: selectedBoatAnchor ? 'translate(14px, -14px)' : undefined,
              }}
            >
              <div className="event-list" style={{ gap: 8 }}>
                <div className="event-item" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong style={{ fontSize: 13 }}>
                      Selected: {selectedBoat.name}
                      {selectedBoatId === identity.boatId ? ' (You)' : ''}
                    </strong>
                    <button
                      type="button"
                      className="start-sequence"
                      onClick={() => {
                        setSelectedBoatId(null)
                        setSelectedBoatAnchor(null)
                      }}
                      style={{ padding: '0.25rem 0.55rem' }}
                      aria-label="Clear selection"
                      title="Clear selection"
                    >
                      ✕
                    </button>
                  </div>

                  {selectedProtest ? (
                    <div style={{ opacity: 0.9, fontSize: 12 }}>
                      Protest: {selectedProtest.status}
                      {selectedProtest.protestorBoatId === identity.boatId ? ' (filed by you)' : ''}
                    </div>
                  ) : (
                    <div style={{ opacity: 0.75, fontSize: 12 }}>No active protest</div>
                  )}

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {(role === 'player' || role === 'host') &&
                      selectedBoatId &&
                      selectedBoatId !== identity.boatId &&
                      !selectedProtest && (
                        <button
                          type="button"
                          className="start-sequence"
                          onClick={() => {
                            network.fileProtest(selectedBoatId)
                            setSelectedBoatId(null)
                            setSelectedBoatAnchor(null)
                          }}
                        >
                          🚩 Protest
                        </button>
                      )}
                    {(role === 'player' || role === 'host') && selectedBoatId && iAmProtestor && (
                      <button
                        type="button"
                        className="start-sequence"
                        onClick={() => {
                          network.revokeProtest(selectedBoatId)
                          setSelectedBoatId(null)
                          setSelectedBoatAnchor(null)
                        }}
                      >
                        Revoke protest
                      </button>
                    )}
                    {role === 'judge' && selectedBoatId && selectedProtest && (
                      <button
                        type="button"
                        className="start-sequence"
                        onClick={() => {
                          network.judgeClearProtest(selectedBoatId)
                          setSelectedBoatId(null)
                          setSelectedBoatAnchor(null)
                        }}
                      >
                        Clear protest (judge)
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
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
          <div className="speed-heading-row">
            <div
              className={`speed-heading-overlay ${
                canShowBoatInfo && wakeActive ? 'wake-active' : ''
              }`}
            >
              {(() => {
                const boat = canShowBoatInfo ? playerBoat : undefined

                // Wind panel: mirror the same shift labeling used in the Pixi HUD.
                const rawShift =
                  ((race.wind.directionDeg - race.baselineWindDeg + 180) % 360 + 360) % 360 - 180
                const shiftIsOn = Math.abs(rawShift) < 0.5
                const shiftDir = rawShift >= 0 ? 'R' : 'L'
                const shiftMag = Math.abs(rawShift).toFixed(1)
                // Wind shift colors (match prior scheme): orange for R, blue for L, white for 0.
                const shiftColor = shiftIsOn
                  ? '#ffffff'
                  : rawShift >= 0
                    ? '#ff8f70'
                    : '#70d6ff'
                const exaggeratedWindDir =
                  ((race.baselineWindDeg + rawShift * 1.2) % 360 + 360) % 360
                const downwindDeg = ((exaggeratedWindDir + 180) % 360 + 360) % 360

                const boatSection = boat
                  ? (() => {
                      const twaSigned = apparentWindAngleSigned(
                        boat.headingDeg,
                        race.wind.directionDeg,
                      )
                      const isStarboardTack = twaSigned >= 0
                      const absTwa = Math.abs(twaSigned)
                      // Boat panel: keep AWA label, but show VMG mode status instead of degrees.
                      const boatWindValue = boat.vmgMode ? 'VMG' : `${absTwa.toFixed(0)}°`
                      return (
                        <div className="hud-section">
                          <div className="hud-section-side-label">Boat</div>
                          <div className="hud-section-body">
                            <div className="hud-grid hud-grid-boat">
                              <div className="hud-metric hud-metric-speed">
                                <span className="hud-label">SPD</span>
                                <span className="hud-value">{boat.speed.toFixed(2)} kts</span>
                              </div>
                              <div className="hud-metric hud-metric-heading">
                                <span className="hud-label">HDG</span>
                                <span className="hud-value">{boat.headingDeg.toFixed(0)}°</span>
                              </div>
                              <div className="hud-metric hud-metric-wind">
                                <span className="hud-label">AWA</span>
                                <span className="hud-value">{boatWindValue}</span>
                              </div>
                              <div className="hud-metric hud-metric-tack">
                                <span className="hud-label">TACK</span>
                                <span
                                  className={`hud-value ${
                                    isStarboardTack ? 'tack-stbd' : 'tack-port'
                                  }`}
                                >
                                  {isStarboardTack ? 'STBD' : 'PORT'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })()
                  : null

                return (
                  <>
                    {boatSection}
                    <div className="hud-section">
                      <div className="hud-section-side-label">Wind</div>
                      <div className="hud-section-body">
                        <div className="wind-section-grid">
                          <div className="wind-section-numbers">
                            <div className="hud-metric hud-metric-winddir">
                              <span className="hud-label">DIR</span>
                              <span className="hud-value">
                                {race.wind.directionDeg.toFixed(0)}°
                              </span>
                            </div>
                            <div className="hud-metric hud-metric-windspd">
                              <span className="hud-label">SPD</span>
                              <span className="hud-value">
                                {race.wind.speed.toFixed(1)} kts
                              </span>
                            </div>
                            <div className="hud-metric hud-metric-windshift">
                              <span className="hud-label">ANG</span>
                              <span className="hud-value">
                                {shiftIsOn ? (
                                  '0°'
                                ) : (
                                  <span
                                    className="wind-shift-value"
                                    style={{ color: shiftColor }}
                                  >
                                    {shiftMag}° {shiftDir}
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                          <div
                            className="wind-section-arrow"
                            aria-label="Wind direction (downwind arrow)"
                          >
                            <svg
                              width="64"
                              height="64"
                              viewBox="0 0 80 80"
                              className="wind-arrow-svg"
                              style={{ transform: `rotate(${downwindDeg}deg)` }}
                              role="img"
                              aria-hidden="true"
                            >
                              <line
                                x1="40"
                                y1="56"
                                x2="40"
                                y2="18"
                                stroke={shiftColor}
                                strokeWidth="3"
                              />
                              <polygon points="40,12 48,26 32,26" fill={shiftColor} />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )
              })()}
            </div>
            {canShowBoatInfo && wakeActive && (
              <div className="wake-overlay" aria-label="Wake slowdown">
                <div className="wake-indicator">Wind Shadow -{wakeSlowPercent}%</div>
              </div>
            )}
          </div>

          {canShowBoatInfo && playerBoat && playerBoat.penalties > 0 && (
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
                  disabled={role === 'spectator' || role === 'judge'}
                  onClick={() =>
                    setCameraMode((mode) => (mode === 'follow' ? 'birdseye' : 'follow'))
                  }
                  title={
                    role === 'spectator' || role === 'judge'
                      ? 'Birdseye view is locked for spectators/judges'
                      : 'Toggle camera mode (Z)'
                  }
                >
                  <span className="camera-toggle-icon" aria-hidden="true">
                    <ZoomIcon />
                  </span>
                  <span className="camera-toggle-text">
                    {role === 'spectator' || role === 'judge'
                      ? 'Birdseye'
                      : effectiveCameraMode === 'follow'
                        ? 'Birdseye (Z)'
                        : 'Follow (Z)'}
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
                        const protested = Boolean(race.protests?.[boatId])
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
                              <span className="leaderboard-badges" aria-hidden="true">
                                <span className="leaderboard-badge">{medal || ''}</span>
                                <span className="leaderboard-badge">
                                  {protested ? '🚩' : ''}
                                </span>
                              </span>
                              <span className="leaderboard-name-text">{boat.name}</span>
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
          <PixiStage
            cameraMode={effectiveCameraMode}
            onPickBoat={(boatId, anchor) => {
              if ((role === 'player' || role === 'host') && boatId === identity.boatId) {
                setSelectedBoatId(null)
                setSelectedBoatAnchor(null)
                return
              }
              setSelectedBoatId(boatId)
              if (!boatId) {
                setSelectedBoatAnchor(null)
                return
              }
              if (!anchor) {
                setSelectedBoatAnchor(null)
                return
              }
              const shell = stageShellRef.current
              if (!shell) {
                setSelectedBoatAnchor(anchor)
                return
              }
              const w = shell.clientWidth
              const h = shell.clientHeight
              const popupW = 320
              const popupH = 220
              const pad = 12
              const clamped = {
                x: Math.max(pad, Math.min(anchor.x, Math.max(pad, w - popupW - pad))),
                y: Math.max(pad, Math.min(anchor.y, Math.max(pad, h - popupH - pad))),
              }
              setSelectedBoatAnchor(clamped)
            }}
          />
          <OnScreenControls
            cameraMode={effectiveCameraMode}
            onToggleCamera={() => setCameraMode((mode) => (mode === 'follow' ? 'birdseye' : 'follow'))}
          />
          <ChatPanel network={network} />
        </div>
      </div>
      {role !== 'spectator' && (
        <div className="rtt-overlay" aria-label="Input RTT">
          {myLatency ? `RTT ${myLatency.latencyMs.toFixed(0)}ms` : 'RTT —'}
        </div>
      )}
      <TacticianPopout />
      {showDebug && (
        <div className="debug-dock">
          <DebugPanel onClose={() => setShowDebug(false)} network={network} />
        </div>
      )}
    </div>
  )
}


