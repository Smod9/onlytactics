import { useState, useEffect, useCallback } from 'react'
import { useRequireAdmin, useAuth } from '@/state/authStore'
import { auth, type User, type AdminRaceEntry, listRaces, setTrainingApproved, getTrainingStats } from '@/features/auth'

type TrainingFilter = 'all' | 'approved' | 'unapproved'

const formatDuration = (seconds: number) => {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function AdminDashboard() {
  const { isLoading: authLoading, shouldRedirect } = useRequireAdmin('/')
  const { user: currentUser, getFreshAccessToken } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const [page, setPage] = useState(0)
  const limit = 20

  // Race training state
  const [races, setRaces] = useState<AdminRaceEntry[]>([])
  const [racesTotal, setRacesTotal] = useState(0)
  const [racesLoading, setRacesLoading] = useState(true)
  const [racesError, setRacesError] = useState<string | null>(null)
  const [racePage, setRacePage] = useState(0)
  const [trainingFilter, setTrainingFilter] = useState<TrainingFilter>('all')
  const [trainingStats, setTrainingStats] = useState<{ approvedRaces: number; totalFrames: number; estimatedRows: number } | null>(null)
  const raceLimit = 20

  const fetchUsers = useCallback(async () => {
    const token = await getFreshAccessToken()
    if (!token) return

    setIsLoading(true)
    setError(null)
    try {
      const result = await auth.listUsers(token, { limit, offset: page * limit })
      setUsers(result.users)
      setTotal(result.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users')
    } finally {
      setIsLoading(false)
    }
  }, [getFreshAccessToken, page])

  const fetchRaces = useCallback(async () => {
    const token = await getFreshAccessToken()
    if (!token) return

    setRacesLoading(true)
    setRacesError(null)
    try {
      const filterOpts: { trainingApproved?: boolean } = {}
      if (trainingFilter === 'approved') filterOpts.trainingApproved = true
      else if (trainingFilter === 'unapproved') filterOpts.trainingApproved = false

      const result = await listRaces(token, {
        limit: raceLimit,
        offset: racePage * raceLimit,
        ...filterOpts,
      })
      setRaces(result.races)
      setRacesTotal(result.total)
    } catch (err) {
      setRacesError(err instanceof Error ? err.message : 'Failed to load races')
    } finally {
      setRacesLoading(false)
    }
  }, [getFreshAccessToken, racePage, trainingFilter])

  const fetchTrainingStats = useCallback(async () => {
    const token = await getFreshAccessToken()
    if (!token) return
    try {
      const stats = await getTrainingStats(token)
      setTrainingStats(stats)
    } catch {
      // Non-critical
    }
  }, [getFreshAccessToken])

  useEffect(() => {
    if (!authLoading && !shouldRedirect) {
      fetchUsers()
      fetchRaces()
      fetchTrainingStats()
    }
  }, [authLoading, shouldRedirect, fetchUsers, fetchRaces, fetchTrainingStats])

  const handleResetPassword = async (userId: string) => {
    const token = await getFreshAccessToken()
    if (!token) return

    if (!confirm('Are you sure you want to reset this user\'s password? They will receive an email with a temporary password.')) {
      return
    }

    setActionLoading(true)
    try {
      await auth.adminResetPassword(token, userId)
      alert('Password has been reset. User will receive an email.')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reset password')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeleteUser = async (userId: string, displayName: string) => {
    const token = await getFreshAccessToken()
    if (!token) return

    if (!confirm(`Are you sure you want to delete user "${displayName}"? This cannot be undone.`)) {
      return
    }

    setActionLoading(true)
    try {
      await auth.deleteUser(token, userId)
      fetchUsers()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete user')
    } finally {
      setActionLoading(false)
    }
  }

  const handleRoleChange = async (userId: string, newRole: 'admin' | 'player') => {
    const token = await getFreshAccessToken()
    if (!token) return

    setActionLoading(true)
    try {
      await auth.updateUser(token, userId, { role: newRole })
      fetchUsers()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update role')
    } finally {
      setActionLoading(false)
    }
  }

  const handleToggleTraining = async (raceId: string, currentlyApproved: boolean) => {
    const token = await getFreshAccessToken()
    if (!token) return

    try {
      await setTrainingApproved(token, raceId, !currentlyApproved)
      setRaces((prev) =>
        prev.map((r) => r.raceId === raceId ? { ...r, trainingApproved: !currentlyApproved } : r),
      )
      fetchTrainingStats()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update race')
    }
  }

  const handleBulkApprove = async (approve: boolean) => {
    const token = await getFreshAccessToken()
    if (!token) return

    const targets = races.filter((r) => r.trainingApproved !== approve)
    if (targets.length === 0) return

    const label = approve ? 'approve' : 'reject'
    if (!confirm(`${label.charAt(0).toUpperCase() + label.slice(1)} ${targets.length} races for training?`)) return

    for (const race of targets) {
      try {
        await setTrainingApproved(token, race.raceId, approve)
      } catch {
        // Continue on individual failures
      }
    }

    fetchRaces()
    fetchTrainingStats()
  }

  if (authLoading) {
    return (
      <div className="admin-page">
        <div className="admin-loading">Loading...</div>
      </div>
    )
  }

  if (shouldRedirect) {
    return null
  }

  const totalPages = Math.ceil(total / limit)
  const raceTotalPages = Math.ceil(racesTotal / raceLimit)

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h1>Admin Dashboard</h1>
        <p className="admin-subtitle">Logged in as {currentUser?.displayName}</p>
      </div>

      <div className="admin-section">
        <div className="admin-section-header">
          <h2>User Management</h2>
          <span className="admin-count">{total} users</span>
        </div>

        {error && <div className="admin-error">{error}</div>}

        {isLoading ? (
          <div className="admin-loading">Loading users...</div>
        ) : (
          <>
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className={user.id === currentUser?.id ? 'current-user' : ''}>
                      <td className="user-name">{user.displayName}</td>
                      <td className="user-email">{user.email}</td>
                      <td>
                        <select
                          value={user.role}
                          onChange={(e) => handleRoleChange(user.id, e.target.value as 'admin' | 'player')}
                          disabled={user.id === currentUser?.id || actionLoading}
                          className="role-select"
                        >
                          <option value="player">Player</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="user-date">
                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}
                      </td>
                      <td className="user-actions">
                        <button
                          onClick={() => handleResetPassword(user.id)}
                          disabled={actionLoading}
                          className="action-btn reset"
                          title="Reset password"
                        >
                          Reset PW
                        </button>
                        {user.id !== currentUser?.id && (
                          <button
                            onClick={() => handleDeleteUser(user.id, user.displayName)}
                            disabled={actionLoading}
                            className="action-btn delete"
                            title="Delete user"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="admin-pagination">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  Previous
                </button>
                <span>
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="admin-section">
        <div className="admin-section-header">
          <h2>Race Training Data</h2>
          {trainingStats && (
            <span className="admin-count">
              {trainingStats.approvedRaces} approved ({trainingStats.totalFrames.toLocaleString()} frames)
            </span>
          )}
        </div>

        <div className="admin-training-controls">
          <div className="admin-filter-group">
            <label>Filter:</label>
            <select
              value={trainingFilter}
              onChange={(e) => { setTrainingFilter(e.target.value as TrainingFilter); setRacePage(0) }}
              className="role-select"
            >
              <option value="all">All races</option>
              <option value="approved">Approved only</option>
              <option value="unapproved">Unapproved only</option>
            </select>
          </div>
          <div className="admin-bulk-actions">
            <button
              className="action-btn reset"
              onClick={() => handleBulkApprove(true)}
            >
              Approve visible
            </button>
            <button
              className="action-btn delete"
              onClick={() => handleBulkApprove(false)}
            >
              Reject visible
            </button>
          </div>
        </div>

        {racesError && <div className="admin-error">{racesError}</div>}

        {racesLoading ? (
          <div className="admin-loading">Loading races...</div>
        ) : races.length === 0 ? (
          <div className="admin-loading">No races found.</div>
        ) : (
          <>
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Course</th>
                    <th>Fleet</th>
                    <th>Humans</th>
                    <th>Finished</th>
                    <th>Duration</th>
                    <th>Wind</th>
                    <th>Penalties</th>
                    <th>Approved</th>
                  </tr>
                </thead>
                <tbody>
                  {races.map((race) => (
                    <tr key={race.raceId} className={race.trainingApproved ? 'training-approved' : ''}>
                      <td className="user-date">
                        {new Date(race.finishedAt).toLocaleDateString()}
                      </td>
                      <td>{race.courseName ?? '-'}</td>
                      <td>{race.fleetSize}</td>
                      <td className={race.humanPlayerCount === 0 ? 'admin-warning-cell' : ''}>
                        {race.humanPlayerCount}
                      </td>
                      <td>{race.finisherCount}/{race.fleetSize}</td>
                      <td>
                        {race.raceDurationSeconds
                          ? formatDuration(race.raceDurationSeconds)
                          : '-'}
                      </td>
                      <td>
                        {race.avgWindSpeedKts
                          ? `${race.avgWindSpeedKts.toFixed(1)} kts`
                          : '-'}
                      </td>
                      <td className={race.totalPenalties > 3 ? 'admin-warning-cell' : ''}>
                        {race.totalPenalties}
                      </td>
                      <td>
                        <button
                          className={`training-toggle ${race.trainingApproved ? 'approved' : 'rejected'}`}
                          onClick={() => handleToggleTraining(race.raceId, race.trainingApproved)}
                          title={race.trainingApproved ? 'Click to reject' : 'Click to approve'}
                        >
                          {race.trainingApproved ? 'Yes' : 'No'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {raceTotalPages > 1 && (
              <div className="admin-pagination">
                <button
                  onClick={() => setRacePage((p) => Math.max(0, p - 1))}
                  disabled={racePage === 0}
                >
                  Previous
                </button>
                <span>
                  Page {racePage + 1} of {raceTotalPages}
                </span>
                <button
                  onClick={() => setRacePage((p) => Math.min(raceTotalPages - 1, p + 1))}
                  disabled={racePage >= raceTotalPages - 1}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
