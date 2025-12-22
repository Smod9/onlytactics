import type { RaceRole } from '@/types/race'
import { useRoster } from '@/state/rosterStore'

type Props = {
  role: RaceRole
}

const roleLabel = (value: string) => {
  if (value === 'host') return 'Host'
  if (value === 'player') return 'Player'
  if (value === 'spectator') return 'Spectator'
  return value
}

export const RosterPanel = ({ role }: Props) => {
  const roster = useRoster()
  if (!roster.entries.length) {
    return (
      <div className="roster-panel">
        <h3>Sailors</h3>
        <p className="roster-empty">Waiting for participants…</p>
      </div>
    )
  }
  return (
    <div className="roster-panel">
      <h3>Sailors ({role})</h3>
      <ul>
        {roster.entries.map((entry) => {
          const isHost = entry.role === 'host'
          return (
            <li
              key={entry.clientId}
              className={`roster-entry${isHost ? ' host' : ''}${
                entry.status === 'online' ? '' : ' offline'
              }`}
            >
              <span className="name">{entry.name}</span>
              {isHost && <span className="badge">Host</span>}
              <span className="role">{roleLabel(entry.role)}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
