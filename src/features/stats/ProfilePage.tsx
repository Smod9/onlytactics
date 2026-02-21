import { useState, useEffect, type FormEvent } from 'react'
import { appEnv } from '@/config/env'
import { useAuth } from '@/state/authStore'
import { useTheme } from '@/state/themeStore'
import { SunIcon, MoonIcon, MonitorIcon } from '@/view/icons'

const apiBase = appEnv.apiUrl.replace(/\/$/, '')

type UserStats = {
  userId: string
  totalRaces: number
  wins: number
  avgPoints: number
  bestPosition: number | null
  fastestTimeSeconds: number | null
  avgFinishPct: number | null
  totalTillerTimeSeconds: number | null
}

type RaceHistoryEntry = {
  raceId: string
  finishedAt: string
  courseName: string | null
  finishPosition: number | null
  finishTimeSeconds: number | null
  timeBehindFirst: number | null
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

const formatDuration = (seconds: number) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function ProfilePage() {
  const [stats, setStats] = useState<UserStats | null>(null)
  const [history, setHistory] = useState<RaceHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user, updateProfile } = useAuth()
  const { preference, setPreference } = useTheme()
  const [editName, setEditName] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editFeedback, setEditFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const pathParts = window.location.pathname.split('/')
  const profileUserId = pathParts[2] || user?.id
  const isOwnProfile = !pathParts[2] || pathParts[2] === user?.id

  useEffect(() => {
    if (user?.displayName) setEditName(user.displayName)
  }, [user?.displayName])

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = editName.trim()
    if (trimmed.length < 2 || trimmed.length > 50) {
      setEditFeedback({ type: 'error', message: 'Name must be 2-50 characters' })
      return
    }
    if (trimmed === user?.displayName) return

    setEditSaving(true)
    setEditFeedback(null)
    try {
      await updateProfile({ displayName: trimmed })
      setEditFeedback({ type: 'success', message: 'Name updated!' })
      setTimeout(() => setEditFeedback(null), 3000)
    } catch (err) {
      setEditFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save' })
    } finally {
      setEditSaving(false)
    }
  }

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

        {isOwnProfile && user && (
          <div className="profile-edit-section">
            <h3>Edit Profile</h3>
            <form className="profile-edit-form" onSubmit={handleSaveProfile}>
              <div className="auth-field">
                <label htmlFor="edit-displayName">Display Name</label>
                <input
                  id="edit-displayName"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Your sailor name"
                  maxLength={50}
                />
              </div>
              <button
                type="submit"
                className="profile-edit-save"
                disabled={editSaving || editName.trim() === user.displayName}
              >
                {editSaving ? 'Saving...' : 'Save'}
              </button>
            </form>
            {editFeedback && (
              <p className={`profile-edit-feedback ${editFeedback.type}`}>
                {editFeedback.message}
              </p>
            )}
          </div>
        )}

        {isOwnProfile && user && (
          <div className="profile-edit-section">
            <h3>Theme</h3>
            <div className="theme-toggle">
              <button
                type="button"
                className={`theme-toggle-option ${preference === 'light' ? 'active' : ''}`}
                onClick={() => {
                  setPreference('light')
                  updateProfile({ themePreference: 'light' })
                }}
              >
                <SunIcon />
                Light
              </button>
              <button
                type="button"
                className={`theme-toggle-option ${preference === 'dark' ? 'active' : ''}`}
                onClick={() => {
                  setPreference('dark')
                  updateProfile({ themePreference: 'dark' })
                }}
              >
                <MoonIcon />
                Dark
              </button>
              <button
                type="button"
                className={`theme-toggle-option ${preference === 'auto' ? 'active' : ''}`}
                onClick={() => {
                  setPreference('auto')
                  updateProfile({ themePreference: 'auto' })
                }}
              >
                <MonitorIcon />
                Auto
              </button>
            </div>
          </div>
        )}

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
              <div className="profile-stat">
                <span className="profile-stat-value">
                  {stats.totalTillerTimeSeconds
                    ? formatDuration(stats.totalTillerTimeSeconds)
                    : '—'}
                </span>
                <span className="profile-stat-label">Tiller Time</span>
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
                      <th>Fleet</th>
                      <th>Time</th>
                      <th>+1st</th>
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
                            : race.finishPosition ?? '—'}
                        </td>
                        <td>{race.fleetSize}</td>
                        <td>
                          {race.finishTimeSeconds != null
                            ? formatTime(race.finishTimeSeconds)
                            : '—'}
                        </td>
                        <td>
                          {race.timeBehindFirst != null && race.timeBehindFirst > 0
                            ? `+${formatTime(race.timeBehindFirst)}`
                            : race.finishPosition === 1
                              ? '—'
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
