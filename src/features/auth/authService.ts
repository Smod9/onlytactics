import { appEnv } from '@/config/env'
import type { AuthResponse, LoginCredentials, RegisterCredentials, User } from './authTypes'

const API_BASE = appEnv.apiUrl

interface ApiError {
  error: string
  message: string
}

class AuthServiceError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AuthServiceError'
  }
}

const handleResponse = async <T>(response: Response): Promise<T> => {
  const data = await response.json()

  if (!response.ok) {
    const error = data as ApiError
    throw new AuthServiceError(error.error || 'unknown_error', error.message || 'An error occurred')
  }

  return data as T
}

const getAuthHeaders = (token?: string | null): HeadersInit => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(credentials),
    })
    return handleResponse<AuthResponse>(response)
  },

  async register(credentials: RegisterCredentials): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(credentials),
    })
    return handleResponse<AuthResponse>(response)
  },

  async logout(refreshToken: string): Promise<void> {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ refreshToken }),
    })
  },

  async refreshTokens(refreshToken: string): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ refreshToken }),
    })
    return handleResponse<AuthResponse>(response)
  },

  async getMe(accessToken: string): Promise<User> {
    const response = await fetch(`${API_BASE}/api/auth/me`, {
      method: 'GET',
      headers: getAuthHeaders(accessToken),
    })
    return handleResponse<User>(response)
  },

  async forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/api/auth/forgot-password`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ email }),
    })
    return handleResponse<{ success: boolean; message: string }>(response)
  },

  async resetPassword(token: string, password: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/api/auth/reset-password`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ token, password }),
    })
    return handleResponse<{ success: boolean; message: string }>(response)
  },

  async updateProfile(accessToken: string, updates: { displayName?: string }): Promise<User> {
    const response = await fetch(`${API_BASE}/api/auth/profile`, {
      method: 'PATCH',
      headers: getAuthHeaders(accessToken),
      body: JSON.stringify(updates),
    })
    return handleResponse<User>(response)
  },

  // Admin endpoints
  async listUsers(
    accessToken: string,
    options: { limit?: number; offset?: number; role?: string } = {},
  ): Promise<{ users: User[]; total: number }> {
    const params = new URLSearchParams()
    if (options.limit) params.set('limit', String(options.limit))
    if (options.offset) params.set('offset', String(options.offset))
    if (options.role) params.set('role', options.role)

    const response = await fetch(`${API_BASE}/api/admin/users?${params}`, {
      method: 'GET',
      headers: getAuthHeaders(accessToken),
    })
    return handleResponse<{ users: User[]; total: number }>(response)
  },

  async getUser(accessToken: string, userId: string): Promise<User> {
    const response = await fetch(`${API_BASE}/api/admin/users/${userId}`, {
      method: 'GET',
      headers: getAuthHeaders(accessToken),
    })
    return handleResponse<User>(response)
  },

  async updateUser(
    accessToken: string,
    userId: string,
    updates: Partial<{ email: string; displayName: string; role: string }>,
  ): Promise<User> {
    const response = await fetch(`${API_BASE}/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: getAuthHeaders(accessToken),
      body: JSON.stringify(updates),
    })
    return handleResponse<User>(response)
  },

  async deleteUser(accessToken: string, userId: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/api/admin/users/${userId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(accessToken),
    })
    return handleResponse<{ success: boolean }>(response)
  },

  async adminResetPassword(accessToken: string, userId: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/api/admin/users/${userId}/reset-password`, {
      method: 'POST',
      headers: getAuthHeaders(accessToken),
    })
    return handleResponse<{ success: boolean; message: string }>(response)
  },
}

export { AuthServiceError }
