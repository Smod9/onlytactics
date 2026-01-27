import { appEnv } from '@/config/env'
import {
  WAKE_BIAS_DEG,
  WAKE_CORE_HALF_ANGLE_DEG,
  WAKE_CORE_MAX_SLOWDOWN,
  WAKE_CORE_STRENGTH,
  WAKE_HALF_WIDTH_END,
  WAKE_HALF_WIDTH_START,
  WAKE_LEEWARD_WIDTH_MULT,
  WAKE_LENGTH,
  WAKE_MAX_SLOWDOWN,
  WAKE_MIN_STRENGTH,
  WAKE_TURB_HALF_ANGLE_DEG,
  WAKE_TURB_MAX_SLOWDOWN,
  WAKE_TURB_STRENGTH,
  WAKE_WINDWARD_WIDTH_MULT,
  WAKE_WIDTH_CURVE,
} from '@/logic/constants'

export type WakeTuningParams = {
  length: number
  widthStart: number
  widthEnd: number
  widthCurve: number
  leewardWidthMult: number
  windwardWidthMult: number
  biasDeg: number
  coreHalfAngleDeg: number
  turbHalfAngleDeg: number
  coreStrength: number
  turbStrength: number
  coreMaxSlowdown: number
  turbMaxSlowdown: number
  maxSlowdown: number
  minStrength: number
}

export type WakeTuningState = {
  enabled: boolean
  tuning: WakeTuningParams
}

export const wakeTuningDefaults: WakeTuningParams = {
  length: WAKE_LENGTH,
  widthStart: WAKE_HALF_WIDTH_START,
  widthEnd: WAKE_HALF_WIDTH_END,
  widthCurve: WAKE_WIDTH_CURVE,
  leewardWidthMult: WAKE_LEEWARD_WIDTH_MULT,
  windwardWidthMult: WAKE_WINDWARD_WIDTH_MULT,
  biasDeg: WAKE_BIAS_DEG,
  coreHalfAngleDeg: WAKE_CORE_HALF_ANGLE_DEG,
  turbHalfAngleDeg: WAKE_TURB_HALF_ANGLE_DEG,
  coreStrength: WAKE_CORE_STRENGTH,
  turbStrength: WAKE_TURB_STRENGTH,
  coreMaxSlowdown: WAKE_CORE_MAX_SLOWDOWN,
  turbMaxSlowdown: WAKE_TURB_MAX_SLOWDOWN,
  maxSlowdown: WAKE_MAX_SLOWDOWN,
  minStrength: WAKE_MIN_STRENGTH,
}

const listeners = new Set<() => void>()

let state: WakeTuningState = {
  enabled: false,
  tuning: { ...wakeTuningDefaults },
}

const clampPositive = (value: number, min = 0.001) =>
  Number.isFinite(value) ? Math.max(min, value) : min

const sanitize = (next: WakeTuningParams): WakeTuningParams => ({
  ...next,
  length: clampPositive(next.length, 1),
  widthStart: clampPositive(next.widthStart, 1),
  widthEnd: clampPositive(next.widthEnd, 1),
  widthCurve: clampPositive(next.widthCurve, 0.1),
  leewardWidthMult: clampPositive(next.leewardWidthMult, 0.1),
  windwardWidthMult: clampPositive(next.windwardWidthMult, 0.1),
  coreHalfAngleDeg: clampPositive(next.coreHalfAngleDeg, 1),
  turbHalfAngleDeg: clampPositive(next.turbHalfAngleDeg, 1),
  coreStrength: Math.max(0, next.coreStrength),
  turbStrength: Math.max(0, next.turbStrength),
  coreMaxSlowdown: Math.max(0, next.coreMaxSlowdown),
  turbMaxSlowdown: Math.max(0, next.turbMaxSlowdown),
  maxSlowdown: Math.max(0, next.maxSlowdown),
  minStrength: Math.max(0, next.minStrength),
})

const emit = () => {
  listeners.forEach((listener) => listener())
}

export const getWakeTuningState = () => state

export const subscribeWakeTuning = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const setWakeTuningEnabled = (enabled: boolean) => {
  if (state.enabled === enabled) return
  state = { ...state, enabled }
  emit()
}

export const updateWakeTuning = (partial: Partial<WakeTuningParams>) => {
  state = {
    ...state,
    tuning: sanitize({ ...state.tuning, ...partial }),
  }
  emit()
}

export const resetWakeTuning = () => {
  state = {
    ...state,
    tuning: { ...wakeTuningDefaults },
  }
  emit()
}

export const getEffectiveWakeTuning = (): WakeTuningParams => {
  if (!appEnv.debugHud || !state.enabled) {
    return wakeTuningDefaults
  }
  return state.tuning
}
