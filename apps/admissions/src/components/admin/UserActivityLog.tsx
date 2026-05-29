import React, { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { adminAuditService, type AuditLogEntry } from '@/services/admin/audit'
import { sanitizeForLog } from '@/lib/sanitize'
import { formatTimestamp, formatDistanceFromNow } from '@/lib/dateFormat'
import {
  Activity,
  Calendar,
  Clock,
  Database,
  Globe,
  Search,
  Shield,
  User,
} from 'lucide-react'
import { logger } from '@/lib/logger'

interface UserActivityLogProps {
  userId?: string
  isOpen: boolean
  onClose: () => void
}

function formatEntityLabel(value?: string) {
  if (!value) {
    return 'Unknown'
  }

  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function stringifyPayload(value: unknown) {
  if (!value) {
    return ''
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function UserActivityLog({ userId, isOpen, onClose }: UserActivityLogProps) {
  const [activities, setActivities] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [dateFilter, setDateFilter] = useState('')

  useEffect(() => {
    if (!isOpen || !userId) {
      return
    }

    const loadActivities = async () => {
      try {
        setLoading(true)
        setError('')

        const response = await adminAuditService.list({
          userId,
          page: 1,
          pageSize: 100,
        })

        setActivities(response.entries)
      } catch (requestError: unknown) {
        const errorMessage =
          requestError instanceof Error ? requestError.message : 'Failed to load activity log'
        logger.error('Failed to load activity log:', sanitizeForLog(errorMessage))
        setError(errorMessage)
        setActivities([])
      } finally {
        setLoading(false)
      }
    }

    void loadActivities()
  }, [isOpen, userId])

  const filteredActivities = useMemo(() => {
    return activities.filter((activity) => {
      if (actionFilter) {
        const haystack = [activity.action, activity.category, activity.actorEmail, activity.actorName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        if (!haystack.includes(actionFilter.toLowerCase())) {
          return false
        }
      }

      if (dateFilter) {
        const activityDate = new Date(activity.createdAt).toDateString()
        const filterDateValue = new Date(dateFilter).toDateString()
        return activityDate === filterDateValue
      }

      return true
    })
  }, [actionFilter, activities, dateFilter])

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            User Activity Log
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 rounded-lg border border-border bg-muted/20 p-4 md:grid-cols-[minmax(0,1fr)_220px]">
          <Input
            label="Search activity"
            value={actionFilter}
            onChange={(event) => setActionFilter(event.target.value)}
            placeholder="role changed, login, update, permissions"
            icon={<Search className="h-4 w-4" />}
          />
          <Input
            label="Specific day"
            type="date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
            icon={<Calendar className="h-4 w-4" />}
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : null}

          {loading ? (
            <div className="space-y-4 py-6">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-start gap-3 animate-pulse rounded-lg border border-border p-4">
                  <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
              <Activity className="mx-auto h-10 w-10 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold text-foreground">No linked activity found</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {actionFilter || dateFilter
                  ? 'No user activity matched the current filters.'
                  : 'No audit events are currently linked to this user.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredActivities.map((activity) => {
                const payloadText = stringifyPayload(activity.changes || activity.metadata)
                const relativeTime = (() => {
                  try {
                    return formatDistanceFromNow(new Date(activity.createdAt))
                  } catch {
                    return activity.createdAt
                  }
                })()

                const relationLabel =
                  activity.actorId === userId
                    ? 'Performed by this user'
                    : activity.targetId === userId
                      ? 'Targeted this user'
                      : 'Linked to this user'

                return (
                  <div key={activity.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                            {activity.category}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                            {relationLabel}
                          </span>
                        </div>

                        <h4 className="mt-3 text-base font-semibold text-foreground">{activity.action}</h4>

                        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-lg border border-border bg-muted/20 p-3">
                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              <User className="h-3.5 w-3.5" />
                              Actor
                            </div>
                            <p className="mt-1 text-sm font-medium text-foreground">
                              {activity.actorName || activity.actorEmail || 'System'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {activity.actorRoles?.[0]?.replace(/_/g, ' ') || 'system'}
                            </p>
                          </div>

                          <div className="rounded-lg border border-border bg-muted/20 p-3">
                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              <Database className="h-3.5 w-3.5" />
                              Target
                            </div>
                            <p className="mt-1 text-sm font-medium text-foreground">
                              {formatEntityLabel(activity.targetTable)}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{activity.targetId || 'No target id'}</p>
                          </div>

                          <div className="rounded-lg border border-border bg-muted/20 p-3">
                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              <Globe className="h-3.5 w-3.5" />
                              Request IP
                            </div>
                            <p className="mt-1 text-sm font-medium text-foreground">{activity.requestIp || 'Unavailable'}</p>
                          </div>

                          <div className="rounded-lg border border-border bg-muted/20 p-3">
                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              <Shield className="h-3.5 w-3.5" />
                              Time
                            </div>
                            <p className="mt-1 text-sm font-medium text-foreground">{relativeTime}</p>
                            <p className="text-xs text-muted-foreground">{formatTimestamp(activity.createdAt)}</p>
                          </div>
                        </div>

                        {payloadText ? (
                          <div className="mt-4">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Payload
                            </p>
                            <pre className="max-h-48 overflow-auto rounded-lg bg-foreground p-3 text-xs text-muted-foreground">
                              {payloadText}
                            </pre>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border pt-4">
          <div className="text-sm text-muted-foreground">
            {filteredActivities.length} of {activities.length} linked audit events
          </div>
          <Button onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
