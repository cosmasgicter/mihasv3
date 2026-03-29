import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { RefreshCw, ShieldCheck } from 'lucide-react'

import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui'
import { sanitizeForDisplay } from '@/lib/sanitize'
import {
  type DeviceSession,
  type SessionDeviceInfo,
  listActiveSessions,
  terminateAllOtherSessions,
  terminateSessionById,
} from '@/services/sessionService'
import { useToastStore } from '@/hooks/useToast'

const isDeviceSession = (value: unknown): value is DeviceSession => {
  if (!value || typeof value !== 'object') return false

  const session = value as Partial<DeviceSession>

  return (
    typeof session.id === 'string' &&
    typeof session.last_activity === 'string' &&
    typeof session.created_at === 'string'
  )
}

const getValidSessions = (value: unknown): DeviceSession[] => {
  if (!Array.isArray(value)) return []
  return value.filter(isDeviceSession)
}

function normalizeDeviceInfo(deviceInfo: DeviceSession['device_info']): SessionDeviceInfo {
  if (typeof deviceInfo === 'string') {
    try {
      const parsed = JSON.parse(deviceInfo)
      if (parsed && typeof parsed === 'object') {
        return parsed as SessionDeviceInfo
      }
    } catch {
      return { browser: deviceInfo, os: 'Unknown', device_type: 'unknown' }
    }
  }

  if (deviceInfo && typeof deviceInfo === 'object') {
    return deviceInfo
  }

  return { browser: 'Unknown', os: 'Unknown', device_type: 'unknown' }
}

function getDeviceIcon(info: SessionDeviceInfo) {
  const type = info.device_type ?? (info.is_mobile ? 'mobile' : 'desktop')

  switch (type) {
    case 'mobile':
      return '📱'
    case 'tablet':
      return '📱'
    default:
      return '💻'
  }
}

function getDeviceHeadline(info: SessionDeviceInfo) {
  const browser = sanitizeForDisplay(info.browser || 'Unknown browser') || 'Unknown browser'
  const os = sanitizeForDisplay(info.os || 'Unknown OS') || 'Unknown OS'
  return `${browser} on ${os}`
}

function getDeviceMeta(info: SessionDeviceInfo, ipAddress?: string | null) {
  const parts = [
    info.device_type ? sanitizeForDisplay(info.device_type) : null,
    ipAddress ? `IP ${sanitizeForDisplay(ipAddress)}` : null,
  ].filter(Boolean)

  return parts.join(' • ')
}

