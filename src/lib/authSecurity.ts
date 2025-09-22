// CRITICAL: Enhanced Authentication Security
import { supabase } from './supabase'
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
   * Validate JWT token and user session
   */
  async validateAuth(): Promise<AuthValidationResult> {
    try {
      // Get current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError || !session) {
        return { isValid: false, user: null, error: 'No valid session' }
      }

      // Check JWT expiration
      const now = Math.floor(Date.now() / 1000)
      if (session.expires_at && session.expires_at < now) {
        return { isValid: false, user: null, error: 'Token expired' }
      }

      // Validate user exists and is active
      const { data: user, error: userError } = await supabase.auth.getUser()
      
      if (userError || !user.user) {
        return { isValid: false, user: null, error: 'Invalid user' }
      }

      // Check if user profile exists and is active
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('id, role, created_at')
        .eq('user_id', user.user.id)
        .single()

      if (profileError) {
        console.error('Profile validation error:', sanitizeForLog(profileError.message))
        return { isValid: false, user: null, error: 'Profile validation failed' }
      }

      return { 
        isValid: true, 
        user: { 
          ...user.user, 
          profile: profile 
        } 
      }
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
      // Check admin role
      const { data: userRole, error } = await supabase
        .from('user_roles')
        .select('role, is_active')
        .eq('user_id', authResult.user.id)
        .eq('is_active', true)
        .single()

      if (error || !userRole) {
        return { isValid: false, user: null, error: 'No admin role found' }
      }

      const adminRoles = ['admin', 'super_admin', 'admissions_officer', 'registrar']
      if (!adminRoles.includes(userRole.role)) {
        return { isValid: false, user: null, error: 'Insufficient permissions' }
      }

      return { 
        isValid: true, 
        user: { 
          ...authResult.user, 
          role: userRole.role 
        } 
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
    // Validate authentication
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
      // Execute query with validated session
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
      await supabase
        .from('auth_audit_log')
        .insert({
          user_id: userId,
          event_type: sanitizeForLog(eventType),
          success,
          error_message: errorMessage ? sanitizeForLog(errorMessage) : null,
          ip_address: null, // Would need to be passed from client
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null
        })
    } catch (error) {
      console.error('Failed to log auth event:', sanitizeForLog(error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  /**
   * Force session refresh
   */
  async refreshSession(): Promise<boolean> {
    try {
      const { data, error } = await supabase.auth.refreshSession()
      
      if (error) {
        await this.logAuthEvent('session_refresh_failed', false, error.message)
        return false
      }

      if (data.session) {
        await this.logAuthEvent('session_refreshed', true, undefined, data.session.user.id)
        return true
      }

      return false
    } catch (error) {
      console.error('Session refresh error:', sanitizeForLog(error instanceof Error ? error.message : 'Unknown error'))
      return false
    }
  }

  /**
   * Secure sign out
   */
  async secureSignOut(): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const userId = user?.id

      // Invalidate all device sessions
      if (userId) {
        await supabase
          .from('device_sessions')
          .update({ is_active: false })
          .eq('user_id', userId)
      }

      // Sign out from Supabase
      await supabase.auth.signOut()

      // Log the event
      if (userId) {
        await this.logAuthEvent('sign_out', true, undefined, userId)
      }
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