import type { Request, Response, NextFunction } from 'express'
import { verifyAccessToken, type TokenPayload } from './tokenService'
import type { UserRole } from './userService'

// Extend Express Request to include user info via module augmentation
declare module 'express-serve-static-core' {
  interface Request {
    user?: TokenPayload
  }
}

/**
 * Middleware to verify JWT access token.
 * Attaches user payload to req.user if valid.
 */
export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'unauthorized', message: 'Missing or invalid authorization header' })
    return
  }

  const token = authHeader.slice(7) // Remove 'Bearer ' prefix
  const payload = verifyAccessToken(token)

  if (!payload) {
    res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired token' })
    return
  }

  req.user = payload
  next()
}

/**
 * Middleware to check if user has required role(s).
 * Must be used after authenticate middleware.
 */
export const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'unauthorized', message: 'Not authenticated' })
      return
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'forbidden', message: 'Insufficient permissions' })
      return
    }

    next()
  }
}

/**
 * Middleware that optionally authenticates.
 * Sets req.user if valid token provided, but doesn't fail if missing.
 */
export const optionalAuth = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const authHeader = req.headers.authorization

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const payload = verifyAccessToken(token)
    if (payload) {
      req.user = payload
    }
  }

  next()
}

/**
 * Combined middleware: authenticate + require admin role
 */
export const requireAdmin = [authenticate, requireRole('admin')]
