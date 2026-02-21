/**
 * Mock auth service for UI development without a database.
 * Enable with VITE_MOCK_AUTH=true
 */

import type { AuthResponse, LoginCredentials, RegisterCredentials, User } from './authTypes'

const MOCK_STORAGE_KEY = 'mock_auth_users'
const MOCK_TOKENS_KEY = 'mock_auth_tokens'

interface MockUser extends User {
  passwordHash: string // In mock, we just store the password directly
}

// Pre-seeded test users
const DEFAULT_USERS: MockUser[] = [
  {
    id: 'mock-admin-001',
    email: 'admin@test.com',
    displayName: 'Test Admin',
    role: 'admin',
    passwordHash: 'admin123',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'mock-player-001',
    email: 'player@test.com',
    displayName: 'Test Player',
    role: 'player',
    passwordHash: 'player123',
    createdAt: new Date().toISOString(),
  },
]

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const generateId = () => `mock-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

const generateToken = () => `mock_token_${Date.now()}_${Math.random().toString(36).slice(2, 15)}`

const getUsers = (): MockUser[] => {
  try {
    const stored = localStorage.getItem(MOCK_STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored) as MockUser[]
    }
  } catch {
    // Ignore parse errors
  }
  // Initialize with default users
  localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(DEFAULT_USERS))
  return [...DEFAULT_USERS]
}

const saveUsers = (users: MockUser[]) => {
  localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(users))
}

const getTokens = (): Map<string, string> => {
  try {
    const stored = localStorage.getItem(MOCK_TOKENS_KEY)
    if (stored) {
      return new Map(JSON.parse(stored))
    }
  } catch {
    // Ignore parse errors
  }
  return new Map()
}

const saveToken = (token: string, userId: string) => {
  const tokens = getTokens()
  tokens.set(token, userId)
  localStorage.setItem(MOCK_TOKENS_KEY, JSON.stringify([...tokens]))
}

const getUserIdFromToken = (token: string): string | null => {
  const tokens = getTokens()
  return tokens.get(token) || null
}

const userToPublic = (user: MockUser): User => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  role: user.role,
  createdAt: user.createdAt,
})

class MockAuthError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'MockAuthError'
  }
}

export const mockAuthService = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    await delay(300 + Math.random() * 200) // Simulate network delay

    const users = getUsers()
    const user = users.find((u) => u.email.toLowerCase() === credentials.email.toLowerCase())

    if (!user || user.passwordHash !== credentials.password) {
      throw new MockAuthError('auth_failed', 'Invalid email or password')
    }

    const accessToken = generateToken()
    const refreshToken = generateToken()
    saveToken(accessToken, user.id)
    saveToken(refreshToken, user.id)

    return {
      user: userToPublic(user),
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes
    }
  },

  async register(credentials: RegisterCredentials): Promise<AuthResponse> {
    await delay(400 + Math.random() * 200)

    const users = getUsers()

    if (users.some((u) => u.email.toLowerCase() === credentials.email.toLowerCase())) {
      throw new MockAuthError('email_exists', 'An account with this email already exists')
    }

    if (credentials.password.length < 8) {
      throw new MockAuthError('validation_error', 'Password must be at least 8 characters')
    }

    const newUser: MockUser = {
      id: generateId(),
      email: credentials.email.toLowerCase(),
      displayName: credentials.displayName,
      role: 'player',
      passwordHash: credentials.password,
      createdAt: new Date().toISOString(),
    }

    users.push(newUser)
    saveUsers(users)

    const accessToken = generateToken()
    const refreshToken = generateToken()
    saveToken(accessToken, newUser.id)
    saveToken(refreshToken, newUser.id)

    return {
      user: userToPublic(newUser),
      accessToken,
      refreshToken,
      expiresIn: 900,
    }
  },

  async logout(_refreshToken: string): Promise<void> {
    void _refreshToken // Intentionally unused in mock
    await delay(100)
    // In mock, we don't actually invalidate tokens
  },

  async refreshTokens(refreshToken: string): Promise<AuthResponse> {
    await delay(200)

    const userId = getUserIdFromToken(refreshToken)
    if (!userId) {
      throw new MockAuthError('invalid_token', 'Invalid or expired refresh token')
    }

    const users = getUsers()
    const user = users.find((u) => u.id === userId)
    if (!user) {
      throw new MockAuthError('user_not_found', 'User not found')
    }

    const newAccessToken = generateToken()
    const newRefreshToken = generateToken()
    saveToken(newAccessToken, user.id)
    saveToken(newRefreshToken, user.id)

    return {
      user: userToPublic(user),
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 900,
    }
  },

  async getMe(accessToken: string): Promise<User> {
    await delay(150)

    const userId = getUserIdFromToken(accessToken)
    if (!userId) {
      throw new MockAuthError('unauthorized', 'Invalid or expired token')
    }

    const users = getUsers()
    const user = users.find((u) => u.id === userId)
    if (!user) {
      throw new MockAuthError('user_not_found', 'User not found')
    }

    return userToPublic(user)
  },

  async forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
    await delay(300)
    // In mock mode, always return success
    console.log('[mock] Password reset email would be sent to:', email)
    return {
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent',
    }
  },

  async resetPassword(token: string, password: string): Promise<{ success: boolean; message: string }> {
    await delay(300)
    // In mock mode, always succeed
    console.log('[mock] Password would be reset with token:', token.slice(0, 10) + '...', 'length:', password.length)
    return {
      success: true,
      message: 'Password has been reset successfully',
    }
  },

  async updateProfile(accessToken: string, updates: { displayName?: string }): Promise<User> {
    await delay(200)

    const userId = getUserIdFromToken(accessToken)
    if (!userId) {
      throw new MockAuthError('unauthorized', 'Invalid or expired token')
    }

    const users = getUsers()
    const userIndex = users.findIndex((u) => u.id === userId)
    if (userIndex === -1) {
      throw new MockAuthError('user_not_found', 'User not found')
    }

    if (updates.displayName) {
      users[userIndex].displayName = updates.displayName.trim()
    }

    saveUsers(users)
    return userToPublic(users[userIndex])
  },

  // Admin endpoints
  async listUsers(
    accessToken: string,
    options: { limit?: number; offset?: number; role?: string } = {},
  ): Promise<{ users: User[]; total: number }> {
    await delay(200)

    const userId = getUserIdFromToken(accessToken)
    if (!userId) {
      throw new MockAuthError('unauthorized', 'Invalid or expired token')
    }

    const users = getUsers()
    const currentUser = users.find((u) => u.id === userId)
    if (!currentUser || currentUser.role !== 'admin') {
      throw new MockAuthError('forbidden', 'Insufficient permissions')
    }

    let filteredUsers = users.map(userToPublic)
    if (options.role) {
      filteredUsers = filteredUsers.filter((u) => u.role === options.role)
    }

    const total = filteredUsers.length
    const offset = options.offset || 0
    const limit = options.limit || 50
    const paginatedUsers = filteredUsers.slice(offset, offset + limit)

    return { users: paginatedUsers, total }
  },

  async getUser(accessToken: string, userId: string): Promise<User> {
    await delay(150)

    const tokenUserId = getUserIdFromToken(accessToken)
    if (!tokenUserId) {
      throw new MockAuthError('unauthorized', 'Invalid or expired token')
    }

    const users = getUsers()
    const currentUser = users.find((u) => u.id === tokenUserId)
    if (!currentUser || currentUser.role !== 'admin') {
      throw new MockAuthError('forbidden', 'Insufficient permissions')
    }

    const user = users.find((u) => u.id === userId)
    if (!user) {
      throw new MockAuthError('not_found', 'User not found')
    }

    return userToPublic(user)
  },

  async updateUser(
    accessToken: string,
    userId: string,
    updates: Partial<{ email: string; displayName: string; role: string }>,
  ): Promise<User> {
    await delay(200)

    const tokenUserId = getUserIdFromToken(accessToken)
    if (!tokenUserId) {
      throw new MockAuthError('unauthorized', 'Invalid or expired token')
    }

    const users = getUsers()
    const currentUser = users.find((u) => u.id === tokenUserId)
    if (!currentUser || currentUser.role !== 'admin') {
      throw new MockAuthError('forbidden', 'Insufficient permissions')
    }

    const userIndex = users.findIndex((u) => u.id === userId)
    if (userIndex === -1) {
      throw new MockAuthError('not_found', 'User not found')
    }

    if (updates.email) {
      users[userIndex].email = updates.email.toLowerCase()
    }
    if (updates.displayName) {
      users[userIndex].displayName = updates.displayName
    }
    if (updates.role && (updates.role === 'admin' || updates.role === 'player')) {
      users[userIndex].role = updates.role
    }

    saveUsers(users)
    return userToPublic(users[userIndex])
  },

  async deleteUser(accessToken: string, userId: string): Promise<{ success: boolean }> {
    await delay(200)

    const tokenUserId = getUserIdFromToken(accessToken)
    if (!tokenUserId) {
      throw new MockAuthError('unauthorized', 'Invalid or expired token')
    }

    const users = getUsers()
    const currentUser = users.find((u) => u.id === tokenUserId)
    if (!currentUser || currentUser.role !== 'admin') {
      throw new MockAuthError('forbidden', 'Insufficient permissions')
    }

    if (userId === tokenUserId) {
      throw new MockAuthError('validation_error', 'Cannot delete yourself')
    }

    const userIndex = users.findIndex((u) => u.id === userId)
    if (userIndex === -1) {
      throw new MockAuthError('not_found', 'User not found')
    }

    users.splice(userIndex, 1)
    saveUsers(users)

    return { success: true }
  },

  async adminResetPassword(accessToken: string, userId: string): Promise<{ success: boolean; message: string }> {
    await delay(200)

    const tokenUserId = getUserIdFromToken(accessToken)
    if (!tokenUserId) {
      throw new MockAuthError('unauthorized', 'Invalid or expired token')
    }

    const users = getUsers()
    const currentUser = users.find((u) => u.id === tokenUserId)
    if (!currentUser || currentUser.role !== 'admin') {
      throw new MockAuthError('forbidden', 'Insufficient permissions')
    }

    const user = users.find((u) => u.id === userId)
    if (!user) {
      throw new MockAuthError('not_found', 'User not found')
    }

    // Generate a "temporary" password
    const tempPassword = `temp_${Math.random().toString(36).slice(2, 10)}`
    user.passwordHash = tempPassword
    saveUsers(users)

    console.log(`[mock] Admin reset password for ${user.email}. Temp password: ${tempPassword}`)

    return {
      success: true,
      message: 'Password has been reset and emailed to the user',
    }
  },
}

