import { ReplayRecorder } from './record'
import { saveRecording } from './storage'

export const replayRecorder = new ReplayRecorder()

export const persistReplay = async () => {
  const recording = replayRecorder.getRecording()
  if (!recording) {
    return { ok: false as const, error: 'no_recording' as const }
  }
  await saveRecording(recording)
  return { ok: true as const, raceId: recording.meta.raceId }
}

