/**
 * Auth persistence utility to prevent automatic logout
 * Uses HTTP-only cookie authentication via canonical ApiClient
 */
import { apiClient } from '@/services/client'

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
      const sessionData = await apiClient.request<{ user?: { id: string } }>('/api/auth?action=session')
      
      if (sessionData?.user) {
        // Session exists, proactively refresh to extend it
        await apiClient.request('/api/auth?action=refresh', { method: 'POST' })
      }
    } catch (error) {
      // No valid session or refresh failed — nothing to do
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
