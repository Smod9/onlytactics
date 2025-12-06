import { courseLegs } from '@/config/course'
import type { BoatState } from '@/types/race'
import { useMemo } from 'react'

type Props = {
  boat?: BoatState
}

type StepInfo = {
  sequence: number
  label: string
  kind?: string
}

const buildSteps = (): StepInfo[] => {
  const sequences = new Map<number, { labels: string[]; kind?: string }>()
  courseLegs.forEach((leg) => {
    const existing = sequences.get(leg.sequence) ?? { labels: [], kind: leg.kind }
    existing.labels.push(leg.label)
    sequences.set(leg.sequence, existing)
  })
  return Array.from(sequences.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([sequence, { labels, kind }]) => ({
      sequence,
      label: labels.length > 1 ? labels.join(' / ') : labels[0],
      kind,
    }))
}

/**
 * Determine current sequence considering both nextMarkIndex and lap.
 * This is needed because the windward mark (index 0) is used by both
 * sequence 1 (windward-entry) and sequence 3 (windward-return).
 */
const getCurrentSequence = (boat: BoatState | undefined, steps: StepInfo[]): number | undefined => {
  if (!boat) return steps[0]?.sequence
  
  const nextMarkIndex = boat.nextMarkIndex ?? -1
  const lap = boat.lap ?? 0
  
  // Find all legs that contain this mark
  const matchingLegs = courseLegs.filter((leg) => leg.markIndices.includes(nextMarkIndex))
  
  if (matchingLegs.length === 0) {
    return steps[0]?.sequence
  }
  
  if (matchingLegs.length === 1) {
    return matchingLegs[0].sequence
  }
  
  // Multiple legs use the same mark - disambiguate based on lap
  // If on lap > 0, we've already completed the initial sequences
  // So windward mark (0) should be sequence 3 (windward-return), not sequence 1
  if (lap > 0) {
    // Prefer higher sequence numbers when on later laps
    const sorted = matchingLegs.sort((a, b) => b.sequence - a.sequence)
    return sorted[0].sequence
  }
  
  // On lap 0, use the lowest sequence (first occurrence in course)
  const sorted = matchingLegs.sort((a, b) => a.sequence - b.sequence)
  return sorted[0].sequence
}

export const ProgressStepper = ({ boat }: Props) => {
  const steps = useMemo(() => buildSteps(), [])
  const currentSequence = getCurrentSequence(boat, steps)

  const statusForSequence = (sequence: number) => {
    if (currentSequence === undefined) return 'pending'
    if (!boat) return sequence === currentSequence ? 'active' : 'pending'
    // If boat has finished, all steps are done (including finish)
    if (boat.finished) return 'done'
    if (sequence < currentSequence) return 'done'
    if (sequence === currentSequence) return 'active'
    return 'pending'
  }

  // Show label for start and finish steps
  const shouldShowLabel = (step: StepInfo) => step.kind === 'start' || step.kind === 'finish'

  return (
    <div className="progress-stepper">
      {steps.map((step, index) => {
        const status = statusForSequence(step.sequence)
        const showLabel = shouldShowLabel(step)
        return (
          <div key={step.sequence} className={`progress-step status-${status}`}>
            {showLabel && <span className="progress-label">{step.label}</span>}
            {!showLabel && (
              <div className="progress-bullet">
                <span>{step.sequence}</span>
              </div>
            )}
            {index < steps.length - 1 && <div className="progress-connector" />}
          </div>
        )
      })}
    </div>
  )
}

