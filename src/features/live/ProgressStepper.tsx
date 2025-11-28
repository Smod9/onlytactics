import { courseLegs } from '@/config/course'
import type { BoatState } from '@/types/race'
import { useMemo } from 'react'

type Props = {
  boat?: BoatState
}

const buildSteps = () => {
  const sequences = new Map<number, string[]>()
  courseLegs.forEach((leg) => {
    const labels = sequences.get(leg.sequence) ?? []
    labels.push(leg.label)
    sequences.set(leg.sequence, labels)
  })
  return Array.from(sequences.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([sequence, labels]) => ({
      sequence,
      label: labels.length > 1 ? labels.join(' / ') : labels[0],
    }))
}

export const ProgressStepper = ({ boat }: Props) => {
  const steps = useMemo(() => buildSteps(), [])
  const currentLeg = courseLegs.find((leg) => leg.markIndices.includes(boat?.nextMarkIndex ?? -1))
  const currentSequence = currentLeg?.sequence ?? steps[0]?.sequence

  const statusForSequence = (sequence: number) => {
    if (!currentSequence) return 'pending'
    if (!boat) return sequence === currentSequence ? 'active' : 'pending'
    if (sequence < currentSequence) return 'done'
    if (sequence === currentSequence) return 'active'
    return 'pending'
  }

  return (
    <div className="progress-stepper">
      {steps.map((step, index) => {
        const status = statusForSequence(step.sequence)
        return (
          <div key={step.sequence} className={`progress-step status-${status}`}>
            <div className="progress-bullet">
              <span>{step.sequence}</span>
            </div>
            {index < steps.length - 1 && <div className="progress-connector" />}
          </div>
        )
      })}
    </div>
  )
}

