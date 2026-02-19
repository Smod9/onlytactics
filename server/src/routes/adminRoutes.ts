import { Router } from 'express'
import crypto from 'crypto'
import {
  listUsers,
  findUserById,
  updateUser,
  deleteUser,
  updateUserPassword,
  type UserRole,
} from '@/auth/userService'
import { revokeAllUserRefreshTokens } from '@/auth/tokenService'
import { sendAdminPasswordResetEmail } from '@/auth/emailService'
import { authenticate, requireRole } from '@/auth/authMiddleware'

const router = Router()

// All admin routes require authentication and admin role
router.use(authenticate, requireRole('admin'))

/**
 * GET /api/admin/users
 * List all users with pagination
 */
router.get('/users', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100)
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0)
    const role = req.query.role as UserRole | undefined

    const result = await listUsers({ limit, offset, role })

    res.json({
      users: result.users.map((user) => ({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })),
      total: result.total,
      limit,
      offset,
    })
  } catch (error) {
    console.error('[admin] List users error:', error)
    res.status(500).json({ error: 'fetch_failed', message: 'Failed to fetch users' })
  }
})

/**
 * GET /api/admin/users/:id
 * Get a specific user
 */
router.get('/users/:id', async (req, res) => {
  try {
    const user = await findUserById(req.params.id)
    if (!user) {
      res.status(404).json({ error: 'not_found', message: 'User not found' })
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
    console.error('[admin] Get user error:', error)
    res.status(500).json({ error: 'fetch_failed', message: 'Failed to fetch user' })
  }
})

/**
 * PATCH /api/admin/users/:id
 * Update user details (email, displayName, role)
 */
router.patch('/users/:id', async (req, res) => {
  try {
    const { email, displayName, role } = req.body

    // Validate role if provided
    if (role !== undefined && role !== 'admin' && role !== 'player') {
      res.status(400).json({ error: 'validation_error', message: 'Invalid role' })
      return
    }

    // Prevent admin from demoting themselves
    if (req.params.id === req.user!.sub && role === 'player') {
      res.status(400).json({ error: 'validation_error', message: 'Cannot demote yourself' })
      return
    }

    const user = await updateUser(req.params.id, { email, displayName, role })
    if (!user) {
      res.status(404).json({ error: 'not_found', message: 'User not found' })
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
    console.error('[admin] Update user error:', error)
    const message = error instanceof Error ? error.message : 'Failed to update user'
    res.status(400).json({ error: 'update_failed', message })
  }
})

/**
 * DELETE /api/admin/users/:id
 * Delete a user
 */
router.delete('/users/:id', async (req, res) => {
  try {
    // Prevent admin from deleting themselves
    if (req.params.id === req.user!.sub) {
      res.status(400).json({ error: 'validation_error', message: 'Cannot delete yourself' })
      return
    }

    const deleted = await deleteUser(req.params.id)
    if (!deleted) {
      res.status(404).json({ error: 'not_found', message: 'User not found' })
      return
    }

    res.json({ success: true })
  } catch (error) {
    console.error('[admin] Delete user error:', error)
    res.status(500).json({ error: 'delete_failed', message: 'Failed to delete user' })
  }
})

/**
 * POST /api/admin/users/:id/reset-password
 * Admin-initiated password reset
 * Generates a temporary password and emails it to the user
 */
router.post('/users/:id/reset-password', async (req, res) => {
  try {
    const user = await findUserById(req.params.id)
    if (!user) {
      res.status(404).json({ error: 'not_found', message: 'User not found' })
      return
    }

    // Generate a secure temporary password
    const temporaryPassword = crypto.randomBytes(12).toString('base64').slice(0, 16)

    await updateUserPassword(user.id, temporaryPassword)

    // Revoke all existing sessions
    await revokeAllUserRefreshTokens(user.id)

    // Send email with temporary password
    await sendAdminPasswordResetEmail(user.email, temporaryPassword, user.displayName)

    res.json({
      success: true,
      message: 'Password has been reset and emailed to the user',
    })
  } catch (error) {
    console.error('[admin] Reset password error:', error)
    res.status(500).json({ error: 'reset_failed', message: 'Failed to reset password' })
  }
})

/**
 * POST /api/admin/users/:id/revoke-sessions
 * Revoke all active sessions for a user
 */
router.post('/users/:id/revoke-sessions', async (req, res) => {
  try {
    const user = await findUserById(req.params.id)
    if (!user) {
      res.status(404).json({ error: 'not_found', message: 'User not found' })
      return
    }

    await revokeAllUserRefreshTokens(user.id)

    res.json({
      success: true,
      message: 'All sessions have been revoked',
    })
  } catch (error) {
    console.error('[admin] Revoke sessions error:', error)
    res.status(500).json({ error: 'revoke_failed', message: 'Failed to revoke sessions' })
  }
})

export default router
