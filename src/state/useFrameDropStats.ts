import { useEffect, useMemo, useState } from 'react'

type Options = {
  /** If false, disables the rAF sampling loop and returns zeros/defaults. */
  enabled?: boolean
  /**
   * Rolling time window used for "dropped frames %" calculation.
   * Default: 2000ms
   */
  windowMs?: number
  /**
   * How often the hook updates React state (and therefore the UI).
   * Default: 250ms
   */
  updateIntervalMs?: number
  /**
   * Target FPS used to define what counts as a "dropped" frame.
   * Default: 60
   */
  targetFps?: number
}

export function useFrameDropStats(options?: Options) {
  const enabled = options?.enabled ?? true
  const windowDurationMs = options?.windowMs ?? 2000
  const updateIntervalDurationMs = options?.updateIntervalMs ?? 250
  const targetFps = options?.targetFps ?? 60
  // If a frame takes longer than this, it likely missed at least one vsync at the target FPS.
  // Example: at 60 FPS, budget is ~16.67ms. A 20ms frame is counted as a "dropped" frame.
  // 1.1 * 1000 / 60 = 18.33ms
  const dropThresholdMs = 1100 / targetFps

  const [droppedPct, setDroppedPct] = useState(0)
  const [fps, setFps] = useState(0)

  useEffect(() => {
    if (!enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset stats when disabled
      setDroppedPct(0)
      setFps(0)
      return
    }
    if (
      typeof performance === 'undefined' ||
      typeof requestAnimationFrame === 'undefined'
    )
      return

    // We sample animation frames using rAF and keep a rolling window of recent frame times.
    // This is independent of Pixi's ticker; it measures actual browser frame cadence.
    let lastTimestampMs = performance.now()
    let animationFrameId = 0

    // Rolling window samples: enough to compute "dropped %", but bounded by time.
    const samples: {
      timestampMs: number
      dropped: boolean
    }[] = []
    let head = 0
    let droppedFrameCount = 0

    // A short-term accumulator for FPS. We reset it on each UI update so it reacts quickly.
    let deltaTimeSumMs = 0
    let deltaTimeCount = 0

    const pushSample = (timestampMs: number, deltaTimeMs: number) => {
      const dropped = deltaTimeMs > dropThresholdMs
      samples.push({ timestampMs, dropped })
      if (dropped) droppedFrameCount += 1
      deltaTimeSumMs += deltaTimeMs
      deltaTimeCount += 1

      // Evict old samples that fall outside the rolling window.
      const cutoffTimestampMs = timestampMs - windowDurationMs
      while (head < samples.length && samples[head].timestampMs < cutoffTimestampMs) {
        const removed = samples[head]
        if (removed.dropped) droppedFrameCount -= 1
        head += 1
      }
      if (head > 1000) {
        samples.splice(0, head)
        head = 0
      }
    }

    const onFrame = (ts: number) => {
      const deltaTimeMs = ts - lastTimestampMs
      lastTimestampMs = ts
      if (Number.isFinite(deltaTimeMs) && deltaTimeMs > 0) {
        pushSample(ts, deltaTimeMs)
      }
      animationFrameId = requestAnimationFrame(onFrame)
    }

    animationFrameId = requestAnimationFrame(onFrame)

    // UI update loop: decouples per-frame sampling from React state updates.
    // This keeps React render frequency low while still showing "real-time" stats.
    const updateIntervalId = window.setInterval(() => {
      const sampleCount = samples.length - head
      if (!sampleCount) return

      // Dropped frame % uses a rolling window to avoid jitter.
      const droppedPercent = (droppedFrameCount / sampleCount) * 100
      setDroppedPct(droppedPercent)

      // FPS is computed over the last update interval for responsiveness.
      const averageDeltaTimeMs = deltaTimeCount > 0 ? deltaTimeSumMs / deltaTimeCount : 0
      setFps(averageDeltaTimeMs > 0 ? 1000 / averageDeltaTimeMs : 0)

      // Reset accumulator so FPS reacts quickly to changes.
      deltaTimeSumMs = 0
      deltaTimeCount = 0
    }, updateIntervalDurationMs)

    return () => {
      cancelAnimationFrame(animationFrameId)
      window.clearInterval(updateIntervalId)
    }
  }, [dropThresholdMs, enabled, updateIntervalDurationMs, windowDurationMs])

  const label = useMemo(() => {
    const fpsText = fps > 0 ? `${fps.toFixed(0)} fps` : '— fps'
    return `Drops ${droppedPct.toFixed(0)}% · ${fpsText}`
  }, [droppedPct, fps])

  return { droppedPct, fps, label }
}
