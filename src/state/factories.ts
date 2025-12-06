import { appEnv } from '@/config/env'
import { createAiConfig } from '@/ai/profiles'
import { createId } from '@/utils/ids'
import { seedFromString } from '@/utils/rng'
import type { BoatState, RaceMeta, RaceState, Vec2 } from '@/types/race'

export const defaultBoatColors = [
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
  pin: { x: -210, y: 120 },
  committee: { x: 210, y: 110 },
}

const defaultLeewardGate = {
  left: { x: -40, y: 63
   },
  right: { x: 40, y: 70 },
}

const structuredCopy = <T>(value: T): T => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value)) as T
}

export const AI_BOAT_CONFIGS: Array<{ id: string; name: string; aiProfileId: string }> = [
  { id: 'ai-dennis', name: 'Dennis (AI)', aiProfileId: 'steady' },
  { id: 'ai-terry', name: 'Terry (AI)', aiProfileId: 'casual' },
]

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
  const lineTop = Math.max(defaultStartLine.pin.y, defaultStartLine.committee.y)
  const spawnPadding = 30
  const left = defaultStartLine.pin.x + spawnPadding
  const right = defaultStartLine.committee.x - spawnPadding
  const span = Math.max(60, right - left)
  const columnSpacingTarget = 80
  const maxColumns = Math.max(1, Math.min(6, Math.floor(span / columnSpacingTarget) + 1))
  const columnCount = Math.max(1, maxColumns)
  const column = index % columnCount
  const row = Math.floor(index / columnCount)
  const step = columnCount > 1 ? span / (columnCount - 1) : 0
  const baseX = left + column * step
  const baseY = lineTop + 120 + row * 40
  const jitterXRange = columnCount > 1 ? Math.min(step * 0.6, 120) : 120
  const jitterYRange = 40
  const jitter = (range: number) => (Math.random() - 0.5) * range
  const spawnX = baseX + jitter(jitterXRange)
  const spawnY = baseY + jitter(jitterYRange)
  return {
    id: id ?? createId(`boat${index + 1}`),
    name,
    color: defaultBoatColors[index % defaultBoatColors.length],
    headingDeg: 0,
    desiredHeadingDeg: 0,
    lap: 0,
    nextMarkIndex: 0,
    inMarkZone: false,
    finished: false,
    finishTime: undefined,
    distanceToNextMark: undefined,
    penalties: 0,
    pos: { x: spawnX, y: spawnY },
    prevPos: { x: spawnX, y: spawnY },
    prevPos: { x: baseX + jitter(jitterXRange), y: baseY + jitter(jitterYRange) },
    speed: 0,
    stallTimer: 0,
    tackTimer: 0,
    overEarly: false,
    fouled: false,
    lastInputSeq: 0,
    lastInputAppliedAt: 0,
    rightsSuspended: false,
    ai: aiProfileId ? createAiConfig(aiProfileId) : undefined,
  }
}

export const createInitialRaceState = (raceId: string, countdown = appEnv.countdownSeconds): RaceState => {
  const boatConfigs = appEnv.aiEnabled ? AI_BOAT_CONFIGS : []
  const boats = boatConfigs.map((config, idx) =>
    createBoatState(config.name, idx, config.id, config.aiProfileId),
  )
  const baselineWind = appEnv.baselineWindDeg
  const defaultMarks: Vec2[] = [
    { x: 0, y: -220 }, // windward mark
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
    lapsToFinish: appEnv.lapsToFinish,
    leaderboard: [],
    aiEnabled: appEnv.aiEnabled,
    boats: boats.reduce<RaceState['boats']>((acc, boat) => {
      acc[boat.id] = boat
      return acc
    }, {}),
  }
}

export const cloneRaceState = (state: RaceState): RaceState => structuredCopy(state)

