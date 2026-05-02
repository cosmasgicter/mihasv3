import React, { useState, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  CheckCheck,
  ExternalLink,
  Filter,
  Inbox,
  Info,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Trash2,
} from 'lucide-react'
import { Seo } from '@/components/seo/Seo'
import { PageShell } from '@/components/ui/PageShell'
import { SectionCard } from '@/components/ui/SectionCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { Button } from '@/components/ui/Button'
import { useCommunications, type CommunicationsFilters } from '@/hooks/useCommunications'
import { normalizeNotificationContent, notificationService } from '@/services/notifications'
import { formatRelative } from '@/lib/dateFormat'
import { isSafeNavigationUrl } from '@/lib/urlSafety'

// ─── Type indicator config ───

type NotificationType = 'info' | 'success' | 'warning' | 'error'

const TYPE_CONFIG: Record<NotificationType, { icon: React.ReactNode; color: string; label: string }> = {
  info: {
    icon: <Info className="h-4 w-4" />,
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    label: 'Info',
  },
  success: {
    icon: <CheckCircle className="h-4 w-4" />,
    color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    label: 'Success',
  },
  warning: {
    icon: <AlertTriangle className="h-4 w-4" />,
    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    label: 'Warning',
  },
  error: {
    icon: <XCircle className="h-4 w-4" />,
    color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    label: 'Error',
  },
}

function getTypeConfig(type: string | null | undefined) {
  if (type && type in TYPE_CONFIG) return TYPE_CONFIG[type as NotificationType]
  return TYPE_CONFIG.info
}

// ─── Filter options ───

const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'info', label: 'Info' },
  { value: 'success', label: 'Success' },
  { value: 'warning', label: 'Warning' },
  { value: 'error', label: 'Error' },
]

const READ_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'false', label: 'Unread' },
  { value: 'true', label: 'Read' },
]

