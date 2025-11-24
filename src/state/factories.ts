import { appEnv } from '@/config/env'
import { createId } from '@/utils/ids'
import { seedFromString } from '@/utils/rng'
import type { BoatState, RaceMeta, RaceState, Vec2 } from '@/types/race'

const defaultBoatColors = [0xf6bd60, 0xf28482, 0x84a59d, 0x4d908e, 0xf94144]

const defaultStartLine = {
  pin: { x: -210, y: 60 },
  committee: { x: 210, y: 50 },
}

const defaultLeewardGate = {
  left: { x: -40, y: 130 },
  right: { x: 40, y: 120 },
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
): BoatState => {
  const baseX = -100 + index * 60
  const baseY = 200
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
  }
}

export const createInitialRaceState = (raceId: string, countdown = appEnv.countdownSeconds ?? 30): RaceState => {
  const boats = ['Alpha', 'Bravo'].map((name, idx) => createBoatState(name, idx))
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
    boats: boats.reduce<RaceState['boats']>((acc, boat) => {
      acc[boat.id] = boat
      return acc
    }, {}),
  }
}

export const cloneRaceState = (state: RaceState): RaceState => structuredCopy(state)

