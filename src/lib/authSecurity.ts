/**
 * CRITICAL: Enhanced Authentication Security
 * Uses HTTP-only cookie authentication
 */
import { apiClient } from '@/services/client'
import { sanitizeForLog } from './security'

export interface AuthValidationResult {
  isValid: boolean
  user: any | null
  error?: string
}

export class AuthSecurityManager {
  private static instance: AuthSecurityManager
  private validationCache = new Map<string, { result: AuthValidationResult; timestamp: number }>()
  private readonly CACHE_TTL = 60000 // 1 minute

  static getInstance(): AuthSecurityManager {
    if (!AuthSecurityManager.instance) {
      AuthSecurityManager.instance = new AuthSecurityManager()
    }
    return AuthSecurityManager.instance
  }

  /**
   * Validate JWT token and user session via cookie-based auth
   */
  async validateAuth(): Promise<AuthValidationResult> {
    const cacheKey = 'auth'
    const cached = this.validationCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.result
    }

    try {
      const sessionData = await apiClient.request<{ user: any | null }>('auth/session', {
        method: 'GET',
        useCache: false,
      })

      if (!sessionData?.user) {
        const result = { isValid: false, user: null, error: 'Invalid session' }
        this.validationCache.set(cacheKey, { result, timestamp: Date.now() })
        return result
      }

      const profileData = await apiClient.request<any>('auth/profile', {
        method: 'GET',
        useCache: false,
      })

      if (!profileData?.id) {
        return { isValid: false, user: null, error: 'Profile validation failed' }
      }

      const result = {
        isValid: true,
        user: {
          ...sessionData.user,
          profile: profileData.user ?? profileData,
        },
      }

      this.validationCache.set(cacheKey, { result, timestamp: Date.now() })
      return result
    } catch (error) {
      console.error('Auth validation error:', sanitizeForLog(error instanceof Error ? error.message : 'Unknown error'))
      return { isValid: false, user: null, error: 'Validation failed' }
    }
  }

  /**
   * Validate admin access
   */
  async validateAdminAccess(): Promise<AuthValidationResult> {
    const authResult = await this.validateAuth()

    if (!authResult.isValid || !authResult.user) {
      return authResult
    }

    try {
      const rolesData = await apiClient.request<{
        role?: string
        permissions?: string[]
        is_active?: boolean
      }>('auth/roles', {
        method: 'GET',
        useCache: false,
      })

      const role = rolesData?.role
      const isActive = rolesData?.is_active !== false
      if (!role || !isActive) {
        return { isValid: false, user: null, error: 'No admin role found' }
      }

      const adminRoles = ['admin', 'super_admin', 'admissions_officer', 'registrar']
      if (!adminRoles.includes(role)) {
        return { isValid: false, user: null, error: 'Insufficient permissions' }
      }

      return {
        isValid: true,
        user: {
          ...authResult.user,
          role,
          permissions: rolesData?.permissions ?? authResult.user.permissions,
        },
      }
    } catch (error) {
      console.error('Admin validation error:', sanitizeForLog(error instanceof Error ? error.message : 'Unknown error'))
      return { isValid: false, user: null, error: 'Admin validation failed' }
    }
  }

  /**
   * Secure database query with JWT validation
   */
  async secureQuery<T>(
    table: string,
    query: any,
    requireAdmin: boolean = false
  ): Promise<{ data: T[] | null; error: any }> {
    // preserve signature for compatibility
    void table

    const authResult = requireAdmin
      ? await this.validateAdminAccess()
      : await this.validateAuth()

    if (!authResult.isValid) {
      return {
        data: null,
        error: { message: authResult.error || 'Authentication failed' }
      }
    }

    try {
      const result = await query
      return result
    } catch (error) {
      console.error('Secure query error:', sanitizeForLog(error instanceof Error ? error.message : 'Unknown error'))
      return {
        data: null,
        error: { message: 'Query execution failed' }
      }
    }
  }

  /**
   * Log authentication events
   */
  async logAuthEvent(
    eventType: string,
    success: boolean,
    errorMessage?: string,
    userId?: string
  ): Promise<void> {
    try {
      await apiClient.request('admin/audit-log', {
        method: 'GET',
        useCache: false,
      })

      console.info('[auth/audit-event]', {
        user_id: userId,
        action: sanitizeForLog(eventType),
        success,
        error_message: errorMessage ? sanitizeForLog(errorMessage) : null,
      })
    } catch (error) {
      console.error('Failed to log auth event:', sanitizeForLog(error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  /**
   * Force session refresh via cookie-based auth
   */
  async refreshSession(): Promise<boolean> {
    try {
      const data = await apiClient.request<{ user?: { id: string } | null }>('auth/refresh', {
        method: 'POST',
        useCache: false,
      })

      if (data?.user?.id) {
        await this.logAuthEvent('session_refreshed', true, undefined, data.user.id)
        this.clearCache()
        return true
      }

      await this.logAuthEvent('session_refresh_failed', false, 'Refresh returned no user')
      return false
    } catch (error) {
      console.error('Session refresh error:', sanitizeForLog(error instanceof Error ? error.message : 'Unknown error'))
      return false
    }
  }

  /**
   * Secure sign out via cookie-based auth
   */
  async secureSignOut(): Promise<void> {
    try {
      const sessionData = await apiClient.request<{ user?: { id: string } | null }>('auth/session', {
        method: 'GET',
        useCache: false,
      })

      await apiClient.request('auth/logout', {
        method: 'POST',
        useCache: false,
      })

      if (sessionData?.user?.id) {
        await this.logAuthEvent('sign_out', true, undefined, sessionData.user.id)
      }

      this.clearCache()
    } catch (error) {
      console.error('Secure sign out error:', sanitizeForLog(error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  /**
   * Clear validation cache
   */
  clearCache(): void {
    this.validationCache.clear()
  }
}

// Create and export the singleton instance
const authSecurityInstance = AuthSecurityManager.getInstance()
export { authSecurityInstance as authSecurity }
export default authSecurityInstance