export default function Communications() {
  const queryClient = useQueryClient()
  const [typeFilter, setTypeFilter] = useState('')
  const [readFilter, setReadFilter] = useState('')
  const [page, setPage] = useState(1)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const filters: CommunicationsFilters = {
    page,
    pageSize: 20,
    ...(typeFilter ? { type: typeFilter as NotificationType } : {}),
    ...(readFilter ? { is_read: readFilter === 'true' } : {}),
  }

  const { notifications, isLoading, error, pagination, refetch } = useCommunications(filters)

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['communications'] })
    queryClient.invalidateQueries({ queryKey: ['student-notifications'] })
  }, [queryClient])

  // ─── Mutations ───

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationService.markRead(id),
    onSuccess: invalidate,
  })

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationService.markAllRead(),
    onSuccess: invalidate,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => notificationService.delete(id),
    onSuccess: invalidate,
    onError: () => {
      setDeleteError('Failed to delete notification. Please try again.')
    },
  })

  // ─── Handlers ───

  const handleNotificationClick = useCallback(
    (notification: Record<string, unknown>) => {
      if (!notification.is_read) {
        markReadMutation.mutate(notification.id as string)
      }
    },
    [markReadMutation]
  )

  const handleTypeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setTypeFilter(e.target.value)
    setPage(1)
  }, [])

  const handleReadChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setReadFilter(e.target.value)
    setPage(1)
  }, [])

  const totalPages = Math.max(1, Math.ceil(pagination.totalCount / pagination.pageSize))
  const hasUnread = notifications.some((n) => !n.is_read)

  return (
    <>
      <Seo
        title="Communications | MIHAS-KATC Admissions"
        description="View all your notifications and messages in one place."
        path="/student/communications"
        noindex
      />
      <PageShell
        title="Communications"
        subtitle="All your notifications and messages in one place."
        eyebrow="Inbox"
        tone="student"
        metrics={[
          { label: 'Messages', value: pagination.totalCount, helper: `${notifications.length} currently loaded` },
          { label: 'Unread', value: notifications.filter((n) => !n.is_read).length, helper: 'Messages needing attention' },
          { label: 'Page', value: `${page}/${totalPages}`, helper: 'Current inbox page' },
          { label: 'State', value: error ? 'Needs attention' : 'Ready', helper: error?.message || 'Your communication history is available' },
        ]}
        actions={
          hasUnread ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllReadMutation.mutate()}
              loading={markAllReadMutation.isPending}
            >
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-6">
          {/* Filter controls */}
          <SectionCard
            icon={<Filter className="h-5 w-5" />}
            title="Filters"
            padding="sm"
          >
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-muted-foreground">Type</span>
                <select
                  value={typeFilter}
                  onChange={handleTypeChange}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-muted-foreground">Status</span>
                <select
                  value={readFilter}
                  onChange={handleReadChange}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {READ_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </SectionCard>

          {/* Error state */}
          {deleteError && (
            <ErrorDisplay
              message={deleteError}
              onRetry={() => setDeleteError(null)}
            />
          )}
          {error && (
            <ErrorDisplay
              title="Failed to load communications"
              message={error.message || 'Something went wrong while fetching your notifications.'}
              onRetry={refetch}
            />
          )}

          {/* Loading state */}
          {isLoading && !error && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-lg border border-border bg-card p-4"
                >
                  <div className="h-4 w-1/3 rounded bg-muted" />
                  <div className="mt-2 h-3 w-2/3 rounded bg-muted" />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !error && notifications.length === 0 && (
            <EmptyState
              icon={<Inbox className="h-12 w-12" />}
              heading="No communications"
              description={
                typeFilter || readFilter
                  ? 'No notifications match your current filters. Try adjusting them.'
                  : "Nothing here yet — we'll let you know when there's something important."
              }
            />
          )}

          {/* Notification list */}
          {!isLoading && !error && notifications.length > 0 && (
            <SectionCard
              icon={<Bell className="h-5 w-5" />}
              title={`Notifications (${pagination.totalCount})`}
              padding="sm"
            >
              <ul className="divide-y divide-border/30" role="list">
                {notifications.map((notification) => {
                  const id = notification.id as string
                  const isRead = notification.is_read as boolean
                  const type = notification.type as string | null
                  const title = notification.title as string
                  const message = normalizeNotificationContent(notification.message as string)
                  const actionUrl = notification.action_url as string | null
                  const safeActionUrl = actionUrl && isSafeNavigationUrl(actionUrl) ? actionUrl : null
                  const createdAt = notification.created_at as string
                  const config = getTypeConfig(type)

                  return (
                    <li
                      key={id}
                      className={`group flex items-start gap-3 px-4 py-4 min-h-[60px] transition-colors ${
                        !isRead
                          ? 'bg-primary/5 border-l-2 border-primary'
                          : 'border-l-2 border-transparent hover:bg-muted/50'
                      }`}
                    >
                      {/* Type indicator */}
                      <div
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${config.color}`}
                        title={config.label}
                      >
                        {config.icon}
                      </div>

                      {/* Content */}
                      <div
                        className="min-w-0 flex-1 cursor-pointer"
                        onClick={() => handleNotificationClick(notification)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            handleNotificationClick(notification)
                          }
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <p className={`text-sm ${!isRead ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground'}`}>
                            {title}
                          </p>
                          {!isRead && (
                            <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
                          )}
                        </div>
                        <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
                          {message}
                        </p>
                        <div className="mt-1 flex items-center gap-3">
                          <time className="text-xs text-muted-foreground" dateTime={createdAt}>
                            {formatRelative(createdAt)}
                          </time>
                          {safeActionUrl && (
                            <a
                              href={safeActionUrl}
                              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="h-3 w-3" />
                              View details
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Delete action */}
                      <button
                        type="button"
                        onClick={() => deleteMutation.mutate(id)}
                        disabled={deleteMutation.isPending}
                        className="mt-1 shrink-0 rounded-lg p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground sm:opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                        aria-label={`Delete notification: ${title}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </SectionCard>
          )}

          {/* Pagination */}
          {!isLoading && !error && totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {pagination.page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </PageShell>
    </>
  )
}
