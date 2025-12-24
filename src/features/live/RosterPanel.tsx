import type { RaceRole } from '@/types/race'
import { useRoster } from '@/state/rosterStore'

type Props = {
  role: RaceRole
}

const roleSortKey = (value: string) => {
  if (value === 'judge') return 0
  if (value === 'spectator') return 1
  if (value === 'god') return 2
  return 99
}

const roleLabel = (value: string) => {
  if (value === 'host') return 'Host'
  if (value === 'player') return 'Player'
  if (value === 'spectator') return 'Spectator'
  if (value === 'judge') return 'Judge'
  if (value === 'god') return 'God'
  return value
}

export const RosterPanel = ({ role }: Props) => {
  const roster = useRoster()
  const extras = roster.extras
    .filter((entry) => entry.role !== 'player')
    .slice()
    .sort((a, b) => {
      const aKey = roleSortKey(a.role)
      const bKey = roleSortKey(b.role)
      if (aKey !== bKey) return aKey - bKey
      return a.name.localeCompare(b.name)
    })
  const extrasCount = extras.length

  // Only show people that are NOT already in the leaderboard (i.e. role !== 'player').
  if (!extrasCount) return null
  return (
    <details className="roster-panel">
      <summary className="roster-summary">
        <h3 className="roster-title">Other participants ({extrasCount})</h3>
      </summary>
      <div className="roster-body">
        <ul style={{ marginTop: 0 }}>
          {extras.map((entry) => (
            <li key={entry.clientId} className="roster-entry">
              <span className="name">{entry.name}</span>
              <span className="role">{roleLabel(entry.role)}</span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}
