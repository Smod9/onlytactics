import { useState, useEffect, useCallback } from 'react'
import { useRequireAdmin, useAuth } from '@/state/authStore'
import { auth, type User } from '@/features/auth'

export function AdminDashboard() {
  const { isLoading: authLoading, shouldRedirect } = useRequireAdmin('/')
  const { user: currentUser, getFreshAccessToken } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  // Pagination
  const [page, setPage] = useState(0)
  const limit = 20

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

  useEffect(() => {
    if (!authLoading && !shouldRedirect) {
      fetchUsers()
    }
  }, [authLoading, shouldRedirect, fetchUsers])

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

      <div className="admin-footer">
        <a href="/" onClick={(e) => {
          e.preventDefault()
          window.history.pushState({}, '', '/')
          window.dispatchEvent(new PopStateEvent('popstate'))
        }}>
          Back to Game
        </a>
      </div>
    </div>
  )
}
