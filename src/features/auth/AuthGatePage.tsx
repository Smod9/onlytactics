import { useState, type FormEvent } from 'react'
import { useAuth } from '@/state/authStore'
import { setGuestMode } from './guestMode'

type GateMode = 'register' | 'login'

export function AuthGatePage({ onAuthenticated }: { onAuthenticated: () => void }) {
  const { login, register, isLoading, error, clearError } = useAuth()
  const [mode, setMode] = useState<GateMode>('register')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const switchMode = (next: GateMode) => {
    setMode(next)
    setLocalError(null)
    clearError()
  }

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    clearError()

    if (!email || !password || !displayName) {
      setLocalError('Please fill in all fields')
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
      onAuthenticated()
    } catch {
      // Error handled by store
    }
  }

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    clearError()

    if (!email || !password) {
      setLocalError('Please enter your email and password')
      return
    }

    try {
      await login({ email, password })
      onAuthenticated()
    } catch {
      // Error handled by store
    }
  }

  const handleGuest = () => {
    setGuestMode()
    onAuthenticated()
  }

  const displayError = localError || error
  const isEmailExists = displayError?.toLowerCase().includes('already exists')

  return (
    <div className="auth-page">
      <div className="auth-gate-wrapper">
      <div className="auth-card">
        <a href="/" className="auth-brand" onClick={(e) => { e.preventDefault(); window.location.href = '/' }}>
          Only Tactics
        </a>

        {mode === 'register' ? (
          <>
            <h1>Join the Race</h1>
            <p className="auth-subtitle">Create your sailor account to get started</p>

            <form onSubmit={handleRegister} className="auth-form">
              {displayError && (
                <div className="auth-error">
                  {isEmailExists ? (
                    <>
                      An account with this email already exists.{' '}
                      <button type="button" className="auth-inline-link" onClick={() => switchMode('login')}>
                        Sign in instead?
                      </button>
                    </>
                  ) : displayError}
                </div>
              )}

              <div className="auth-field">
                <label htmlFor="gate-displayName">Sailor Name</label>
                <input
                  id="gate-displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name on the water"
                  autoComplete="name"
                  autoFocus
                />
              </div>

              <div className="auth-field">
                <label htmlFor="gate-email">Email</label>
                <input
                  id="gate-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>

              <div className="auth-field">
                <label htmlFor="gate-password">Password</label>
                <input
                  id="gate-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                />
              </div>

              <button type="submit" className="auth-submit" disabled={isLoading}>
                {isLoading ? 'Creating account...' : 'Create Account'}
              </button>
            </form>

            <div className="auth-links">
              <span>Already have an account?</span>
              <button type="button" className="auth-inline-link" onClick={() => switchMode('login')}>
                Sign in
              </button>
            </div>
          </>
        ) : (
          <>
            <h1>Welcome Back</h1>
            <p className="auth-subtitle">Sign in to your Only Tactics account</p>

            <form onSubmit={handleLogin} className="auth-form">
              {displayError && <div className="auth-error">{displayError}</div>}

              <div className="auth-field">
                <label htmlFor="gate-email">Email</label>
                <input
                  id="gate-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoFocus
                />
              </div>

              <div className="auth-field">
                <label htmlFor="gate-password">Password</label>
                <input
                  id="gate-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  autoComplete="current-password"
                />
              </div>

              <button type="submit" className="auth-submit" disabled={isLoading}>
                {isLoading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>

            <div className="auth-links">
              <a href="/forgot-password" onClick={(e) => { e.preventDefault(); window.location.href = '/forgot-password' }}>
                Forgot your password?
              </a>
              <span className="auth-separator">·</span>
              <button type="button" className="auth-inline-link" onClick={() => switchMode('register')}>
                Create an account
              </button>
            </div>
          </>
        )}

      </div>
      <button type="button" className="auth-gate-guest-sticker" onClick={handleGuest}>
        <span className="auth-gate-guest-emoji">🏄</span>
        <span>Just wanna sail?</span>
        <span className="auth-gate-guest-cta">Jump in as guest &rarr;</span>
      </button>
      </div>
    </div>
  )
}
