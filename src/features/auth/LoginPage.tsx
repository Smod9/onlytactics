import { useState, type FormEvent } from 'react'
import { useAuth } from '@/state/authStore'

export function LoginPage() {
  const { login, isLoading, error, clearError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    clearError()

    if (!email || !password) {
      setLocalError('Please enter your email and password')
      return
    }

    try {
      await login({ email, password })
      // Redirect to home on success
      window.history.pushState({}, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    } catch {
      // Error is handled by the store
    }
  }

  const displayError = localError || error

  return (
    <div className="auth-page">
      <div className="auth-card">
        <a href="/" className="auth-brand" onClick={(e) => { e.preventDefault(); window.location.href = '/' }}>Only Tactics</a>
        <h1>Welcome Back</h1>
        <p className="auth-subtitle">Sign in to your Only Tactics account</p>

        <form onSubmit={handleSubmit} className="auth-form">
          {displayError && <div className="auth-error">{displayError}</div>}

          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="auth-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
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
          <a href="/forgot-password" onClick={(e) => {
            e.preventDefault()
            window.history.pushState({}, '', '/forgot-password')
            window.dispatchEvent(new PopStateEvent('popstate'))
          }}>
            Forgot your password?
          </a>
          <span className="auth-separator">·</span>
          <a href="/register" onClick={(e) => {
            e.preventDefault()
            window.history.pushState({}, '', '/register')
            window.dispatchEvent(new PopStateEvent('popstate'))
          }}>
            Create an account
          </a>
        </div>
      </div>
    </div>
  )
}
