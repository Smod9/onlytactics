import { useState, useEffect } from 'react'
import { appEnv } from '@/config/env'
import { useAuth } from '@/state/authStore'

const apiBase = appEnv.apiUrl.replace(/\/$/, '')

type UserStats = {
  userId: string
  totalRaces: number
  wins: number
  avgPoints: number
  bestPosition: number | null
  fastestTimeSeconds: number | null
  avgFinishPct: number | null
}

type RaceHistoryEntry = {
  raceId: string
  finishedAt: string
  courseName: string | null
  finishPosition: number | null
  finishTimeSeconds: number | null
  fleetSize: number
  points: number
  dnf: boolean
  avgWindSpeedKts: number | null
}

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function ProfilePage() {
  const [stats, setStats] = useState<UserStats | null>(null)
  const [history, setHistory] = useState<RaceHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth()

  const pathParts = window.location.pathname.split('/')
  const profileUserId = pathParts[2] || user?.id
  const isOwnProfile = !pathParts[2] || pathParts[2] === user?.id

  useEffect(() => {
    if (!profileUserId) {
      setLoading(false)
      setError('Not logged in')
      return
    }
    const load = async () => {
      try {
        const [statsRes, historyRes] = await Promise.all([
          fetch(`${apiBase}/api/stats/users/${profileUserId}`),
          fetch(`${apiBase}/api/stats/users/${profileUserId}/history?limit=10`),
        ])
        if (statsRes.status === 404) {
          setStats(null)
        } else if (!statsRes.ok) {
          throw new Error(`HTTP ${statsRes.status}`)
        } else {
          setStats(await statsRes.json())
        }
        if (historyRes.ok) {
          setHistory(await historyRes.json())
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [profileUserId])

  return (
    <div className="stats-page">
      <div className="stats-card">
        <h2>{isOwnProfile ? 'Your Stats' : 'Sailor Stats'}</h2>
        {loading && <p className="stats-loading">Loading...</p>}
        {error && <p className="stats-error">{error}</p>}
        {!loading && !error && !stats && (
          <p className="stats-empty">No race data yet. Get out there and race!</p>
        )}
        {!loading && !error && stats && (
          <>
            <div className="profile-summary">
              <div className="profile-stat">
                <span className="profile-stat-value">{stats.totalRaces}</span>
                <span className="profile-stat-label">Races</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-value">{stats.wins}</span>
                <span className="profile-stat-label">Wins</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-value">{stats.avgPoints}</span>
                <span className="profile-stat-label">Avg Pts</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-value">
                  {stats.bestPosition ?? '—'}
                </span>
                <span className="profile-stat-label">Best</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-value">
                  {stats.fastestTimeSeconds != null
                    ? formatTime(stats.fastestTimeSeconds)
                    : '—'}
                </span>
                <span className="profile-stat-label">Fastest</span>
              </div>
            </div>

            {history.length > 0 && (
              <>
                <h3>Recent Races</h3>
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Course</th>
                      <th>Pos</th>
                      <th>Time</th>
                      <th>Pts</th>
                      <th>Wind</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((race) => (
                      <tr key={race.raceId} className={race.dnf ? 'stats-row-dnf' : ''}>
                        <td>
                          {race.finishedAt
                            ? new Date(race.finishedAt).toLocaleDateString()
                            : '—'}
                        </td>
                        <td>{race.courseName ?? '—'}</td>
                        <td>
                          {race.dnf
                            ? 'DNF'
                            : race.finishPosition
                              ? `${race.finishPosition}/${race.fleetSize}`
                              : '—'}
                        </td>
                        <td>
                          {race.finishTimeSeconds != null
                            ? formatTime(race.finishTimeSeconds)
                            : '—'}
                        </td>
                        <td>{race.points}</td>
                        <td>
                          {race.avgWindSpeedKts != null
                            ? `${race.avgWindSpeedKts.toFixed(1)} kts`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}
        <div className="stats-nav">
          <a
            href="/leaderboard"
            onClick={(e) => {
              e.preventDefault()
              window.location.href = '/leaderboard'
            }}
          >
            Leaderboard
          </a>
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
