import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import {
  createUser,
  findUserByEmail,
  findUserById,
  getUserWithPasswordHash,
  verifyPassword,
  createPasswordResetToken,
  verifyPasswordResetToken,
  markPasswordResetTokenUsed,
  updateUserPassword,
  updateUser,
  validateEmail,
} from '@/auth/userService'
import {
  generateAuthTokens,
  verifyRefreshToken,
  revokeRefreshToken,
} from '@/auth/tokenService'
import { sendPasswordResetEmail, sendWelcomeEmail } from '@/auth/emailService'
import { authenticate } from '@/auth/authMiddleware'

const router = Router()

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 attempts per minute
  message: { error: 'rate_limited', message: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
})

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 registrations per hour per IP
  message: { error: 'rate_limited', message: 'Too many registration attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
})

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 reset requests per hour
  message: { error: 'rate_limited', message: 'Too many password reset requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Generic auth error to prevent account enumeration
const AUTH_ERROR = { error: 'auth_failed', message: 'Invalid email or password' }

/**
 * POST /api/auth/register
 * Create a new user account
 */
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { email, password, displayName } = req.body

    if (!email || !password || !displayName) {
      res.status(400).json({ error: 'validation_error', message: 'Email, password, and display name are required' })
      return
    }

    if (!validateEmail(email)) {
      res.status(400).json({ error: 'validation_error', message: 'Invalid email format' })
      return
    }

    if (typeof displayName !== 'string' || displayName.trim().length < 2) {
      res.status(400).json({ error: 'validation_error', message: 'Display name must be at least 2 characters' })
      return
    }

    // Check if user already exists
    const existingUser = await findUserByEmail(email)
    if (existingUser) {
      res.status(409).json({ error: 'email_exists', message: 'An account with this email already exists' })
      return
    }

    const user = await createUser(email, password, displayName, 'player')
    const tokens = await generateAuthTokens(user)

    // Send welcome email (don't await - fire and forget)
    sendWelcomeEmail(user.email, user.displayName).catch((err) => {
      console.error('[auth] Failed to send welcome email:', err)
    })

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
      ...tokens,
    })
  } catch (error) {
    console.error('[auth] Registration error:', error)
    const message = error instanceof Error ? error.message : 'Registration failed'
    res.status(400).json({ error: 'registration_failed', message })
  }
})

/**
 * POST /api/auth/login
 * Authenticate user and return tokens
 */
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      res.status(400).json(AUTH_ERROR)
      return
    }

    const user = await getUserWithPasswordHash(email)
    if (!user) {
      // Same error to prevent account enumeration
      res.status(401).json(AUTH_ERROR)
      return
    }

    const validPassword = await verifyPassword(password, user.passwordHash)
    if (!validPassword) {
      res.status(401).json(AUTH_ERROR)
      return
    }

    const tokens = await generateAuthTokens(user)

    res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
      ...tokens,
    })
  } catch (error) {
    console.error('[auth] Login error:', error)
    res.status(500).json({ error: 'login_failed', message: 'Login failed' })
  }
})

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body

    if (!refreshToken) {
      res.status(400).json({ error: 'validation_error', message: 'Refresh token is required' })
      return
    }

    const result = await verifyRefreshToken(refreshToken)
    if (!result.valid || !result.userId) {
      res.status(401).json({ error: 'invalid_token', message: 'Invalid or expired refresh token' })
      return
    }

    const user = await findUserById(result.userId)
    if (!user) {
      res.status(401).json({ error: 'user_not_found', message: 'User not found' })
      return
    }

    // Revoke old refresh token
    await revokeRefreshToken(refreshToken)

    // Generate new tokens
    const tokens = await generateAuthTokens(user)

    res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
      ...tokens,
    })
  } catch (error) {
    console.error('[auth] Token refresh error:', error)
    res.status(500).json({ error: 'refresh_failed', message: 'Token refresh failed' })
  }
})

/**
 * POST /api/auth/logout
 * Revoke refresh token (client should also clear local storage)
 */
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body

    if (refreshToken) {
      await revokeRefreshToken(refreshToken)
    }

    res.json({ success: true })
  } catch (error) {
    console.error('[auth] Logout error:', error)
    // Still return success - logout should always succeed from client perspective
    res.json({ success: true })
  }
})

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await findUserById(req.user!.sub)
    if (!user) {
      res.status(404).json({ error: 'user_not_found', message: 'User not found' })
      return
    }

    res.json({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      createdAt: user.createdAt,
    })
  } catch (error) {
    console.error('[auth] Get user error:', error)
    res.status(500).json({ error: 'fetch_failed', message: 'Failed to fetch user' })
  }
})

/**
 * PATCH /api/auth/profile
 * Update own profile (display name, etc.)
 */
router.patch('/profile', authenticate, async (req, res) => {
  try {
    const { displayName } = req.body

    if (displayName !== undefined) {
      if (typeof displayName !== 'string' || displayName.trim().length < 2 || displayName.trim().length > 50) {
        res.status(400).json({ error: 'validation_error', message: 'Display name must be 2-50 characters' })
        return
      }
    }

    const user = await updateUser(req.user!.sub, { displayName: displayName?.trim() })
    if (!user) {
      res.status(404).json({ error: 'user_not_found', message: 'User not found' })
      return
    }

    res.json({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })
  } catch (error) {
    console.error('[auth] Update profile error:', error)
    const message = error instanceof Error ? error.message : 'Failed to update profile'
    res.status(400).json({ error: 'update_failed', message })
  }
})

/**
 * POST /api/auth/forgot-password
 * Request password reset email
 */
router.post('/forgot-password', passwordResetLimiter, async (req, res) => {
  try {
    const { email } = req.body

    // Always return success to prevent account enumeration
    const successResponse = {
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent',
    }

    if (!email || !validateEmail(email)) {
      res.json(successResponse)
      return
    }

    const user = await findUserByEmail(email)
    if (!user) {
      res.json(successResponse)
      return
    }

    const resetToken = await createPasswordResetToken(user.id)
    await sendPasswordResetEmail(user.email, resetToken, user.displayName)

    res.json(successResponse)
  } catch (error) {
    console.error('[auth] Forgot password error:', error)
    // Still return success to prevent enumeration
    res.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent',
    })
  }
})

/**
 * POST /api/auth/reset-password
 * Reset password using token from email
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body

    if (!token || !password) {
      res.status(400).json({ error: 'validation_error', message: 'Token and new password are required' })
      return
    }

    const result = await verifyPasswordResetToken(token)
    if (!result.valid || !result.userId) {
      res.status(400).json({ error: 'invalid_token', message: 'Invalid or expired reset token' })
      return
    }

    await updateUserPassword(result.userId, password)
    await markPasswordResetTokenUsed(token)

    res.json({ success: true, message: 'Password has been reset successfully' })
  } catch (error) {
    console.error('[auth] Reset password error:', error)
    const message = error instanceof Error ? error.message : 'Password reset failed'
    res.status(400).json({ error: 'reset_failed', message })
  }
})

export default router
