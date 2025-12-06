export type CourseLeg = {
  id: string
  sequence: number
  rounding: 'port' | 'starboard'
  markIndices: number[]
  label: string
  kind?: 'windward' | 'leeward' | 'gate' | 'start' | 'finish' | 'generic'
  /** For gates: indices of the two marks forming the gate line */
  gateMarkIndices?: [number, number]
  /** For start/finish: indices of committee and pin marks forming the line */
  finishLineIndices?: [number, number]
}

export type RadialStep = { axis: 'x' | 'y'; direction: 1 | -1 }

export const courseLegs: CourseLeg[] = [
  {
    id: 'start',
    sequence: 0,
    rounding: 'port', // Not used for start
    markIndices: [1, 2], // Committee boat and pin
    label: 'Start',
    kind: 'start',
    finishLineIndices: [1, 2], // Mark 1 = committee, Mark 2 = pin
  },
  {
    id: 'windward-entry',
    sequence: 1,
    rounding: 'port',
    markIndices: [0],
    label: 'Windward',
    kind: 'windward',
  },
  {
    id: 'leeward-gate',
    sequence: 2,
    rounding: 'port', // Will be determined dynamically based on which side they go
    markIndices: [3, 4], // Both gate marks - left (west) and right (east)
    label: 'Gate',
    kind: 'gate',
    gateMarkIndices: [3, 4], // Mark 3 = left/west, Mark 4 = right/east
  },
  {
    id: 'windward-return',
    sequence: 3,
    rounding: 'port',
    markIndices: [0],
    label: 'Windward',
    kind: 'windward',
  },
  {
    id: 'finish',
    sequence: 4,
    rounding: 'port', // Not used for finish
    markIndices: [1, 2], // Committee boat and pin
    label: 'Finish',
    kind: 'finish',
    finishLineIndices: [1, 2], // Mark 1 = committee, Mark 2 = pin
  },
]

const sequenceByMark = new Map<number, { rounding: 'port' | 'starboard'; sequences: number[] }>()
courseLegs.forEach((leg) => {
  leg.markIndices.forEach((markIndex) => {
    const entry = sequenceByMark.get(markIndex) ?? { rounding: leg.rounding, sequences: [] }
    entry.sequences.push(leg.sequence)
    sequenceByMark.set(markIndex, entry)
  })
})

export type CourseMarkAnnotation = {
  markIndex: number
  rounding: 'port' | 'starboard'
  sequences: number[]
  kind?: CourseLeg['kind']
}

export const courseMarkAnnotations: CourseMarkAnnotation[] = Array.from(sequenceByMark.entries()).map(
  ([markIndex, { rounding, sequences }]) => {
    const matchingLeg = courseLegs.find(
      (leg) => leg.rounding === rounding && leg.markIndices.includes(markIndex),
    )
    return {
      markIndex,
      rounding,
      sequences: sequences.sort((a, b) => a - b),
      kind: matchingLeg?.kind,
    }
  },
)

export const radialSets: Record<'windward' | 'leeward', Record<'port' | 'starboard', RadialStep[]>> = {
  windward: {
    port: [
      { axis: 'x', direction: 1 }, // 3 o'clock
      { axis: 'y', direction: -1 }, // 12 o'clock (moving toward lower Y)
      { axis: 'x', direction: -1 }, // 9 o'clock
    ],
    starboard: [
      { axis: 'x', direction: -1 }, // 9 o'clock
      { axis: 'y', direction: -1 }, // 12 o'clock
      { axis: 'x', direction: 1 }, // 3 o'clock
    ],
  },
  leeward: {
    port: [
      { axis: 'x', direction: -1 }, // 9 o'clock (west)
      { axis: 'y', direction: 1 }, // 6 o'clock (south)
      { axis: 'x', direction: 1 }, // 3 o'clock (east)
    ],
    starboard: [
      { axis: 'x', direction: 1 }, // 3 o'clock (east)
      { axis: 'y', direction: 1 }, // 6 o'clock (south)
      { axis: 'x', direction: -1 }, // 9 o'clock (west)
    ],
  },
}

/**
 * For gate marks, stages after crossing the gate line.
 * Left gate (west mark): approach from east, round south, exit heading north
 * Right gate (east mark): approach from west, round south, exit heading north
 */
export const gateRadials: Record<'left' | 'right', RadialStep[]> = {
  // Left/West gate mark (x=-40): boat approaches from center, goes around south side
  left: [
    { axis: 'y', direction: 1 }, // Cross south radial (going south of mark)
    { axis: 'x', direction: -1 }, // Cross west radial (exiting to west/north)
  ],
  // Right/East gate mark (x=+40): boat approaches from center, goes around south side
  right: [
    { axis: 'y', direction: 1 }, // Cross south radial (going south of mark)
    { axis: 'x', direction: 1 }, // Cross east radial (exiting to east/north)
  ],
}

