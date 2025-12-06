import { courseLegs } from '@/config/course'
import type { BoatState } from '@/types/race'
import { useMemo } from 'react'

type ChecklistEntry = {
  sequence: number
  labels: string[]
  kind?: string
}

const buildChecklist = () => {
  const map = new Map<number, ChecklistEntry>()
  courseLegs.forEach((leg) => {
    const existing = map.get(leg.sequence)
    if (existing) {
      existing.labels = Array.from(new Set([...existing.labels, leg.label]))
    } else {
      map.set(leg.sequence, { sequence: leg.sequence, labels: [leg.label], kind: leg.kind })
    }
  })
  return Array.from(map.values()).sort((a, b) => a.sequence - b.sequence)
}

type Props = {
  boat?: BoatState
}

export const MarkChecklist = ({ boat }: Props) => {
  const entries = useMemo(() => buildChecklist(), [])
  const currentLeg = courseLegs.find((leg) => leg.markIndices.includes(boat?.nextMarkIndex ?? -1))
  const currentSequence = currentLeg?.sequence ?? entries[0]?.sequence

  const statusForSequence = (sequence: number) => {
    if (!currentSequence) return 'pending'
    if (!boat) return sequence === currentSequence ? 'active' : 'pending'
    if (sequence < currentSequence) return 'done'
    if (sequence === currentSequence) return 'active'
    return 'pending'
  }

  const describeLabels = (labels: string[]) => {
    if (labels.length <= 1) return labels[0]
    const [first, ...rest] = labels
    if (rest.length === 1) {
      return `${first} or ${rest[0]}`
    }
    return `${first}, ${rest.slice(0, -1).join(', ')} or ${rest[rest.length - 1]}`
  }

  return (
    <div className="mark-checklist">
      <h3>Course Checklist</h3>
      <ol>
        {entries.map((entry) => {
          const status = statusForSequence(entry.sequence)
          return (
            <li key={entry.sequence} className={`checklist-item status-${status}`}>
              <span className="marker-label">{describeLabels(entry.labels)}</span>
              <span className="marker-status">{status === 'done' ? 'Done' : status === 'active' ? 'Now' : 'Next'}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

