import { useEffect, useMemo, useState } from 'react'
import { PixiStage } from '@/view/PixiStage'
import { listReplayIndex, loadRecording, type ReplayIndexEntry } from '@/replay/storage'
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

const chatTime = (recording: ReplayRecording, ts: number) =>
  (ts - recording.meta.createdAt) / 1000

export const ReplayClient = () => {
  const [index, setIndex] = useState<ReplayIndexEntry[]>(() => listReplayIndex())
  const [selected, setSelected] = useState<string | null>(null)
  const [recording, setRecording] = useState<ReplayRecording | null>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
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

  const nextEventTime = useMemo(() => {
    if (!recording) return null
    const future = recording.frames.find(
      (frame) => frame.t > time && frame.events.length,
    )
    return future?.t ?? null
  }, [recording, time])

  const visibleChat = useMemo(() => {
    if (!recording) return []
    return recording.chat.filter(
      (message) =>
        chatTime(recording, message.ts) <= time &&
        chatTime(recording, message.ts) >= time - 20,
    )
  }, [recording, time])

  return (
    <div className="replay-client">
      <aside className="replay-sidebar">
        <h2>Saved Races</h2>
        <button type="button" onClick={() => setIndex(listReplayIndex())}>
          Refresh
        </button>
        <div className="replay-list">
          {index.map((entry) => (
            <button
              type="button"
              key={entry.raceId}
              className={entry.raceId === selected ? 'active' : ''}
              onClick={() => { void handleSelect(entry.raceId) }}
            >
              <span>{entry.courseName}</span>
              <small>{new Date(entry.savedAt).toLocaleString()}</small>
            </button>
          ))}
          {!index.length && <p>No recordings saved yet.</p>}
        </div>
      </aside>
      <section className="replay-stage">
        <PixiStage />
        <div className="replay-controls">
          <div className="playback-controls">
            <button
              type="button"
              disabled={!recording}
              onClick={() => setPlaying((value) => !value)}
            >
              {playing ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              disabled={!recording || nextEventTime === null}
              onClick={() => {
                if (nextEventTime !== null) {
                  setTime(nextEventTime)
                }
              }}
            >
              Next Event
            </button>
            <input
              type="range"
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
            <span>{time.toFixed(1)}s / {duration.toFixed(1)}s</span>
          </div>
          <div className="replay-chat">
            <h3>Chat</h3>
            <div className="replay-chat-log">
              {visibleChat.map((message) => (
                <div key={message.messageId} className={`chat-message chat-${message.senderRole}`}>
                  <span className="chat-author">
                    {message.senderName} ({message.senderRole})
                  </span>
                  <span className="chat-text">{message.text}</span>
                </div>
              ))}
              {!visibleChat.length && <p className="chat-empty">No messages in this window.</p>}
            </div>
          </div>
        </div>
        {status && <p className="replay-status">{status}</p>}
      </section>
    </div>
  )
}

