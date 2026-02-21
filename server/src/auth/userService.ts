import bcrypt from 'bcrypt'
import crypto from 'crypto'
import { getPool } from '@/db'
import { appEnv } from '@/config/env'

export type UserRole = 'admin' | 'player'
export type ThemePreference = 'light' | 'dark' | 'auto'

export interface User {
  id: string
  email: string
  displayName: string
  role: UserRole
  themePreference: ThemePreference
  createdAt: Date
  updatedAt: Date
}

interface UserRow {
  id: string
  email: string
  password_hash: string
  display_name: string
  role: UserRole
  theme_preference: ThemePreference
  created_at: Date
  updated_at: Date
}

// Common passwords to reject (subset - expand as needed)
const COMMON_PASSWORDS = new Set([
  'password',
  'password123',
  '12345678',
  '123456789',
  'qwerty123',
  'letmein',
  'welcome',
  'admin123',
  'abc12345',
])

export const validatePassword = (password: string): { valid: boolean; error?: string } => {
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' }
  }
  if (password.length > 128) {
    return { valid: false, error: 'Password must be at most 128 characters' }
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { valid: false, error: 'Password is too common' }
  }
  return { valid: true }
}

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email) && email.length <= 255
}

const rowToUser = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  role: row.role,
  themePreference: row.theme_preference ?? 'auto',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, appEnv.bcryptCostFactor)
}

export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash)
}

export const createUser = async (
  email: string,
  password: string,
  displayName: string,
  role: UserRole = 'player',
): Promise<User> => {
  const passwordValidation = validatePassword(password)
  if (!passwordValidation.valid) {
    throw new Error(passwordValidation.error)
  }

  if (!validateEmail(email)) {
    throw new Error('Invalid email format')
  }

  const passwordHash = await hashPassword(password)
  const pool = getPool()

  const result = await pool.query<UserRow>(
    `INSERT INTO users (email, password_hash, display_name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [email.toLowerCase().trim(), passwordHash, displayName.trim(), role],
  )

  return rowToUser(result.rows[0])
}

export const findUserByEmail = async (email: string): Promise<User | null> => {
  const pool = getPool()
  const result = await pool.query<UserRow>(
    'SELECT * FROM users WHERE email = $1',
    [email.toLowerCase().trim()],
  )
  return result.rows[0] ? rowToUser(result.rows[0]) : null
}

export const findUserById = async (id: string): Promise<User | null> => {
  const pool = getPool()
  const result = await pool.query<UserRow>('SELECT * FROM users WHERE id = $1', [id])
  return result.rows[0] ? rowToUser(result.rows[0]) : null
}

export const getUserWithPasswordHash = async (
  email: string,
): Promise<(User & { passwordHash: string }) | null> => {
  const pool = getPool()
  const result = await pool.query<UserRow>(
    'SELECT * FROM users WHERE email = $1',
    [email.toLowerCase().trim()],
  )
  if (!result.rows[0]) return null
  const row = result.rows[0]
  return {
    ...rowToUser(row),
    passwordHash: row.password_hash,
  }
}

export const updateUser = async (
  id: string,
  updates: Partial<{ email: string; displayName: string; role: UserRole; themePreference: ThemePreference }>,
): Promise<User | null> => {
  const pool = getPool()
  const setClauses: string[] = []
  const values: unknown[] = []
  let paramIndex = 1

  if (updates.email !== undefined) {
    if (!validateEmail(updates.email)) {
      throw new Error('Invalid email format')
    }
    setClauses.push(`email = $${paramIndex++}`)
    values.push(updates.email.toLowerCase().trim())
  }
  if (updates.displayName !== undefined) {
    setClauses.push(`display_name = $${paramIndex++}`)
    values.push(updates.displayName.trim())
  }
  if (updates.role !== undefined) {
    setClauses.push(`role = $${paramIndex++}`)
    values.push(updates.role)
  }
  if (updates.themePreference !== undefined) {
    setClauses.push(`theme_preference = $${paramIndex++}`)
    values.push(updates.themePreference)
  }

  if (setClauses.length === 0) {
    return findUserById(id)
  }

  setClauses.push(`updated_at = now()`)
  values.push(id)

  const result = await pool.query<UserRow>(
    `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values,
  )

  return result.rows[0] ? rowToUser(result.rows[0]) : null
}

export const updateUserPassword = async (id: string, newPassword: string): Promise<boolean> => {
  const passwordValidation = validatePassword(newPassword)
  if (!passwordValidation.valid) {
    throw new Error(passwordValidation.error)
  }

  const passwordHash = await hashPassword(newPassword)
  const pool = getPool()

  const result = await pool.query(
    'UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2',
    [passwordHash, id],
  )

  return result.rowCount !== null && result.rowCount > 0
}

export const deleteUser = async (id: string): Promise<boolean> => {
  const pool = getPool()
  const result = await pool.query('DELETE FROM users WHERE id = $1', [id])
  return result.rowCount !== null && result.rowCount > 0
}

export const listUsers = async (
  options: { limit?: number; offset?: number; role?: UserRole } = {},
): Promise<{ users: User[]; total: number }> => {
  const pool = getPool()
  const { limit = 50, offset = 0, role } = options

  const whereClause = role ? 'WHERE role = $3' : ''
  const params = role ? [limit, offset, role] : [limit, offset]

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM users ${whereClause}`,
    role ? [role] : [],
  )

  const result = await pool.query<UserRow>(
    `SELECT * FROM users ${whereClause} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    params,
  )

  return {
    users: result.rows.map(rowToUser),
    total: parseInt(countResult.rows[0].count, 10),
  }
}

// Password reset token functions
export const createPasswordResetToken = async (userId: string): Promise<string> => {
  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const expiresAt = new Date(Date.now() + appEnv.passwordResetExpiresMinutes * 60 * 1000)

  const pool = getPool()
  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt],
  )

  return token
}

export const verifyPasswordResetToken = async (
  token: string,
): Promise<{ valid: boolean; userId?: string }> => {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const pool = getPool()

  const result = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM password_reset_tokens
     WHERE token_hash = $1 AND expires_at > now() AND used_at IS NULL`,
    [tokenHash],
  )

  if (!result.rows[0]) {
    return { valid: false }
  }

  return { valid: true, userId: result.rows[0].user_id }
}

export const markPasswordResetTokenUsed = async (token: string): Promise<void> => {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const pool = getPool()

  await pool.query(
    'UPDATE password_reset_tokens SET used_at = now() WHERE token_hash = $1',
    [tokenHash],
  )
}
