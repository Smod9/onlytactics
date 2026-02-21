import { useState, type FormEvent, useEffect } from 'react'
import { auth } from '@/features/auth'

export function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tokenParam = params.get('token')
    if (!tokenParam) {
      setError('Invalid or missing reset token')
    } else {
      setToken(tokenParam)
    }
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!token) {
      setError('Invalid or missing reset token')
      return
    }

    if (!password || !confirmPassword) {
      setError('Please fill in all fields')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setIsLoading(true)
    try {
      await auth.resetPassword(token, password)
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password')
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <a href="/lobby" className="auth-brand" onClick={(e) => { e.preventDefault(); window.location.href = '/lobby' }}>Only Tactics</a>
          <h1>Password Reset</h1>
          <p className="auth-subtitle">
            Your password has been successfully reset. You can now sign in with your new password.
          </p>
          <div className="auth-links">
            <a href="/login" onClick={(e) => {
              e.preventDefault()
              window.history.pushState({}, '', '/login')
              window.dispatchEvent(new PopStateEvent('popstate'))
            }} className="auth-submit-link">
              Sign In
            </a>
          </div>
        </div>
      </div>
    )
  }

  if (!token && error) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <a href="/lobby" className="auth-brand" onClick={(e) => { e.preventDefault(); window.location.href = '/lobby' }}>Only Tactics</a>
          <h1>Invalid Link</h1>
          <p className="auth-subtitle">
            This password reset link is invalid or has expired.
          </p>
          <div className="auth-links">
            <a href="/forgot-password" onClick={(e) => {
              e.preventDefault()
              window.history.pushState({}, '', '/forgot-password')
              window.dispatchEvent(new PopStateEvent('popstate'))
            }}>
              Request a new reset link
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <a href="/lobby" className="auth-brand" onClick={(e) => { e.preventDefault(); window.location.href = '/lobby' }}>Only Tactics</a>
        <h1>Set New Password</h1>
        <p className="auth-subtitle">Enter your new password below</p>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}

          <div className="auth-field">
            <label htmlFor="password">New Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              autoFocus
            />
          </div>

          <div className="auth-field">
            <label htmlFor="confirmPassword">Confirm New Password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              autoComplete="new-password"
            />
          </div>

          <button type="submit" className="auth-submit" disabled={isLoading}>
            {isLoading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
