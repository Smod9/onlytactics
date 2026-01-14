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
import { RosterPanel } from './RosterPanel'
import type { CameraMode } from '@/view/scene/RaceScene'
import { ZoomIcon } from '@/view/icons'
import { angleDiff } from '@/logic/physics'
import { sampleWindSpeed } from '@/logic/windField'
import { useFrameDropStats } from '@/state/useFrameDropStats'

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

type NonHostRole = Exclude<RaceRole, 'host'>

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

export const LiveClient = () => {
  const events = useRaceEvents()
  const race = useRaceState()
  const telemetry = useInputTelemetry()
  const [network] = useState(() => new GameNetwork())
  const [showDebug, setShowDebug] = useState(false)
  const [nameEntry, setNameEntry] = useState(identity.clientName ?? '')
  const [joinRole, setJoinRole] = useState<NonHostRole>('player')
  const [needsName, setNeedsName] = useState(!identity.clientName)
  const [idleSuspended, setIdleSuspended] = useState(false)
  const [cameraMode, setCameraMode] = useState<CameraMode>('follow')
  const [followBoatId, setFollowBoatId] = useState<string | null>(null)
  const [selectedBoatId, setSelectedBoatId] = useState<string | null>(null)
  const [selectedBoatAnchor, setSelectedBoatAnchor] = useState<{
    x: number
    y: number
  } | null>(null)
  const stageShellRef = useRef<HTMLDivElement>(null)
  const [showUserModal, setShowUserModal] = useState(false)
  const [userNameDraft, setUserNameDraft] = useState(identity.clientName ?? '')
  const [userRoleDraft, setUserRoleDraft] = useState<NonHostRole>('player')
  const [userSettingsError, setUserSettingsError] = useState<string | null>(null)
  const dragRafRef = useRef<number | null>(null)
  const pendingDragRef = useRef<{ boatId: string; pos: { x: number; y: number } } | null>(
    null,
  )
  const headerCtaEl =
    typeof document === 'undefined' ? null : document.getElementById('header-cta-root')

  const playerBoat = useMemo(() => race.boats[identity.boatId], [race.boats])
  const myLatency = telemetry[identity.boatId]
  const selectedBoat = selectedBoatId ? race.boats[selectedBoatId] : undefined
  const selectedProtest: Protest | undefined = selectedBoatId
    ? race.protests?.[selectedBoatId]
    : undefined
  const iAmProtestor = Boolean(
    selectedProtest && selectedProtest.protestorBoatId === identity.boatId,
  )

  useEffect(() => {
    void startRosterWatcher()
  }, [])

  // Throttle leaderboard speed updates to avoid noisy UI churn.
  // We update roughly once per 10 sim/store updates (tracked by `race.t` changes),
  // but also refresh immediately for newly-seen boats.
  const raceRef = useRef(race)
  raceRef.current = race
  const leaderboardSpeedsRef = useRef<Record<string, string>>({})
  const [leaderboardSpeeds, setLeaderboardSpeeds] = useState<Record<string, string>>({})
  const leaderboardTickRef = useRef(0)
  const lastRaceTRef = useRef<number | null>(null)
  useEffect(() => {
    const snapshot = raceRef.current
    if (lastRaceTRef.current === snapshot.t) return
    lastRaceTRef.current = snapshot.t
    leaderboardTickRef.current += 1

    const existing = leaderboardSpeedsRef.current
    const hasMissing = snapshot.leaderboard.some((boatId) => {
      if (existing[boatId]) return false
      return Boolean(snapshot.boats[boatId])
    })

    if (!hasMissing && leaderboardTickRef.current % 10 !== 0) return

    const next: Record<string, string> = { ...existing }
    snapshot.leaderboard.forEach((boatId) => {
      const boat = snapshot.boats[boatId]
      if (!boat) return
      next[boatId] = `${boat.speed.toFixed(2)} kts`
    })
    leaderboardSpeedsRef.current = next
    setLeaderboardSpeeds(next)
  }, [race.t])

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
  const iAmProtested = Boolean(canShowBoatInfo && race.protests?.[identity.boatId])

  const effectiveCameraMode: CameraMode =
    role === 'spectator' || role === 'judge' || role === 'god'
      ? followBoatId
        ? 'follow'
        : 'birdseye'
      : cameraMode

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
    roster.hostId &&
    roster.entries.find((entry) => entry.clientId === roster.hostId)?.name

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
      ? (identity.clientName ?? 'You')
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
    void network.switchRole(joinRole)
  }

  const resumeFromIdle = () => {
    if (!idleSuspended) return
    setIdleSuspended(false)
    void network.start()
  }

  const openUserModal = () => {
    setUserSettingsError(null)
    setUserNameDraft(identity.clientName ?? '')
    setUserRoleDraft(role === 'host' ? 'player' : (role as NonHostRole))
    setShowUserModal(true)
  }

  const saveUserSettings = async () => {
    const trimmed = userNameDraft.trim()
    if (!trimmed) {
      setUserSettingsError('Please enter a name.')
      return
    }

    const previousName = identity.clientName ?? ''
    const previousNonHostRole: NonHostRole =
      role === 'host' ? 'player' : (role as NonHostRole)
    const nameChanged = trimmed !== previousName
    const roleChanged = userRoleDraft !== previousNonHostRole

    setUserSettingsError(null)
    setShowUserModal(false)

    if (nameChanged) {
      setClientName(trimmed)
      setNameEntry(trimmed)
    }

    if (roleChanged) {
      await network.switchRole(userRoleDraft)
      return
    }

    if (nameChanged) {
      // In Colyseus mode, the server uses join options (including name) at connect time.
      // Restart the connection to ensure the server picks up updated identity.
      network.stop()
      await network.start()
    }
  }

  const headerPortal = headerCtaEl
    ? createPortal(
        <div
          className="header-controls"
          style={{ display: 'flex', gap: 10, alignItems: 'center' }}
        >
          <div style={{ display: 'none' }}>
            <ReplaySaveButton />
          </div>
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
          {(role === 'host' || role === 'god') && (
            <button
              type="button"
              className="start-sequence"
              onClick={() => network.setPaused(!race.paused)}
              title="Pause/resume race"
            >
              {race.paused ? 'Resume Race' : 'Pause Race'}
            </button>
          )}

          {/* Always keep the user menu at the far right of the header controls. */}
          {!needsName && (
            <button
              type="button"
              className="header-name"
              onClick={openUserModal}
              title="Menu"
              aria-label="Open menu"
              style={{ marginLeft: 'auto' }}
            >
              <span aria-hidden="true" style={{ opacity: 0.9 }}>
                👤
              </span>
              <span className="header-name-text">Menu</span>
              <span aria-hidden="true" style={{ opacity: 0.75 }}>
                ▾
              </span>
            </button>
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
              <div className="user-menu-row">
                <span className="user-menu-label">Role</span>
                <span className="user-menu-field">
                  <select
                    value={joinRole}
                    onChange={(event) => setJoinRole(event.target.value as NonHostRole)}
                    aria-label="Select role"
                    className="user-menu-select"
                  >
                    <option value="player">Player</option>
                    <option value="spectator">Spectator</option>
                    <option value="judge">Judge</option>
                    {appEnv.debugHud && <option value="god">God</option>}
                  </select>
                  <span className="user-menu-chevron" aria-hidden="true">
                    ▾
                  </span>
                </span>
              </div>
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
                <div
                  className="event-item"
                  style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                >
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}
                  >
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
                      {selectedProtest.protestorBoatId === identity.boatId
                        ? ' (filed by you)'
                        : ''}
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
                    {(role === 'player' || role === 'host') &&
                      selectedBoatId &&
                      iAmProtestor && (
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

                    {(role === 'spectator' || role === 'judge' || role === 'god') &&
                      selectedBoatId && (
                        <button
                          type="button"
                          className="start-sequence"
                          onClick={() => {
                            setFollowBoatId(selectedBoatId)
                            setSelectedBoatId(null)
                            setSelectedBoatAnchor(null)
                          }}
                        >
                          Follow
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
            <div className="speed-heading-stack">
              <div
                className={`speed-heading-overlay ${
                  canShowBoatInfo && wakeActive ? 'wake-active' : ''
                }`}
              >
                {iAmProtested && (
                  <span
                    className="protest-sticker"
                    role="img"
                    aria-label="Under protest"
                    title="Under protest"
                  >
                    🚩
                  </span>
                )}
                {(() => {
                  const boat = canShowBoatInfo ? playerBoat : undefined

                  // Wind panel: mirror the same shift labeling used in the Pixi HUD.
                  const rawShift =
                    ((((race.wind.directionDeg - race.baselineWindDeg + 180) % 360) +
                      360) %
                      360) -
                    180
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
                    (((race.baselineWindDeg + rawShift * 1.2) % 360) + 360) % 360
                  const downwindDeg = (((exaggeratedWindDir + 180) % 360) + 360) % 360
                  const windSpeedAtBoat = boat
                    ? sampleWindSpeed(race, boat.pos)
                    : race.wind.speed

                  const boatSection = boat
                    ? (() => {
                        // IMPORTANT: For tack labeling we want the sign of wind relative to heading
                        // (windDir - heading). This matches `RaceScene` and avoids PORT/STBD inversion.
                        const twaSigned = angleDiff(
                          race.wind.directionDeg,
                          boat.headingDeg,
                        )
                        const isStarboardTack = twaSigned >= 0
                        const absTwa = Math.abs(twaSigned)
                        // Boat panel: keep AWA label, but show VMG mode status instead of degrees.
                        const boatWindValue = boat.vmgMode
                          ? 'VMG'
                          : `${absTwa.toFixed(0)}°`
                        return (
                          <div className="hud-section">
                            <div className="hud-section-side-label">Boat</div>
                            <div className="hud-section-body">
                              <div className="hud-grid hud-grid-boat">
                                <div className="hud-metric hud-metric-speed">
                                  <span className="hud-label">SPD</span>
                                  <span className="hud-value">
                                    {boat.speed.toFixed(2)} kts
                                  </span>
                                </div>
                                <div className="hud-metric hud-metric-heading">
                                  <span className="hud-label">HDG</span>
                                  <span className="hud-value">
                                    {boat.headingDeg.toFixed(0)}°
                                  </span>
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
                              <div className="hud-metric hud-metric-windspd">
                                <span className="hud-label">SPD</span>
                                <span className="hud-value">
                                  {windSpeedAtBoat.toFixed(1)} kts
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
              {canShowBoatInfo && playerBoat && playerBoat.penalties > 0 && (
                <div className="spin-under-hud">
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
            </div>
            {(() => {
              const boat = canShowBoatInfo ? playerBoat : undefined
              const showSailStatus = Boolean(
                boat && (boat.blowSails || boat.stallTimer > 0.05),
              )
              const shouldShow = canShowBoatInfo && (wakeActive || showSailStatus)
              if (!shouldShow) return null

              const parts: string[] = []
              if (wakeActive) parts.push(`Wind Shadow -${wakeSlowPercent}%`)
              if (boat?.blowSails) parts.push('Blowing Sails')
              else if (boat && boat.stallTimer > 0.05) parts.push('Luffing')

              return (
                <div
                  className="wake-overlay"
                  aria-label="Slowdown status"
                  title="Slowdown status"
                >
                  <div className="wake-indicator">{parts.join(' • ')}</div>
                </div>
              )
            })()}
          </div>

          <div className="hud-stack">
            <div className="hud-top-row">
              <div className="hud-camera-toggle">
                {role === 'spectator' || role === 'judge' || role === 'god' ? (
                  followBoatId ? (
                    <button
                      type="button"
                      className="camera-toggle"
                      onClick={() => setFollowBoatId(null)}
                      title="Stop following"
                      style={{ pointerEvents: 'auto' }}
                    >
                      <span className="camera-toggle-text">
                        Stop following {race.boats[followBoatId]?.name ?? 'boat'}
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="camera-toggle"
                      disabled
                      title="Birdseye view is locked for spectators/judges"
                    >
                      <span className="camera-toggle-icon" aria-hidden="true">
                        <ZoomIcon />
                      </span>
                      <span className="camera-toggle-text">Birdseye</span>
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    className="camera-toggle"
                    onClick={() =>
                      setCameraMode((mode) => (mode === 'follow' ? 'birdseye' : 'follow'))
                    }
                    title="Toggle camera mode (Z)"
                  >
                    <span className="camera-toggle-icon" aria-hidden="true">
                      <ZoomIcon />
                    </span>
                    <span className="camera-toggle-text">
                      {effectiveCameraMode === 'follow' ? 'Birdseye (Z)' : 'Follow (Z)'}
                    </span>
                  </button>
                )}
              </div>
              <div className="leaderboard-overlay">
                <div className="leaderboard-panel">
                  <h3>Leaderboard</h3>
                  {race.leaderboard.length ? (
                    <ol>
                      {race.leaderboard.map((boatId, index) => {
                        const boat = race.boats[boatId]
                        if (!boat) return null
                        const protested = Boolean(race.protests?.[boatId])
                        const isHost =
                          (role === 'host' && boatId === identity.boatId) ||
                          boatId === race.hostId ||
                          boatId === race.hostBoatId
                        const internalLap = Math.min(boat.lap ?? 0, race.lapsToFinish)
                        const finished = boat.finished || internalLap >= race.lapsToFinish
                        const atLine =
                          boat.nextMarkIndex === 1 || boat.nextMarkIndex === 2
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
                        const pickle =
                          finished &&
                          race.leaderboard.length > 1 &&
                          index === race.leaderboard.length - 1
                            ? '🥒'
                            : ''

                        let statusText = `Lap ${displayLap}/${race.lapsToFinish}`
                        if (finished) {
                          statusText = 'Finished'
                        } else if (atLine && !onFinalLap) {
                          statusText = 'Pre-start'
                        } else if (atLine && onFinalLap) {
                          statusText = 'Finish'
                        }

                        const speedText = leaderboardSpeeds[boatId] ?? '—'

                        return (
                          <li key={boatId}>
                            <span className="leaderboard-position">{index + 1}.</span>
                            <span className="leaderboard-name">
                              <span className="leaderboard-badges" aria-hidden="true">
                                <span className="leaderboard-badge">{medal || ''}</span>
                                <span className="leaderboard-badge">{pickle || ''}</span>
                                <span className="leaderboard-badge">
                                  {protested ? '🚩' : ''}
                                </span>
                              </span>
                              <span className="leaderboard-name-text">{boat.name}</span>
                              {isHost && ' (RC)'}
                            </span>
                            <span className="leaderboard-meta">
                              <span className="leaderboard-meta-top">{statusText}</span>
                              <span className="leaderboard-meta-bottom">{speedText}</span>
                            </span>
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
                  .map((event, index) =>
                    (() => {
                      const isProtestEvent = /protest/i.test(event.message)
                      const targetBoatId = event.boats?.length
                        ? event.boats[event.boats.length - 1]
                        : undefined
                      const hasActiveProtest = Boolean(
                        targetBoatId && race.protests?.[targetBoatId],
                      )
                      const canJumpToProtest =
                        role === 'judge' &&
                        isProtestEvent &&
                        Boolean(targetBoatId) &&
                        hasActiveProtest
                      const headerKind = isProtestEvent
                        ? 'Protest'
                        : event.kind.replaceAll('_', ' ')
                      const showRuleSuffix = Boolean(
                        event.ruleId && event.ruleId !== 'other',
                      )

                      return (
                        <div
                          key={event.eventId}
                          className={`event-item ${canJumpToProtest ? 'clickable' : ''}`}
                          onClick={() => {
                            if (!canJumpToProtest || !targetBoatId) return
                            setSelectedBoatId(targetBoatId)
                            setSelectedBoatAnchor(null)
                          }}
                          role={canJumpToProtest ? 'button' : undefined}
                          tabIndex={canJumpToProtest ? 0 : undefined}
                          title={canJumpToProtest ? 'Open protest for review' : undefined}
                        >
                          <span className="event-kind">
                            #{events.length - index}{' '}
                            {isProtestEvent ? (
                              <>
                                <span aria-hidden="true">🚩</span> {headerKind}
                              </>
                            ) : (
                              headerKind
                            )}
                            {showRuleSuffix ? ` (Rule ${event.ruleId})` : ''}
                            {canJumpToProtest ? ' — tap to review' : ''}
                          </span>
                          <span className="event-message">{event.message}</span>
                        </div>
                      )
                    })(),
                  )}
                {!events.length && <p>No rule events yet.</p>}
              </div>
              <RosterPanel />
            </div>
          </div>
          <PixiStage
            cameraMode={effectiveCameraMode}
            followBoatId={effectiveCameraMode === 'follow' ? followBoatId : null}
            godDragEnabled={role === 'god' && appEnv.debugHud && Boolean(race.paused)}
            onDragBoat={(boatId, pos) => {
              if (role !== 'god' || !appEnv.debugHud || !race.paused) return
              pendingDragRef.current = { boatId, pos }
              if (dragRafRef.current != null) return
              dragRafRef.current = window.requestAnimationFrame(() => {
                dragRafRef.current = null
                const pending = pendingDragRef.current
                if (!pending) return
                pendingDragRef.current = null
                network.debugSetBoatPosition(pending.boatId, pending.pos)
              })
            }}
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
          {(role === 'host' || role === 'player') && (
            <OnScreenControls
              cameraMode={effectiveCameraMode}
              onToggleCamera={() =>
                setCameraMode((mode) => (mode === 'follow' ? 'birdseye' : 'follow'))
              }
            />
          )}
          <ChatPanel network={network} />
        </div>
      </div>
      {role !== 'spectator' && (
        <BottomLeftOverlays
          rttText={myLatency ? `RTT ${myLatency.latencyMs.toFixed(0)}ms` : 'RTT —'}
        />
      )}
      <TacticianPopout />
      {showDebug && (
        <div className="debug-dock">
          <DebugPanel onClose={() => setShowDebug(false)} network={network} />
        </div>
      )}
      {showUserModal && (
        <div className="username-gate">
          <div
            className="username-card user-menu-card"
            role="dialog"
            aria-modal="true"
            aria-label="User menu"
          >
            <div className="user-menu-header">
              <div className="user-menu-header-top">
                <div className="user-menu-title">
                  <div>
                    <h2>👤 User Menu</h2>
                  </div>
                </div>
                <button
                  type="button"
                  className="user-menu-close"
                  onClick={() => {
                    setShowUserModal(false)
                    setUserSettingsError(null)
                  }}
                  aria-label="Close user menu"
                  title="Close"
                >
                  ✕
                </button>
              </div>
              <div className="user-menu-social-row" aria-label="Project links">
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
                  href="https://discord.gg/gYPkWPhg"
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
              </div>
            </div>
            <div className="username-form user-menu-form">
              <div className="user-menu-row">
                <span className="user-menu-label">Name</span>
                <span className="user-menu-field">
                  <input
                    value={userNameDraft}
                    onChange={(event) => setUserNameDraft(event.target.value)}
                    placeholder="Callsign or Name"
                    maxLength={24}
                    autoFocus
                    className="user-menu-input"
                  />
                </span>
              </div>
              <div className="user-menu-row">
                <span className="user-menu-label">Role</span>
                <span className="user-menu-field">
                  <select
                    value={userRoleDraft}
                    onChange={(event) =>
                      setUserRoleDraft(event.target.value as NonHostRole)
                    }
                    aria-label="Select role"
                    className="user-menu-select"
                  >
                    <option value="player">Player</option>
                    <option value="spectator">Spectator</option>
                    <option value="judge">Judge</option>
                    {appEnv.debugHud && <option value="god">God</option>}
                  </select>
                  <span className="user-menu-chevron" aria-hidden="true">
                    ▾
                  </span>
                </span>
              </div>
              {userSettingsError && (
                <p className="chat-status" role="alert">
                  {userSettingsError}
                </p>
              )}
              <div className="username-form-actions">
                <button
                  type="button"
                  onClick={() => {
                    setShowUserModal(false)
                    setUserSettingsError(null)
                  }}
                  className="username-form-cancel"
                >
                  Cancel
                </button>
                <button type="button" onClick={() => void saveUserSettings()}>
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const BottomLeftOverlays = ({ rttText }: { rttText: string }) => {
  const showPerf = appEnv.debugHud || appEnv.perfHud
  const { label } = useFrameDropStats({ enabled: showPerf })

  return (
    <div className="bottom-left-overlays" aria-label="Network and performance overlays">
      <div className="rtt-overlay" aria-label="Input RTT">
        {rttText}
      </div>
      {showPerf && (
        <div className="perf-overlay" aria-label="Frame drop percentage">
          {label}
        </div>
      )}
    </div>
  )
}
