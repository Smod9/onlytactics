import { courseLegs } from '@/config/course'
import type { BoatState, RaceState } from '@/types/race'
import { useMemo } from 'react'
import { useRaceState } from '@/state/hooks'

type Props = {
  boat?: BoatState
}

type RaceStep = {
  id: string
  label: string
  kind: 'start' | 'windward' | 'gate' | 'finish'
  lap: number // Which lap this step belongs to (0-indexed)
}

/**
 * Build the race progression steps based on lapsToFinish.
 * For a 2-lap race: Start - W - L - W - Finish
 * For a 3-lap race: Start - W - L - W - L - W - Finish
 */
const buildRaceSteps = (lapsToFinish: number): RaceStep[] => {
  const steps: RaceStep[] = []

  // Start
  steps.push({ id: 'start', label: 'Start', kind: 'start', lap: 0 })

  // First windward
  steps.push({ id: 'w-0', label: 'W', kind: 'windward', lap: 0 })

  // For each lap (except the last), add L then W
  for (let lap = 0; lap < lapsToFinish - 1; lap++) {
    steps.push({ id: `l-${lap}`, label: 'L', kind: 'gate', lap })
    steps.push({ id: `w-${lap + 1}`, label: 'W', kind: 'windward', lap: lap + 1 })
  }

  // Finish
  steps.push({ id: 'finish', label: 'Finish', kind: 'finish', lap: lapsToFinish - 1 })

  return steps
}

/**
 * Determine which step index we're currently on based on boat state.
 * Handles shared marks (start/finish use committee/pin; windward used twice).
 */
const getCurrentStepIndex = (
  boat: BoatState | undefined,
  steps: RaceStep[],
  race: RaceState,
): number => {
  if (!boat) return 0
  if (boat.finished) return steps.length - 1

  const nextMarkIndex = boat.nextMarkIndex ?? -1
  const lap = boat.lap ?? 0
  const lapsToFinish = race.lapsToFinish || 1

  // Shared marks:
  // - Start/Finish: committee (1) and pin (2)
  // - Windward: mark 0 used twice (seq 1 and seq 3)
  // - Gate: marks 3/4

  // Start / Finish disambiguation
  if (nextMarkIndex === 1 || nextMarkIndex === 2) {
    const onFinalLap = lap >= lapsToFinish - 1
    if (boat.finished || onFinalLap) return steps.length - 1 // Finish step
    return 0 // Pre-start/start step
  }

  // Windward disambiguation
  if (nextMarkIndex === 0) {
    if (lap === 0) return 1 // First windward
    return 1 + lap * 2 // windward-return per lap
  }

  // Gate (marks 3/4) → L step for this lap
  if (nextMarkIndex === 3 || nextMarkIndex === 4) {
    return 2 + lap * 2
  }

  // Fallback to current leg kind if possible
  const currentLeg = courseLegs.find((leg) => leg.markIndices.includes(nextMarkIndex))
  if (currentLeg?.kind === 'finish') return steps.length - 1
  if (currentLeg?.kind === 'start') return 0

  return Math.max(0, Math.min(steps.length - 1, 1 + lap * 2))
}

export const ProgressStepper = ({ boat }: Props) => {
  const race = useRaceState()
  const lapsToFinish = race.lapsToFinish || 1

  const steps = useMemo(() => buildRaceSteps(lapsToFinish), [lapsToFinish])
  const currentStepIndex = getCurrentStepIndex(boat, steps, race)

  const statusForStep = (index: number) => {
    if (!boat) return index === 0 ? 'active' : 'pending'
    if (boat.finished) return 'done'
    if (index < currentStepIndex) return 'done'
    if (index === currentStepIndex) return 'active'
    return 'pending'
  }

  const shouldShowLabel = (step: RaceStep) =>
    step.kind === 'start' || step.kind === 'finish'

  return (
    <div className="progress-stepper">
      {steps.map((step, index) => {
        const status = statusForStep(index)
        const showLabel = shouldShowLabel(step)
        return (
          <div key={step.id} className={`progress-step status-${status}`}>
            {showLabel && <span className="progress-label">{step.label}</span>}
            {!showLabel && (
              <div className="progress-bullet">
                <span>{step.label}</span>
              </div>
            )}
            {index < steps.length - 1 && <div className="progress-connector" />}
          </div>
        )
      })}
    </div>
  )
}
