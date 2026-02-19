import { useState, useEffect } from 'react'
import { appEnv } from '@/config/env'
import { useAuth } from '@/state/authStore'

const apiBase = appEnv.apiUrl.replace(/\/$/, '')

type LeaderboardEntry = {
  userId: string
  displayName: string
  totalRaces: number
  wins: number
  avgPoints: number
  bestPosition: number | null
}

export function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth()

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(
          `${apiBase}/api/stats/leaderboard?minRaces=1&limit=50`,
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setEntries(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="stats-page">
      <div className="stats-card">
        <h2>Leaderboard</h2>
        <p className="stats-subtitle">
          Ranked by average points (low is better). Minimum 1 race to qualify.
        </p>
        {loading && <p className="stats-loading">Loading...</p>}
        {error && <p className="stats-error">{error}</p>}
        {!loading && !error && entries.length === 0 && (
          <p className="stats-empty">No ranked sailors yet. Go race!</p>
        )}
        {!loading && !error && entries.length > 0 && (
          <table className="stats-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Sailor</th>
                <th>Avg Pts</th>
                <th>Races</th>
                <th>Wins</th>
                <th>Best</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => {
                const isMe = user?.id === entry.userId
                return (
                  <tr key={entry.userId} className={isMe ? 'stats-row-me' : ''}>
                    <td>{index + 1}</td>
                    <td>
                      <a
                        href={`/profile/${entry.userId}`}
                        onClick={(e) => {
                          e.preventDefault()
                          window.location.href = `/profile/${entry.userId}`
                        }}
                      >
                        {entry.displayName}
                      </a>
                      {isMe && <span className="stats-you-badge">you</span>}
                    </td>
                    <td>{entry.avgPoints}</td>
                    <td>{entry.totalRaces}</td>
                    <td>{entry.wins}</td>
                    <td>{entry.bestPosition ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <div className="stats-nav">
          <a
            href="/lobby"
            onClick={(e) => {
              e.preventDefault()
              window.location.href = '/lobby'
            }}
          >
            Back to Lobby
          </a>
        </div>
      </div>
    </div>
  )
}
