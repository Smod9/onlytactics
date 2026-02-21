import type { RaceState, BoatState } from '@/types/race'
import type { ControlUpdate } from '@/net/controlTypes'
import type { RaceStore } from '@/state/raceStore'
import { extractFeatures, featuresToArray } from './features'
import { normalizeDeg, angleDiff } from '@/logic/physics'

type OrtSession = {
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array }>>
}

type OrtModule = {
  InferenceSession: {
    create(path: string): Promise<OrtSession>
  }
  Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown
}

export class MlAiController {
  private session: OrtSession | null = null
  private ort: OrtModule | null = null
  private timer?: ReturnType<typeof setInterval>
  private lastHeading = new Map<string, number>()
  private lastSentAt = new Map<string, number>()

  constructor(
    private store: RaceStore,
    private sendInput: (boatId: string, update: ControlUpdate) => void,
    private requestSpin: (boatId: string) => void,
  ) {}

  async loadModel(modelPath: string): Promise<boolean> {
    try {
      // Dynamic import to avoid compile-time dependency on onnxruntime-node
      const moduleName = 'onnxruntime-node'
      this.ort = await import(/* webpackIgnore: true */ moduleName) as unknown as OrtModule
      this.session = await this.ort.InferenceSession.create(modelPath)
      console.info('[MlAiController] Model loaded:', modelPath)
      return true
    } catch (err) {
      console.warn('[MlAiController] Failed to load model, AI will be inactive:', err)
      return false
    }
  }

  start(intervalMs = 150) {
    if (this.timer) return
    this.timer = setInterval(() => this.update(), intervalMs)
  }

  stop() {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = undefined
  }

  private async update() {
    if (!this.session || !this.ort) return
    const state = this.store.getState()
    const now = performance.now()

    for (const boat of Object.values(state.boats)) {
      if (!boat.ai?.enabled) continue

      if (boat.rightsSuspended) continue
      if (boat.penalties > 0) {
        this.requestSpin(boat.id)
        continue
      }

      try {
        const heading = await this.computeHeading(state, boat)
        if (heading === null) continue
        this.publishHeading(boat.id, heading, now)
      } catch {
        // Inference failure is non-fatal; skip this tick
      }
    }
  }

  private async computeHeading(state: RaceState, boat: BoatState): Promise<number | null> {
    if (!this.session || !this.ort) return null

    const features = extractFeatures(state, boat)
    const inputArray = new Float32Array(featuresToArray(features))
    const tensor = new this.ort.Tensor('float32', inputArray, [1, inputArray.length])

    const results = await this.session.run({ features: tensor })
    const output = results['heading']
    if (!output?.data || output.data.length < 2) return null

    const sinTwa = output.data[0]
    const cosTwa = output.data[1]
    const twaDeg = (Math.atan2(sinTwa, cosTwa) * 180) / Math.PI
    return normalizeDeg(state.wind.directionDeg + twaDeg)
  }

  private publishHeading(boatId: string, heading: number, now: number) {
    const lastH = this.lastHeading.get(boatId)
    if (lastH !== undefined) {
      const diff = Math.abs(angleDiff(heading, lastH))
      if (diff < 2) return
    }

    const lastSent = this.lastSentAt.get(boatId)
    if (lastSent && now - lastSent < 800) return

    this.lastSentAt.set(boatId, now)
    this.lastHeading.set(boatId, heading)
    this.sendInput(boatId, { absoluteHeadingDeg: heading })
  }
}
