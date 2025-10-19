import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getSupabaseClient } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { formatDistanceToNow } from 'date-fns'
import { sanitizeForDisplay } from '@/lib/sanitize'

interface DeviceSession {
  id: string
  device_id: string
  device_info: string
  last_activity: string
  is_active: boolean
  created_at: string
}

export function ActiveSessions() {
  const { user } = useAuth()
  const [sessions, setSessions] = useState<DeviceSession[]>([])
  const [loading, setLoading] = useState(true)
  const [terminating, setTerminating] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      loadSessions()
    }
  }, [user])

  const loadSessions = async () => {
    if (!user) return
    
    try {
      setLoading(true)
      const supabase = getSupabaseClient()
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/sessions', {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      })
      const result = await response.json()
      if (result.data) {
        setSessions(result.data)
      }
    } catch (error) {
      console.error('Failed to load sessions:', error)
    } finally {
      setLoading(false)
    }
  }

  const terminateSession = async (deviceId: string) => {
    if (!user) return
    
    try {
      setTerminating(deviceId)
      const supabase = getSupabaseClient()
      const { data: { session } } = await supabase.auth.getSession()
      await fetch(`/sessions?device_id=${deviceId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      })
      await loadSessions()
    } catch (error) {
      console.error('Failed to terminate session:', error)
    } finally {
      setTerminating(null)
    }
  }

  const getDeviceIcon = (deviceInfo: string) => {
    const info = deviceInfo.toLowerCase()
    if (info.includes('mobile') || info.includes('android') || info.includes('iphone')) {
      return '📱'
    } else if (info.includes('tablet') || info.includes('ipad')) {
      return '📱'
    } else {
      return '💻'
    }
  }

  const getCurrentDeviceId = () => {
    return localStorage.getItem('device_id')
  }

  if (loading) {
    return (
      <Card className="p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold mb-4">Active Sessions</h3>
      
      {sessions.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-muted-foreground mb-2">Session tracking is not enabled yet.</p>
          <p className="text-sm text-muted-foreground">Your current session is active and secure.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => {
            const isCurrentDevice = session.device_id === getCurrentDeviceId()
            const deviceInfo = sanitizeForDisplay(session.device_info) || 'Unknown Device'
            const browserInfo = sanitizeForDisplay(deviceInfo.split('|')[0]?.substring(0, 50)) || 'Unknown Browser'
            const screenInfo = sanitizeForDisplay(deviceInfo.split('|')[1]) || ''
            
            return (
              <div
                key={session.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  isCurrentDevice ? 'bg-green-50 border-green-200' : 'bg-muted border-border'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">{getDeviceIcon(deviceInfo)}</span>
                  <div>
                    <div className="flex items-center space-x-2">
                      <p className="font-medium text-sm">
                        {browserInfo}
                        {isCurrentDevice && (
                          <span className="ml-2 px-2 py-1 bg-accent/10 text-accent-foreground text-xs rounded-full">
                            Current Device
                          </span>
                        )}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {screenInfo && `${screenInfo} • `}
                      Last active {formatDistanceToNow(new Date(session.last_activity), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                
                {!isCurrentDevice && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => terminateSession(session.device_id)}
                    disabled={terminating === session.device_id}
                    className="text-destructive hover:text-red-700 dark:text-red-300 hover:bg-destructive/5/30"
                  >
                    {terminating === session.device_id ? 'Terminating...' : 'Terminate'}
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
      
      <div className="mt-4 pt-4 border-t">
        <Button
          variant="outline"
          size="sm"
          onClick={loadSessions}
          className="w-full"
        >
          Refresh Sessions
        </Button>
      </div>
    </Card>
  )
}