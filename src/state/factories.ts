import { appEnv } from '@/config/env'
import { createAiConfig } from '@/ai/profiles'
import { createId } from '@/utils/ids'
import { seedFromString } from '@/utils/rng'
import type { BoatState, RaceMeta, RaceState, Vec2 } from '@/types/race'

const defaultBoatColors = [
  0xff9ecd, // pink
  0xffd166, // golden
  0x8dd3c7, // mint
  0xaec9ff, // pastel blue
  0xff8e72, // coral
  0xcdb4db, // lavender
  0x9bdeac, // seafoam
  0xffc4eb, // blush
  0xf4d35e, // sunflower
  0xb5e48c, // lime pastel
]

const defaultStartLine = {
  pin: { x: -210, y: 80 },
  committee: { x: 210, y: 70 },
}

const defaultLeewardGate = {
  left: { x: -40, y: -20 },
  right: { x: 40, y: -30 },
}

const structuredCopy = <T>(value: T): T => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value)) as T
}

export const createRaceMeta = (raceId: string, seed?: number): RaceMeta => ({
  raceId,
  courseName: 'Practice Course',
  createdAt: Date.now(),
  seed: seed ?? seedFromString(raceId),
})

export const createBoatState = (
  name: string,
  index: number,
  id?: string,
  aiProfileId?: string,
): BoatState => {
  const baseX = -160 + index * 120
  const baseY = 240
  return {
    id: id ?? createId(`boat${index + 1}`),
    name,
    color: defaultBoatColors[index % defaultBoatColors.length],
    headingDeg: 0,
    desiredHeadingDeg: 0,
    penalties: 0,
    pos: { x: baseX, y: baseY },
    speed: 0,
    stallTimer: 0,
    overEarly: false,
    fouled: false,
    lastInputSeq: 0,
    lastInputAppliedAt: 0,
    rightsSuspended: false,
    ai: aiProfileId ? createAiConfig(aiProfileId) : undefined,
  }
}

export const createInitialRaceState = (raceId: string, countdown = appEnv.countdownSeconds): RaceState => {
  const boatConfigs: Array<{ name: string; id?: string; aiProfileId?: string }> = [
    { name: appEnv.aiEnabled ? 'Dennis (AI)' : 'Dennis', aiProfileId: appEnv.aiEnabled ? 'steady' : undefined },
    { name: appEnv.aiEnabled ? 'Terry (AI)' : 'Terry', aiProfileId: appEnv.aiEnabled ? 'casual' : undefined },
  ]
  if (!appEnv.aiEnabled) {
    boatConfigs[0].aiProfileId = undefined
    boatConfigs[1].aiProfileId = undefined
  }
  const boats = boatConfigs.map((config, idx) =>
    createBoatState(config.name, idx, config.id, config.aiProfileId),
  )
  const baselineWind = appEnv.baselineWindDeg
  const defaultMarks: Vec2[] = [
    { x: 0, y: -240 }, // windward mark
    defaultStartLine.committee,
    defaultStartLine.pin,
    defaultLeewardGate.left,
    defaultLeewardGate.right,
  ]
  return {
    t: -countdown,
    meta: createRaceMeta(raceId),
    wind: {
      directionDeg: baselineWind,
      speed: 12,
    },
    baselineWindDeg: baselineWind,
    marks: structuredCopy(defaultMarks),
    startLine: structuredCopy(defaultStartLine),
    leewardGate: structuredCopy(defaultLeewardGate),
    phase: 'prestart',
    countdownArmed: false,
    clockStartMs: null,
    hostId: undefined,
    boats: boats.reduce<RaceState['boats']>((acc, boat) => {
      acc[boat.id] = boat
      return acc
    }, {}),
  }
}

export const cloneRaceState = (state: RaceState): RaceState => structuredCopy(state)

