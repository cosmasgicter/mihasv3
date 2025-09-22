import { supabase } from './supabase'
import { multiDeviceSessionManager } from './multiDeviceSession'

export interface EnhancedSessionManager {
  refreshSession: () => Promise<boolean>
  isSessionValid: () => Promise<boolean>
  clearSession: () => Promise<void>
  handleAuthStateChange: (event: string, session: any) => Promise<void>
}

class EnhancedSessionManagerImpl implements EnhancedSessionManager {
  private refreshPromise: Promise<boolean> | null = null
  private lastRefreshTime = 0
  private isHandlingAuthChange = false

  async refreshSession(): Promise<boolean> {
    // Prevent multiple simultaneous refresh attempts
    if (this.refreshPromise) {
      return this.refreshPromise
    }

    // Rate limit refresh attempts (max once per 10 seconds)
    const now = Date.now()
    if (now - this.lastRefreshTime < 10000) {
      return false
    }

    this.refreshPromise = this.performRefresh()
    try {
      const result = await this.refreshPromise
      this.lastRefreshTime = now
      return result
    } finally {
      this.refreshPromise = null
    }
  }

  private async performRefresh(): Promise<boolean> {
    try {
      const { data, error } = await supabase.auth.refreshSession()
      if (error) {
        console.error('Session refresh failed:', error.message)
        return false
      }
      
      if (data.session?.user) {
        await multiDeviceSessionManager.registerSession(
          data.session.user.id,
          data.session.access_token
        )
      }
      
      return !!data.session
    } catch (error) {
      console.error('Session refresh error:', error)
      return false
    }
  }

  async isSessionValid(): Promise<boolean> {
    try {
      const { data: { session }, error } = await supabase.auth.getSession()
      if (error || !session) {
        return false
      }

      // Check multi-device session validity
      const isValidMultiDevice = await multiDeviceSessionManager.checkSessionConflicts(session.user.id)
      if (!isValidMultiDevice) {
        return false
      }

      // Check if session is expired
      const now = Math.floor(Date.now() / 1000)
      if (session.expires_at && session.expires_at < now) {
        return await this.refreshSession()
      }

      // Update activity
      await multiDeviceSessionManager.updateActivity(session.user.id)
      return true
    } catch (error) {
      console.error('Session validation error:', error)
      return false
    }
  }

  async clearSession(): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await multiDeviceSessionManager.invalidateSession(user.id)
      }
      await supabase.auth.signOut()
    } catch (error) {
      console.error('Error clearing session:', error)
    }
  }

  async handleAuthStateChange(event: string, session: any): Promise<void> {
    if (this.isHandlingAuthChange) return
    
    this.isHandlingAuthChange = true
    try {
      switch (event) {
        case 'SIGNED_IN':
          if (session?.user) {
            await multiDeviceSessionManager.registerSession(
              session.user.id,
              session.access_token
            )
          }
          break
        case 'SIGNED_OUT':
          if (session?.user) {
            await multiDeviceSessionManager.invalidateSession(session.user.id)
          }
          break
        case 'TOKEN_REFRESHED':
          if (session?.user) {
            await multiDeviceSessionManager.updateActivity(session.user.id)
          }
          break
      }
    } catch (error) {
      console.error('Error handling auth state change:', error)
    } finally {
      this.isHandlingAuthChange = false
    }
  }
}

export const enhancedSessionManager = new EnhancedSessionManagerImpl()

// Enhanced session timeout with multi-device awareness
export function setupEnhancedSessionTimeout() {
  let timeoutId: NodeJS.Timeout | null = null
  let activityCheckInterval: NodeJS.Timeout | null = null
  
  const resetTimeout = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    
    // Set timeout for 30 minutes of inactivity
    timeoutId = setTimeout(async () => {
      const isValid = await enhancedSessionManager.isSessionValid()
      if (!isValid) {
        await enhancedSessionManager.clearSession()
        window.location.href = '/auth/signin?reason=timeout'
      }
    }, 30 * 60 * 1000)
  }

  // Check session validity every 2 minutes
  activityCheckInterval = setInterval(async () => {
    const isValid = await enhancedSessionManager.isSessionValid()
    if (!isValid) {
      await enhancedSessionManager.clearSession()
      window.location.href = '/auth/signin?reason=session_invalid'
    }
  }, 2 * 60 * 1000)

  // Reset timeout on user activity
  const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart']
  events.forEach(event => {
    document.addEventListener(event, resetTimeout, { passive: true })
  })

  // Initial timeout setup
  resetTimeout()

  // Cleanup function
  return () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    if (activityCheckInterval) {
      clearInterval(activityCheckInterval)
    }
    events.forEach(event => {
      document.removeEventListener(event, resetTimeout)
    })
    multiDeviceSessionManager.cleanup()
  }
}