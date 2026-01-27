import type { BoatAiConfig } from '@/types/race'

export type AiProfilePreset = {
  id: string
  label: string
  accuracy: number
  reactionMs: number
  upwindTwa: number
  downwindTwa: number
  tackThresholdDeg: number
  gybeThresholdDeg: number
  laylineBuffer: number
}

const PRESETS: Record<string, AiProfilePreset> = {
  steady: {
    id: 'steady',
    label: 'Steady VMG',
    accuracy: 0.8,
    reactionMs: 800,
    upwindTwa: 38,
    downwindTwa: 140,
    tackThresholdDeg: 18,
    gybeThresholdDeg: 20,
    laylineBuffer: 6,
  },
  aggressive: {
    id: 'aggressive',
    label: 'Aggressive',
    accuracy: 0.92,
    reactionMs: 600,
    upwindTwa: 34,
    downwindTwa: 135,
    tackThresholdDeg: 12,
    gybeThresholdDeg: 14,
    laylineBuffer: 4,
  },
  casual: {
    id: 'casual',
    label: 'Casual',
    accuracy: 0.65,
    reactionMs: 1200,
    upwindTwa: 42,
    downwindTwa: 150,
    tackThresholdDeg: 24,
    gybeThresholdDeg: 26,
    laylineBuffer: 10,
  },
  chill: {
    id: 'chill',
    label: 'Chill Cruiser',
    accuracy: 0.6,
    reactionMs: 1500,
    upwindTwa: 43,
    downwindTwa: 152,
    tackThresholdDeg: 28,
    gybeThresholdDeg: 30,
    laylineBuffer: 12,
  },
}

export const getAiPreset = (profileId: string) => PRESETS[profileId] ?? PRESETS.steady

export const createAiConfig = (profileId: string): BoatAiConfig => {
  const preset = getAiPreset(profileId)
  return {
    profileId: preset.id,
    accuracy: preset.accuracy,
    reactionMs: preset.reactionMs,
    upwindTwa: preset.upwindTwa,
    downwindTwa: preset.downwindTwa,
    tackThresholdDeg: preset.tackThresholdDeg,
    gybeThresholdDeg: preset.gybeThresholdDeg,
    laylineBuffer: preset.laylineBuffer,
    separationDistance: 70,
    enabled: true,
  }
}

export const AI_PRESETS = PRESETS
