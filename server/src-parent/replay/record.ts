import type { ChatMessage, RaceEvent, RaceState, ReplayRecording } from '@/types/race'
import { cloneRaceState } from '@/state/factories'

const cloneEvent = (event: RaceEvent) => ({ ...event })

export class ReplayRecorder {
  private recording?: ReplayRecording

  private lastFrameTime = -Infinity

  start(state: RaceState) {
    this.recording = {
      version: 1,
      meta: state.meta,
      frames: [],
      chat: [],
    }
    this.recordFrame(state, [], true)
  }

  recordFrame(state: RaceState, events: RaceEvent[], force = false) {
    if (!this.recording) {
      this.start(state)
    }
    if (!this.recording) return

    if (!force && !this.shouldRecord(state.t, events)) return
    this.lastFrameTime = state.t
    this.recording.frames.push({
      t: state.t,
      state: cloneRaceState(state),
      events: events.map(cloneEvent),
    })
  }

  addChat(message: ChatMessage) {
    this.recording?.chat.push({ ...message })
  }

  getRecording() {
    return this.recording
  }

  reset() {
    this.recording = undefined
    this.lastFrameTime = -Infinity
  }

  private shouldRecord(t: number, events: RaceEvent[]) {
    if (events.length) return true
    return t - this.lastFrameTime >= 1
  }
}

