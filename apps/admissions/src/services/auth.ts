import { apiClient, AuthenticationError } from './client'
import { logApiError } from '@/lib/apiErrorLogger'

interface RegisterData {
  email: string
  password: string
  fullName: string
  phone?: string
  nationality?: string
}

interface LoginData {
  email: string
  password: string
}

interface PasswordResetData {
  email: string
}

interface PasswordResetConfirmData {
  token: string
  newPassword: string
}

type ProfileUpdatePayload = Record<string, unknown>

export const authService = {
  register: async (data: RegisterData) => {
    const [firstName, ...lastNameParts] = data.fullName.split(' ')
    try {
      return await apiClient.request('/auth/register/', {
        method: 'POST',
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          first_name: firstName || '',
          last_name: lastNameParts.join(' ') || '',
          phone: data.phone || '',
          nationality: data.nationality || '',
        }),
      })
    } catch (error) {
      logApiError('auth', '/api/v1/auth/register/', error)
      throw error
    }
  },

  login: async (data: LoginData) => {
    try {
      return await apiClient.request('/auth/login/', {
        method: 'POST',
        body: JSON.stringify(data),
      })
    } catch (error) {
      logApiError('auth', '/api/v1/auth/login/', error)
      throw error
    }
  },

  logout: async () => {
    try {
      return await apiClient.request('/auth/logout/', {
        method: 'POST',
      })
    } catch (error) {
      logApiError('auth', '/api/v1/auth/logout/', error)
      throw error
    }
  },

  session: async () => {
    try {
      return await apiClient.request('/auth/session/', {
        method: 'GET',
        skipCache: true,
      })
    } catch (error) {
      logApiError('auth', '/api/v1/auth/session/', error)
      throw error
    }
  },

  refresh: async () => {
    try {
      const refreshWithLock = (apiClient as typeof apiClient & {
        refreshAuthSession?: () => Promise<boolean>
      }).refreshAuthSession
      if (!refreshWithLock) {
        return await apiClient.request('/auth/refresh/', {
          method: 'POST',
        })
      }

      const refreshed = await refreshWithLock.call(apiClient)
      if (!refreshed) {
        throw new AuthenticationError()
      }
      return refreshed
    } catch (error) {
      logApiError('auth', '/api/v1/auth/refresh/', error)
      throw error
    }
  },

  profile: async () => {
    try {
      return await apiClient.request('/auth/profile/', {
        method: 'GET',
        skipCache: true,
      })
    } catch (error) {
      logApiError('auth', '/api/v1/auth/profile/', error)
      throw error
    }
  },

  updateProfile: async (updates: ProfileUpdatePayload) => {
    try {
      return await apiClient.request('/auth/profile/', {
        method: 'PATCH',
        body: JSON.stringify(updates),
      })
    } catch (error) {
      logApiError('auth', '/api/v1/auth/profile/', error)
      throw error
    }
  },

  passwordReset: async (data: PasswordResetData) => {
    try {
      return await apiClient.request('/auth/password-reset/', {
        method: 'POST',
        body: JSON.stringify({ email: data.email }),
      })
    } catch (error) {
      logApiError('auth', '/api/v1/auth/password-reset/', error)
      throw error
    }
  },

  passwordResetConfirm: async (data: PasswordResetConfirmData) => {
    try {
      return await apiClient.request('/auth/password-reset/confirm/', {
        method: 'POST',
        body: JSON.stringify({
          token: data.token,
          // Django PasswordResetConfirmSerializer expects snake_case `new_password`
          new_password: data.newPassword,
        }),
      })
    } catch (error) {
      logApiError('auth', '/api/v1/auth/password-reset/confirm/', error)
      throw error
    }
  },
}
