// Auth persistence utility to prevent automatic logout
import { supabase } from './supabase'

class AuthPersistence {
  private static instance: AuthPersistence
  private sessionCheckInterval: NodeJS.Timeout | null = null
  private isChecking = false

  static getInstance(): AuthPersistence {
    if (!AuthPersistence.instance) {
      AuthPersistence.instance = new AuthPersistence()
    }
    return AuthPersistence.instance
  }

  // Initialize session persistence
  init() {
    // Only run in browser environment
    if (typeof window === 'undefined') return

    // Check session every 5 minutes
    this.sessionCheckInterval = setInterval(() => {
      this.checkAndRefreshSession()
    }, 5 * 60 * 1000)

    // Check session on visibility change
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          this.checkAndRefreshSession()
        }
      })
    }

    // Initial session check
    setTimeout(() => this.checkAndRefreshSession(), 1000)
  }

  // Check and refresh session if needed
  private async checkAndRefreshSession() {
    if (this.isChecking) return
    this.isChecking = true

    try {
      const { data: { session }, error } = await supabase.auth.getSession()
      
      if (error) {
        console.error('Session check error:', error)
        return
      }

      if (session) {
        // Session exists, check if it needs refresh
        const expiresAt = session.expires_at
        const now = Math.floor(Date.now() / 1000)
        const timeUntilExpiry = expiresAt - now

        // Refresh if expires in less than 10 minutes
        if (timeUntilExpiry < 600) {
          console.log('Refreshing session proactively')
          await supabase.auth.refreshSession()
        }
      }
    } catch (error) {
      console.error('Session refresh error:', error)
    } finally {
      this.isChecking = false
    }
  }

  // Cleanup
  cleanup() {
    if (this.sessionCheckInterval) {
      clearInterval(this.sessionCheckInterval)
      this.sessionCheckInterval = null
    }
  }
}

export const authPersistence = AuthPersistence.getInstance()