export function ActiveSessions() {
  const { user } = useAuth()
  const [sessions, setSessions] = useState<DeviceSession[]>([])
  const [loading, setLoading] = useState(true)
  const [terminating, setTerminating] = useState<string | null>(null)
  const [terminatingAll, setTerminatingAll] = useState(false)
  const [hasSessionAccessIssue, setHasSessionAccessIssue] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const { addToast } = useToastStore()

  const loadSessions = useCallback(async () => {
    if (!user) {
      setSessions([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const result = await listActiveSessions()
      setSessions(getValidSessions(result.sessions))
      setHasSessionAccessIssue(Boolean(result.accessIssue))
      setLastSyncedAt(new Date().toISOString())
    } catch (error) {
      console.error('Failed to load sessions:', error)
      setSessions([])
      setHasSessionAccessIssue(false)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!user) {
      setSessions([])
      setLoading(false)
      return
    }

    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current)
    loadTimeoutRef.current = setTimeout(loadSessions, 300)

    return () => {
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current)
    }
  }, [user, loadSessions])

  const terminateSession = async (sessionId: string) => {
    if (!user) return

    try {
      setTerminating(sessionId)
      const result = await terminateSessionById(sessionId)

      if (result.success) {
        setSessions(prev => prev.filter(session => session.id !== sessionId))
        addToast('success', 'Session terminated')
      } else {
        addToast('error', result.error || 'Failed to terminate the selected session')
      }
    } catch (error) {
      console.error('Failed to terminate session:', error)
      addToast('error', 'Failed to terminate the selected session')
    } finally {
      setTerminating(null)
    }
  }

  const handleTerminateAllOtherSessions = async () => {
    if (!user) return

    const otherSessionsCount = sessions.filter(session => session.is_current === false).length

    if (otherSessionsCount === 0) {
      addToast('info', 'No other sessions to terminate')
      return
    }

    try {
      setTerminatingAll(true)
      const result = await terminateAllOtherSessions()

      if (result.success) {
        setSessions(prev => prev.filter(session => session.is_current))

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

  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((a, b) => {
        if (a.is_current && !b.is_current) return -1
        if (!a.is_current && b.is_current) return 1
        return new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime()
      }),
    [sessions]
  )

  const currentSession = sortedSessions.find(session => session.is_current)
  const otherSessionsCount = sortedSessions.filter(session => session.is_current === false).length
  const lastSyncedLabel = lastSyncedAt ? format(new Date(lastSyncedAt), 'PPP p') : null

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
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold">Active Sessions</h3>
          <p className="text-sm text-muted-foreground">
            Review devices that are signed in to your account and revoke any session you do not recognize.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm font-medium text-foreground">
            {sortedSessions.length} active session{sortedSessions.length === 1 ? '' : 's'}
          </div>
          {lastSyncedLabel && (
            <p className="text-xs text-muted-foreground">Last synced {lastSyncedLabel}</p>
          )}
        </div>
      </div>

      {currentSession && (
        <div className="mb-4 rounded-xl border border-success/30 bg-success/5 px-4 py-3">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-success" />
            <div>
              <p className="text-sm font-semibold text-foreground">Current device protected</p>
              <p className="text-sm text-muted-foreground">
                This page stays signed in on{' '}
                <span className="font-medium text-foreground">
                  {getDeviceHeadline(normalizeDeviceInfo(currentSession.device_info))}
                </span>
                . Use “Terminate all other sessions” if you need to remove access everywhere else without interrupting the current device.
              </p>
            </div>
          </div>
        </div>
      )}

      {hasSessionAccessIssue && (
        <div className="mb-4 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning-foreground">
          Session details are temporarily unavailable. Your current session remains active.
        </div>
      )}

      {sortedSessions.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-foreground mb-2">No active sessions were found for this account.</p>
          <p className="text-sm text-foreground">Your current device will appear here after your next authenticated refresh.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedSessions.map((session) => {
            const deviceInfo = normalizeDeviceInfo(session.device_info)
            const headline = getDeviceHeadline(deviceInfo)
            const meta = getDeviceMeta(deviceInfo, session.ip_address)

            return (
              <div
                key={session.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  session.is_current ? 'bg-success/5 border-success/30' : 'bg-muted border-border'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">{getDeviceIcon(deviceInfo)}</span>
                  <div>
                    <div className="flex items-center space-x-2">
                      <p className="font-medium text-sm">
                        {headline}
                        {session.is_current && (
                          <span className="ml-2 px-2 py-1 bg-accent/10 text-accent-foreground text-xs rounded-full">
                            Current session
                          </span>
                        )}
                      </p>
                    </div>
                    <p className="text-xs text-foreground">
                      {meta ? `${meta} • ` : ''}
                      Signed in {formatDistanceToNow(new Date(session.created_at), { addSuffix: true })} •{' '}
                      Last active {formatDistanceToNow(new Date(session.last_activity), { addSuffix: true })}
                    </p>
                  </div>
                </div>

                {session.is_current === false && (
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
        {otherSessionsCount > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleTerminateAllOtherSessions}
            disabled={terminatingAll || otherSessionsCount === 0}
            className="w-full"
          >
            {terminatingAll ? 'Terminating All...' : 'Terminate All Other Sessions'}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={loadSessions}
          disabled={loading}
          className="w-full"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh Sessions
        </Button>
      </div>
    </Card>
  )
}
