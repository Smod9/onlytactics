import { useState, type FormEvent } from 'react'
import { useAuth } from '@/state/authStore'
import { setGuestMode } from './guestMode'

export function RegisterPage() {
  const { register, isLoading, error, clearError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    clearError()

    if (!email || !password || !displayName) {
      setLocalError('Please fill in all fields')
      return
    }

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters')
      return
    }

    if (displayName.trim().length < 2) {
      setLocalError('Display name must be at least 2 characters')
      return
    }

    try {
      await register({ email, password, displayName: displayName.trim() })
      // Redirect to home on success
      window.history.pushState({}, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    } catch {
      // Error is handled by the store
    }
  }

  const displayError = localError || error
  const isEmailExists = displayError?.toLowerCase().includes('already exists')

  const goTo = (path: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <a href="/lobby" className="auth-brand" onClick={(e) => { e.preventDefault(); window.location.href = '/lobby' }}>Only Tactics</a>
        <h1>Create Account</h1>
        <p className="auth-subtitle">Join Only Tactics and start racing</p>

        <form onSubmit={handleSubmit} className="auth-form">
          {displayError && (
            <div className="auth-error">
              {isEmailExists ? (
                <>
                  An account with this email already exists.
                  <br /><br />
                  If this is you, try{' '}
                  <a href="/forgot-password" onClick={goTo('/forgot-password')}>resetting your password</a> or{' '}
                  <a href="/login" onClick={goTo('/login')}>signing in</a>.
                </>
              ) : displayError}
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="displayName">Display Name</label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your sailor name"
              autoComplete="name"
              autoFocus
            />
          </div>

          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div className="auth-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
          </div>

          <div className="auth-field">
            <label htmlFor="confirmPassword">Confirm Password</label>
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
            {isLoading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <div className="auth-links">
          <span>Already have an account?</span>
          <a href="/login" onClick={(e) => {
            e.preventDefault()
            window.history.pushState({}, '', '/login')
            window.dispatchEvent(new PopStateEvent('popstate'))
          }}>
            Sign in
          </a>
        </div>

        <div className="auth-gate-guest">
          <button type="button" onClick={() => { setGuestMode(); window.location.href = '/lobby' }}>
            or continue as guest
          </button>
        </div>
      </div>
    </div>
  )
}
