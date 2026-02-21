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
  WAKE_TWA_ROTATION_SCALE_DOWNWIND,
  WAKE_TWA_ROTATION_SCALE_UPWIND,
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
  twaRotationScaleUpwind: number
  twaRotationScaleDownwind: number
  coreHalfAngleDeg: number
  turbHalfAngleDeg: number
  coreStrength: number
  turbStrength: number
  coreMaxSlowdown: number
  turbMaxSlowdown: number
  maxSlowdown: number
  minStrength: number
}

export const wakeTuningDefaults: WakeTuningParams = {
  length: WAKE_LENGTH,
  widthStart: WAKE_HALF_WIDTH_START,
  widthEnd: WAKE_HALF_WIDTH_END,
  widthCurve: WAKE_WIDTH_CURVE,
  leewardWidthMult: WAKE_LEEWARD_WIDTH_MULT,
  windwardWidthMult: WAKE_WINDWARD_WIDTH_MULT,
  biasDeg: WAKE_BIAS_DEG,
  twaRotationScaleUpwind: WAKE_TWA_ROTATION_SCALE_UPWIND,
  twaRotationScaleDownwind: WAKE_TWA_ROTATION_SCALE_DOWNWIND,
  coreHalfAngleDeg: WAKE_CORE_HALF_ANGLE_DEG,
  turbHalfAngleDeg: WAKE_TURB_HALF_ANGLE_DEG,
  coreStrength: WAKE_CORE_STRENGTH,
  turbStrength: WAKE_TURB_STRENGTH,
  coreMaxSlowdown: WAKE_CORE_MAX_SLOWDOWN,
  turbMaxSlowdown: WAKE_TURB_MAX_SLOWDOWN,
  maxSlowdown: WAKE_MAX_SLOWDOWN,
  minStrength: WAKE_MIN_STRENGTH,
}

export const getEffectiveWakeTuning = (): WakeTuningParams => wakeTuningDefaults
