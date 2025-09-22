import { supabase } from './supabase'

export interface SessionManager {
  refreshSession: () => Promise<boolean>
  isSessionValid: () => Promise<boolean>
  clearSession: () => Promise<void>
}

class SessionManagerImpl implements SessionManager {
  private refreshPromise: Promise<boolean> | null = null

  async refreshSession(): Promise<boolean> {
    // Prevent multiple simultaneous refresh attempts
    if (this.refreshPromise) {
      return this.refreshPromise
    }

    this.refreshPromise = this.performRefresh()
    try {
      const result = await this.refreshPromise
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
      return !!data.session
    } catch (error) {
      console.error('Session refresh error:', error)
      return false
    }
  }

  async isSessionValid(): Promise<boolean> {
    try {
      const { data: { session }, error } = await supabase.auth.getSession()
      if (error) {
        return false
      }
      
      if (!session) {
        return false
      }

      // Check if session is expired
      const now = Math.floor(Date.now() / 1000)
      if (session.expires_at && session.expires_at < now) {
        return await this.refreshSession()
      }

      return true
    } catch {
      return false
    }
  }

  async clearSession(): Promise<void> {
    try {
      await supabase.auth.signOut()
    } catch (error) {
      console.error('Error clearing session:', error)
    }
  }
}

export const sessionManager = new SessionManagerImpl()

// Session timeout handler
export function setupSessionTimeout() {
  let timeoutId: NodeJS.Timeout | null = null
  
  const resetTimeout = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    
    // Set timeout for 30 minutes of inactivity
    timeoutId = setTimeout(async () => {
      const isValid = await sessionManager.isSessionValid()
      if (!isValid) {
        await sessionManager.clearSession()
        window.location.href = '/auth/signin?reason=timeout'
      }
    }, 30 * 60 * 1000) // 30 minutes
  }

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
    events.forEach(event => {
      document.removeEventListener(event, resetTimeout)
    })
  }
}