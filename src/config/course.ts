export type CourseLeg = {
  id: string
  sequence: number
  rounding: 'port' | 'starboard'
  markIndices: number[]
  label: string
  kind?: 'windward' | 'leeward' | 'gate' | 'generic'
}

export type RadialStep = { axis: 'x' | 'y'; direction: 1 | -1 }

export const courseLegs: CourseLeg[] = [
  {
    id: 'windward-entry',
    sequence: 1,
    rounding: 'port',
    markIndices: [0],
    label: 'Windward (M1)',
    kind: 'windward',
  },
  {
    id: 'leeward-gate',
    sequence: 2,
    rounding: 'starboard',
    markIndices: [3],
    label: 'Leeward Gate Right (M2.1)',
    kind: 'leeward',
  },
  {
    id: 'leeward-gate-left',
    sequence: 2,
    rounding: 'port',
    markIndices: [4],
    label: 'Leeward Gate Left (M2.2)',
    kind: 'leeward',
  },
  {
    id: 'windward-return',
    sequence: 3,
    rounding: 'port',
    markIndices: [0],
    label: 'Windward Return (M3)',
    kind: 'windward',
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
      { axis: 'y', direction: 1 }, // 12 o'clock (screen coords up => negative)
      { axis: 'x', direction: -1 }, // 9 o'clock
    ],
    starboard: [
      { axis: 'x', direction: -1 }, // 9 o'clock
      { axis: 'y', direction: 1 }, // 12 o'clock
      { axis: 'x', direction: 1 }, // 3 o'clock
    ],
  },
  leeward: {
    port: [
      { axis: 'x', direction: -1 }, // 9 o'clock
      { axis: 'y', direction: -1 }, // 6 o'clock (positive Y is up, so downwind is -1)
      { axis: 'x', direction: 1 }, // 3 o'clock
    ],
    starboard: [
      { axis: 'x', direction: 1 }, // 3 o'clock
      { axis: 'y', direction: -1 }, // 6 o'clock
      { axis: 'x', direction: -1 }, // 9 o'clock
    ],
  },
}

