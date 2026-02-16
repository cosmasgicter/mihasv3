// @ts-nocheck
/**
 * Multi-Device Session Manager - Uses HTTP-only cookie authentication
 * 
 * @deprecated This module uses the deprecated Supabase stub.
 * TODO: Migrate to API endpoints when multi-device session is reactivated.
 */
import { apiClient } from '@/services/client'

interface DeviceSession {
  id: string
  user_id: string
  device_id: string
  device_info: string
  session_token: string
  last_activity: string
  is_active: boolean
  created_at: string
}

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

class MultiDeviceSessionManager {
  private deviceId: string
  private sessionCheckInterval: NodeJS.Timeout | null = null
  private isCheckingSession = false

  constructor() {
    this.deviceId = this.generateDeviceId()
    this.startSessionMonitoring()
  }

  private generateDeviceId(): string {
    const stored = localStorage.getItem('device_id')
    if (stored) return stored
    
    const deviceId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    localStorage.setItem('device_id', deviceId)
    return deviceId
  }

  private getDeviceInfo(): string {
    return `${navigator.userAgent.substring(0, 100)} | ${window.screen.width}x${window.screen.height}`
  }

  async registerSession(userId: string): Promise<void> {
    try {
      // Register current device session (using Supabase for data storage, not auth)
      await supabase
        .from('device_sessions')
        .upsert({
          user_id: userId,
          device_id: this.deviceId,
          device_info: this.getDeviceInfo(),
          last_activity: new Date().toISOString(),
          is_active: true
        }, {
          onConflict: 'user_id,device_id'
        })

      // Clean up old inactive sessions (older than 7 days)
      await supabase
        .from('device_sessions')
        .delete()
        .eq('user_id', userId)
        .lt('last_activity', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    } catch (error) {
      console.error('Failed to register session:', error)
    }
  }

  async updateActivity(userId: string): Promise<void> {
    try {
      await supabase
        .from('device_sessions')
        .update({
          last_activity: new Date().toISOString(),
          is_active: true
        })
        .eq('user_id', userId)
        .eq('device_id', this.deviceId)
    } catch (error) {
      console.error('Failed to update activity:', error)
    }
  }

  async invalidateSession(userId: string, deviceId?: string): Promise<void> {
    try {
      const query = supabase
        .from('device_sessions')
        .update({ is_active: false })
        .eq('user_id', userId)

      if (deviceId) {
        query.eq('device_id', deviceId)
      } else {
        query.eq('device_id', this.deviceId)
      }

      await query
    } catch (error) {
      console.error('Failed to invalidate session:', error)
    }
  }

  async checkSessionConflicts(userId: string): Promise<boolean> {
    if (this.isCheckingSession) return true
    
    this.isCheckingSession = true
    try {
      const { data: sessions, error } = await supabase
        .from('device_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('last_activity', { ascending: false })

      if (error) {
        return true
      }

      if (!sessions || sessions.length === 0) {
        return false
      }

      // Check if current device session exists and is valid
      const currentSession = sessions.find(s => s.device_id === this.deviceId)
      if (!currentSession) {
        return false
      }

      // Check for session timeout (30 minutes)
      const lastActivity = new Date(currentSession.last_activity)
      const now = new Date()
      const timeDiff = now.getTime() - lastActivity.getTime()
      
      if (timeDiff > 30 * 60 * 1000) {
        await this.invalidateSession(userId)
        return false
      }

      return true
    } catch (error) {
      console.error('Session conflict check failed:', error)
      return false
    } finally {
      this.isCheckingSession = false
    }
  }

  async getActiveSessions(userId: string): Promise<DeviceSession[]> {
    try {
      const { data, error } = await supabase
        .from('device_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('last_activity', { ascending: false })

      if (error) {
        return []
      }

      return data || []
    } catch (error) {
      console.error('Failed to get active sessions:', error)
      return []
    }
  }

  private startSessionMonitoring(): void {
    // Check session every 5 minutes
    this.sessionCheckInterval = setInterval(async () => {
      try {
        // Get current user via cookie-based auth
        const response = await authFetch('/api/auth?action=session')
        if (!response.ok) return
        
        const data = await response.json()
        if (!data.success || !data.user) return
        
        const userId = data.user.id
        await this.updateActivity(userId)
        
        const isValid = await this.checkSessionConflicts(userId)
        if (!isValid) {
          // Sign out via API
          await authFetch('/api/auth?action=logout', { method: 'POST' })
          window.location.href = '/auth/signin?reason=session_expired'
        }
      } catch (error) {
        console.error('Session monitoring error:', error)
      }
    }, 5 * 60 * 1000)
  }

  cleanup(): void {
    if (this.sessionCheckInterval) {
      clearInterval(this.sessionCheckInterval)
      this.sessionCheckInterval = null
    }
  }
}

export const multiDeviceSessionManager = new MultiDeviceSessionManager()
