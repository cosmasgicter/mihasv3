import { apiClient, AuthenticationError } from './client'
import { logApiError } from '@/lib/apiErrorLogger'
import { getCsrfToken } from '@/lib/csrfToken'

// ─── Generated Types (R14.3) ────────────────────────────────────────────────
// Domain services import strict types from the generated OpenAPI client.
// Pages/components consume this service — never the raw client or generated types directly.
import type {
  LoginRequest,
  RegisterRequest,
  Session,
  PasswordResetRequest as PasswordResetRequestType,
  PasswordResetConfirmRequest,
} from '@/generated'

// ─── Service-level types ─────────────────────────────────────────────────────
// These map the domain interface that pages/hooks consume to the generated contract.

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

/** Validated session shape returned by the auth service */
export type AuthSession = Session

export const authService = {
  register: async (data: RegisterData): Promise<Session | null> => {
    const [firstName, ...lastNameParts] = data.fullName.split(' ')
    // Build the request body conforming to the generated RegisterRequest shape
    const body: RegisterRequest = {
      email: data.email,
      password: data.password,
      first_name: firstName || '',
      last_name: lastNameParts.join(' ') || '',
      phone: data.phone || '',
      nationality: data.nationality || '',
    }
    try {
      return await apiClient.request<Session>('/auth/register/', {
        method: 'POST',
        body: JSON.stringify(body),
      })
    } catch (error) {
      logApiError('auth', '/api/v1/auth/register/', error)
      throw error
    }
  },

  login: async (data: LoginData): Promise<Session | null> => {
    // Build the request body conforming to the generated LoginRequest shape
    const body: LoginRequest = {
      email: data.email,
      password: data.password,
    }
    try {
      return await apiClient.request<Session>('/auth/login/', {
        method: 'POST',
        body: JSON.stringify(body),
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

  session: async (): Promise<Session | null> => {
    try {
      // After a page refresh the in-memory CSRF token is lost. Ask the server
      // to issue a fresh one so the next state-changing request doesn't 403.
      const needsCsrf = !getCsrfToken()
      const endpoint = needsCsrf ? '/auth/session/?refresh_csrf=1' : '/auth/session/'
      return await apiClient.request<Session>(endpoint, {
        method: 'GET',
        retries: 0,
        timeout: 5_000,
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
    const body: PasswordResetRequestType = { email: data.email }
    try {
      return await apiClient.request('/auth/password-reset/', {
        method: 'POST',
        body: JSON.stringify(body),
      })
    } catch (error) {
      logApiError('auth', '/api/v1/auth/password-reset/', error)
      throw error
    }
  },

  passwordResetConfirm: async (data: PasswordResetConfirmData) => {
    const body: PasswordResetConfirmRequest = {
      token: data.token,
      new_password: data.newPassword,
    }
    try {
      return await apiClient.request('/auth/password-reset/confirm/', {
        method: 'POST',
        body: JSON.stringify(body),
      })
    } catch (error) {
      logApiError('auth', '/api/v1/auth/password-reset/confirm/', error)
      throw error
    }
  },

  /**
   * Accept a tenant staff invitation and set your OWN password (task 4.2, R4.3).
   *
   * The handoff: an invited tenant admin/reviewer consumes the single-use token
   * from the emailed link and chooses their own password here. No password was
   * ever set by, shown to, or stored for the inviting admin. Public/unauthenticated
   * — the invitee is not yet signed in.
   */
  acceptStaffInvitation: async (data: { token: string; password: string }) => {
    try {
      return await apiClient.request('/auth/staff-invitation/accept/', {
        method: 'POST',
        body: JSON.stringify({ token: data.token, password: data.password }),
      })
    } catch (error) {
      logApiError('auth', '/api/v1/auth/staff-invitation/accept/', error)
      throw error
    }
  },
}
