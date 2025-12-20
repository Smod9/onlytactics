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
  pin: { x: -180, y: 120 },
  committee: { x: 180, y: 125 },
}

const defaultLeewardGate = {
  // M2.1 / M2.2 (leeward gate marks) - widened for better gate separation/visibility.
  left: { x: -95, y: 73 },
  right: { x: 95, y: 80 },
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
  const baseY = lineTop + 110 + row * 40
  // Reduce jitter to prevent boats from spawning on top of each other
  // Jitter should be at most 30% of spacing, and never more than 20 units
  const jitterXRange = columnCount > 1 ? Math.min(step * 0.3, 20) : 20
  const jitterYRange = 15 // Reduced from 40 to prevent vertical overlaps
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
    protestPenalties: 0,
    pos: { x: spawnX, y: spawnY },
    prevPos: { x: spawnX, y: spawnY },
    speed: 0,
    wakeFactor: 1,
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
  // Course geometry:
  // - marks[0] is the windward mark.
  // - Negative Y is "upwind" on the screen (higher on the canvas).
  // We previously pushed the windward mark very far upwind (-728). Move it DOWN ~10%
  // (closer to the start line) to tighten the course a bit.
  const windwardY = Math.round(-728 * 0.9)
  const defaultMarks: Vec2[] = [
    { x: 0, y: windwardY }, // windward mark (moved down ~10%)
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
    hostBoatId: undefined,
    lapsToFinish: appEnv.lapsToFinish,
    leaderboard: [],
    aiEnabled: appEnv.aiEnabled,
    protests: {},
    boats: boats.reduce<RaceState['boats']>((acc, boat) => {
      acc[boat.id] = boat
      return acc
    }, {}),
  }
}

export const cloneRaceState = (state: RaceState): RaceState => structuredCopy(state)

