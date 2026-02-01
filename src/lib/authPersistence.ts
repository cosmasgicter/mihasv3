/**
 * Auth persistence utility to prevent automatic logout
 * Uses HTTP-only cookie authentication
 */

/**
 * Helper for authenticated API calls using HTTP-only cookies
 */
async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

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

    // Initial session check (delayed to avoid interfering with login)
    setTimeout(() => this.checkAndRefreshSession(), 5000)
  }

  // Check and refresh session if needed
  private async checkAndRefreshSession() {
    if (this.isChecking) return
    this.isChecking = true

    try {
      // Check current session via API
      const sessionResponse = await authFetch('/api/auth?action=session')
      
      if (!sessionResponse.ok) {
        // No valid session, nothing to refresh
        return
      }

      const sessionData = await sessionResponse.json()
      
      if (sessionData.success && sessionData.user) {
        // Session exists, proactively refresh to extend it
        // The server handles token expiry checks
        await authFetch('/api/auth?action=refresh', { method: 'POST' })
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