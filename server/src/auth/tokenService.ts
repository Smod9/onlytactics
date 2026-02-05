import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { getPool } from '@/db'
import { appEnv } from '@/config/env'
import type { User, UserRole } from './userService'

export interface TokenPayload {
  sub: string // user id
  email: string
  role: UserRole
  type: 'access' | 'refresh'
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number // seconds until access token expires
}

const parseExpiresIn = (expiresIn: string): number => {
  const match = expiresIn.match(/^(\d+)([smhd])$/)
  if (!match) return 900 // default 15 minutes

  const value = parseInt(match[1], 10)
  const unit = match[2]

  switch (unit) {
    case 's':
      return value
    case 'm':
      return value * 60
    case 'h':
      return value * 3600
    case 'd':
      return value * 86400
    default:
      return 900
  }
}

export const generateAccessToken = (user: User): string => {
  const payload: TokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    type: 'access',
  }

  return jwt.sign(payload, appEnv.jwtSecret, {
    expiresIn: parseExpiresIn(appEnv.jwtAccessExpiresIn),
  })
}

export const generateRefreshToken = async (user: User): Promise<string> => {
  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const expiresIn = parseExpiresIn(appEnv.jwtRefreshExpiresIn)
  const expiresAt = new Date(Date.now() + expiresIn * 1000)

  const pool = getPool()
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [user.id, tokenHash, expiresAt],
  )

  return token
}

export const generateAuthTokens = async (user: User): Promise<AuthTokens> => {
  const accessToken = generateAccessToken(user)
  const refreshToken = await generateRefreshToken(user)
  const expiresIn = parseExpiresIn(appEnv.jwtAccessExpiresIn)

  return {
    accessToken,
    refreshToken,
    expiresIn,
  }
}

export const verifyAccessToken = (token: string): TokenPayload | null => {
  try {
    const payload = jwt.verify(token, appEnv.jwtSecret) as TokenPayload
    if (payload.type !== 'access') {
      return null
    }
    return payload
  } catch {
    return null
  }
}

export const verifyRefreshToken = async (
  token: string,
): Promise<{ valid: boolean; userId?: string }> => {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const pool = getPool()

  const result = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM refresh_tokens
     WHERE token_hash = $1 AND expires_at > now() AND revoked_at IS NULL`,
    [tokenHash],
  )

  if (!result.rows[0]) {
    return { valid: false }
  }

  return { valid: true, userId: result.rows[0].user_id }
}

export const revokeRefreshToken = async (token: string): Promise<void> => {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const pool = getPool()

  await pool.query(
    'UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1',
    [tokenHash],
  )
}

export const revokeAllUserRefreshTokens = async (userId: string): Promise<void> => {
  const pool = getPool()
  await pool.query(
    'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId],
  )
}

// Constant-time comparison for tokens to prevent timing attacks
export const safeCompare = (a: string, b: string): boolean => {
  if (a.length !== b.length) {
    return false
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}
