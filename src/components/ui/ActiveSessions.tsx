import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { formatDistanceToNow } from 'date-fns'
import { sanitizeForDisplay } from '@/lib/sanitize'
import { terminateAllOtherSessions } from '@/services/sessionService'
import { useToastStore } from '@/components/ui/Toast'

interface DeviceSession {
  id: string
  device_id: string
  device_info: string
  last_activity: string
  is_active: boolean
  created_at: string
}

const isDeviceSession = (value: unknown): value is DeviceSession => {
  if (!value || typeof value !== 'object') return false

  const session = value as Partial<DeviceSession>

  return (
    typeof session.id === 'string' &&
    typeof session.device_id === 'string' &&
    typeof session.device_info === 'string' &&
    typeof session.last_activity === 'string' &&
    typeof session.is_active === 'boolean' &&
    typeof session.created_at === 'string'
  )
}

const getValidSessions = (value: unknown): DeviceSession[] => {
  if (!Array.isArray(value)) return []
  return value.filter(isDeviceSession)
}

export function ActiveSessions() {
  const { user } = useAuth()
  const [sessions, setSessions] = useState<DeviceSession[]>([])
  const [loading, setLoading] = useState(true)
  const [terminating, setTerminating] = useState<string | null>(null)
  const [terminatingAll, setTerminatingAll] = useState(false)
  const [hasSessionAccessIssue, setHasSessionAccessIssue] = useState(false)
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const { addToast } = useToastStore()

  const loadSessions = useCallback(async () => {
    if (!user) return
    
    try {
      setLoading(true)
      
      const response = await fetch('/api/sessions?action=list', {
        credentials: 'include'
      })

      if (response.status === 401) {
        setSessions([])
        setHasSessionAccessIssue(true)
        return
      }
      
      if (!response.ok) {
        setSessions([])
        setHasSessionAccessIssue(false)
        return
      }
      
      const result = await response.json()
      const parsedSessions = getValidSessions(result?.data?.sessions ?? [])
      setSessions(parsedSessions)
      setHasSessionAccessIssue(!Array.isArray(result?.data?.sessions))
    } catch (error) {
      console.error('Failed to load sessions:', error)
      setSessions([])
      setHasSessionAccessIssue(false)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (user) {
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current)
      loadTimeoutRef.current = setTimeout(loadSessions, 300)
    }
    return () => {
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current)
    }
  }, [user, loadSessions])

  const terminateSession = async (sessionId: string) => {
    if (!user) return
    
    try {
      setTerminating(sessionId)
      
      const response = await fetch('/api/sessions?action=revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ sessionId })
      })
      
      if (response.ok) {
        setSessions(prev => prev.filter(s => s.id !== sessionId))
      }
    } catch (error) {
      console.error('Failed to terminate session:', error)
    } finally {
      setTerminating(null)
    }
  }

  const handleTerminateAllOtherSessions = async () => {
    if (!user) return
    
    const currentDeviceId = getCurrentDeviceId()
    const otherSessionsCount = sessions.filter(s => s.device_id !== currentDeviceId).length
    
    if (otherSessionsCount === 0) {
      addToast('info', 'No other sessions to terminate')
      return
    }
    
    try {
      setTerminatingAll(true)
      const result = await terminateAllOtherSessions()
      
      if (result.success) {
        // Update local state to remove terminated sessions
        setSessions(prev => prev.filter(s => s.device_id === currentDeviceId))
        
        addToast(
          'success',
          result.terminatedCount > 0 
            ? `Successfully terminated ${result.terminatedCount} session${result.terminatedCount > 1 ? 's' : ''}`
            : 'No other sessions to terminate'
        )
      } else {
        addToast('error', result.error || 'Failed to terminate sessions. Please try again.')
      }
    } catch (error) {
      console.error('Failed to terminate all sessions:', error)
      addToast('error', 'Failed to terminate sessions. Please try again.')
    } finally {
      setTerminatingAll(false)
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
          <div className="h-4 bg-skeleton rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-3 bg-skeleton rounded"></div>
            <div className="h-3 bg-skeleton rounded w-5/6"></div>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold mb-4">Active Sessions</h3>

      {hasSessionAccessIssue && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Session details are temporarily unavailable. Your current session remains active.
        </div>
      )}
      
      {sessions.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-gray-900 mb-2">Session tracking is not enabled yet.</p>
          <p className="text-sm text-gray-900">Your current session is active and secure.</p>
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
                    <p className="text-xs text-gray-900">
                      {screenInfo && `${screenInfo} • `}
                      Last active {formatDistanceToNow(new Date(session.last_activity), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                
                {!isCurrentDevice && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => terminateSession(session.id)}
                    disabled={terminating === session.id}
                    className="text-destructive hover:text-error hover:bg-destructive/5"
                  >
                    {terminating === session.id ? 'Terminating...' : 'Terminate'}
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
      
      <div className="mt-4 pt-4 border-t space-y-2">
        {sessions.filter(s => s.device_id !== getCurrentDeviceId()).length > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleTerminateAllOtherSessions}
            disabled={terminatingAll || sessions.filter(s => s.device_id !== getCurrentDeviceId()).length === 0}
            className="w-full"
          >
            {terminatingAll ? 'Terminating All...' : 'Terminate All Other Sessions'}
          </Button>
        )}
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
