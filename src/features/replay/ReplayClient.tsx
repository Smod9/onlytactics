import { useEffect, useMemo, useRef, useState } from 'react'
import { PixiStage } from '@/view/PixiStage'
import type { CameraMode } from '@/view/scene/RaceScene'
import {
  listReplayIndex,
  loadRecording,
  refreshReplayIndex,
  type ReplayIndexEntry,
} from '@/replay/storage'
import type { ReplayFrame, ReplayRecording } from '@/types/race'
import { raceStore } from '@/state/raceStore'
import { cloneRaceState } from '@/state/factories'

const findFrame = (frames: ReplayFrame[], t: number) => {
  let candidate = frames[0]
  for (const frame of frames) {
    if (frame.t <= t) {
      candidate = frame
    } else {
      break
    }
  }
  return candidate
}

export const ReplayClient = () => {
  const [index, setIndex] = useState<ReplayIndexEntry[]>(() => listReplayIndex())
  const [selected, setSelected] = useState<string | null>(null)
  const [recording, setRecording] = useState<ReplayRecording | null>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [cameraMode, setCameraMode] = useState<CameraMode>('birdseye')
  const [followBoatId, setFollowBoatId] = useState<string | null>(null)
  const duration = recording?.frames.at(-1)?.t ?? 0

  const handleSelect = async (raceId: string) => {
    setSelected(raceId)
    setPlaying(false)
    setStatus('Loading replay…')
    try {
      const data = await loadRecording(raceId)
      if (!data) {
        setStatus('Replay not found.')
        return
      }
      setRecording(data)
      setIndex(listReplayIndex())
      const firstFrame = data.frames[0]
      if (firstFrame) {
        raceStore.reset(cloneRaceState(firstFrame.state))
        raceStore.setEvents(firstFrame.events)
        setTime(firstFrame.t)
      }
      setStatus(null)
    } catch {
      setStatus('Failed to load replay.')
    }
  }

  useEffect(() => {
    void (async () => {
      const merged = await refreshReplayIndex()
      setIndex(merged)
    })()
  }, [])

  useEffect(() => {
    if (!playing || !recording) return
    let frameId: number
    let lastTime = performance.now()
    const step = () => {
      const now = performance.now()
      const delta = (now - lastTime) / 1000
      lastTime = now
      setTime((prev) => {
        const next = Math.min(prev + delta, duration)
        if (next >= duration) {
          setPlaying(false)
        }
        return next
      })
      frameId = requestAnimationFrame(step)
    }
    frameId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frameId)
  }, [playing, duration, recording])

  useEffect(() => {
    if (!recording) return
    const frame = findFrame(recording.frames, time)
    raceStore.setState(cloneRaceState(frame.state))
    raceStore.setEvents(frame.events)
  }, [recording, time])

  const recordingRef = useRef(recording)
  recordingRef.current = recording
  const followBoatIdRef = useRef(followBoatId)
  followBoatIdRef.current = followBoatId
  const timeRef = useRef(time)
  timeRef.current = time

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const rec = recordingRef.current
      if (e.code === 'Space' && rec) {
        e.preventDefault()
        setPlaying((v) => !v)
      } else if ((e.code === 'Escape' || e.code === 'KeyZ') && followBoatIdRef.current) {
        setFollowBoatId(null)
      } else if (e.code === 'ArrowRight' && rec) {
        e.preventDefault()
        const next = rec.frames.find((f) => f.t > timeRef.current && f.events.length)
        if (next) setTime(next.t)
      } else if (e.code === 'ArrowLeft' && rec) {
        e.preventDefault()
        let prev: typeof rec.frames[number] | null = null
        for (const f of rec.frames) {
          if (f.t >= timeRef.current) break
          if (f.events.length) prev = f
        }
        if (prev) setTime(prev.t)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const nextEventTime = useMemo(() => {
    if (!recording) return null
    const future = recording.frames.find((frame) => frame.t > time && frame.events.length)
    return future?.t ?? null
  }, [recording, time])

  const currentFrame = useMemo(() => {
    if (!recording) return null
    return findFrame(recording.frames, time)
  }, [recording, time])

  const effectiveCameraMode: CameraMode = followBoatId ? 'follow' : cameraMode
  const followBoatName = followBoatId && currentFrame
    ? currentFrame.state.boats[followBoatId]?.name
    : null

  return (
    <div className="replay-client">
      <aside className="replay-sidebar">
        <h2>Saved Races</h2>
        <button
          type="button"
          onClick={async () => {
            const merged = await refreshReplayIndex()
            setIndex(merged)
          }}
        >
          Refresh
        </button>
        <div className="replay-list">
          {index.map((entry) => (
            <button
              type="button"
              key={entry.raceId}
              className={entry.raceId === selected ? 'active' : ''}
              onClick={() => {
                void handleSelect(entry.raceId)
              }}
            >
              <span>{entry.courseName}</span>
              <small>{new Date(entry.savedAt).toLocaleString()}</small>
            </button>
          ))}
          {!index.length && <p>No recordings saved yet.</p>}
        </div>
      </aside>
      <section className="replay-stage">
        <PixiStage
          cameraMode={effectiveCameraMode}
          followBoatId={followBoatId}
          scrollZoom
          onPickBoat={(boatId) => {
            if (boatId) {
              setFollowBoatId(boatId)
            }
          }}
        />
        <div className="replay-controls">
          <div className="playback-controls">
            <button
              type="button"
              className="playback-btn"
              disabled={!recording}
              onClick={() => setPlaying((value) => !value)}
            >
              {playing ? '⏸ Pause' : '▶ Play'}
            </button>
            <button
              type="button"
              className="playback-btn"
              disabled={!recording || nextEventTime === null}
              onClick={() => {
                if (nextEventTime !== null) {
                  setTime(nextEventTime)
                }
              }}
            >
              ⏭ Next Event
            </button>
            <button
              type="button"
              className="playback-btn"
              onClick={() => {
                if (followBoatId) {
                  setFollowBoatId(null)
                } else {
                  setCameraMode((m) => (m === 'follow' ? 'birdseye' : 'follow'))
                }
              }}
            >
              {followBoatId
                ? `✕ Unfollow ${followBoatName ?? 'boat'}`
                : cameraMode === 'birdseye'
                  ? '🔍 Birdseye'
                  : '🚤 Follow'}
            </button>
            <input
              type="range"
              className="playback-scrubber"
              min={recording?.frames[0]?.t ?? 0}
              max={duration || 1}
              step={0.5}
              value={time}
              onChange={(event) => {
                setPlaying(false)
                setTime(Number(event.target.value))
              }}
              disabled={!recording}
            />
            <span className="playback-time">
              {time.toFixed(1)}s / {duration.toFixed(1)}s
            </span>
          </div>
          {!followBoatId && recording && (
            <div className="replay-hint">Click a boat to follow it. Scroll to zoom.</div>
          )}
        </div>
        {status && <p className="replay-status">{status}</p>}
      </section>
    </div>
  )
}
