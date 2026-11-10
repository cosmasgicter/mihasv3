/**
 * The one communications history: what the platform sent, and what happened.
 *
 * Admissions-v2 task 10.1 — R13.4, R13.8; findings **STU-14**, **STU-24**.
 *
 * This page is the merge R13.8 asks for. Before 10.1 there were two inboxes: this
 * one (filters + paging) and a second, unfiltered one embedded in
 * `/student/notifications` underneath three read-only preference tiles. Both
 * listed the same rows with different actions. `/student/notifications` is now
 * preferences only, and this is the single inbox/history — which is also what the
 * mobile navigation now points at.
 *
 * What the page gained with the merge is the thing R13.4 actually asks for:
 * every message states **delivery state per channel**, and a terminally failed
 * email offers the platform's own retry command. The vocabulary and the retry
 * ceiling are read from the published preference schema, so a label here cannot
 * mean something different from what the server meant.
 *
 * STU-24: the page title comes from resolved tenant context (`usePortalBrand`),
 * not from a hardcoded platform string. The page states no support address of its
 * own — the support affordance belongs to the preferences screen it links to,
 * where it is resolved through 8.3's `resolveTenantSupportContact`. Naming a
 * second one here would be a second answer to "who does a student contact".
 */

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
 Settings,
 Trash2,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Seo } from '@/components/seo/Seo'
import { PageShell } from '@/components/ui/PageShell'
import { SectionCard } from '@/components/ui/SectionCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { Button } from '@/components/ui/Button'
import { useCommunications, type CommunicationsFilters } from '@/hooks/useCommunications'
import { useNotificationPreferenceSchema } from '@/hooks/useNotificationPreferenceSchema'
import { usePortalBrand } from '@/hooks/usePortalBrand'
import { brandedPageTitle } from '@/lib/tenantBrandCopy'
import { MessageDeliveryState } from '@/components/student/communications/MessageDeliveryState'
import { normalizeNotificationContent, notificationService } from '@/services/notifications'
import { type CommunicationMessage } from '@/lib/notificationPreferences'
import { formatRelative } from '@/lib/dateFormat'
import { isSafeNavigationUrl } from '@/lib/urlSafety'
import { pathFor } from '@/routes/routeRegistry'// ─── Type indicator config ───

type NotificationType = 'info' | 'success' | 'warning' | 'error'

const TYPE_CONFIG: Record<NotificationType, { icon: React.ReactNode; color: string; label: string }> = {
  info: {
    icon: <Info className="h-4 w-4" />,
    color: 'bg-blue-100 text-blue-700',
    label: 'Info',
  },
  success: {
    icon: <CheckCircle className="h-4 w-4" />,
    color: 'bg-green-100 text-green-700',
    label: 'Success',
  },
  warning: {
    icon: <AlertTriangle className="h-4 w-4" />,
    color: 'bg-amber-100 text-amber-700',
    label: 'Warning',
  },
  error: {
    icon: <XCircle className="h-4 w-4" />,
    color: 'bg-red-100 text-red-700',
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
 const { brandName } = usePortalBrand()
 const [typeFilter, setTypeFilter] = useState('')
  const [readFilter, setReadFilter] = useState('')
  const [page, setPage] = useState(1)
  const [deleteError, setDeleteError] = useState<string | null>(null)
 const [retryingId, setRetryingId] = useState<string | null>(null)
 const [retryErrors, setRetryErrors] = useState<Record<string, string>>({})
 const [retryNotices, setRetryNotices] = useState<Record<string, string>>({})

 const filters: CommunicationsFilters = {
    page,
    pageSize: 20,
    ...(typeFilter ? { type: typeFilter as NotificationType } : {}),
    ...(readFilter ? { is_read: readFilter === 'true' } : {}),
  }

  const { notifications, isLoading, error, pagination, refetch } = useCommunications(filters)
 // The delivery-state vocabulary lives on the schema surface, not on every page
 // of this list, so the read is shared with the settings screen.
 const { schema } = useNotificationPreferenceSchema()

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

 /**
 * R13.4's retry, as a command.
 *
 * The success wording is deliberately "queued again" rather than "sent": the
 * server writes a durable outbox row and dispatches on commit, so at this
 * moment nothing has been delivered yet. Claiming delivery here would be the
 * phantom-progress defect this spec keeps finding elsewhere.
 */
 const handleRetry = useCallback(
 async (messageId: string) => {
 setRetryingId(messageId)
 setRetryErrors((prev) => {
 const { [messageId]: _removed, ...rest } = prev
 return rest
 })
 try {
 const result = await notificationService.retryDelivery(messageId)
 setRetryNotices((prev) => ({
 ...prev,
 [messageId]: `Queued again — attempt ${result?.attempts ?? 2}.`,
 }))
 invalidate()
 } catch (err) {
 setRetryErrors((prev) => ({
 ...prev,
 [messageId]:
 err instanceof Error && err.message
 ? err.message
 : 'That message could not be queued again.',
 }))
 } finally {
 setRetryingId(null)
 }
 },
 [invalidate],
 )

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
        title={brandedPageTitle('Communications', brandName)}
        description="Every message this platform has sent you, and what happened to it."
        path={pathFor('student.communications')}
 siteName={brandName}
 noindex
      />
      <PageShell
        title="Communications"
        subtitle="Every message we have sent you, and what happened to it."
        eyebrow="Inbox"
        tone="student"/*
 No `metrics`row (task 11.5, R16.5). The four tiles here restated the
 inbox itself: a total the list states by existing, an unread count the
 rows already carry as unread styling and an aria label, the current
 page number from the pagination control at the foot of the same page,
 and a "State"tile reading the page's own loading/error state.
 */
        actions={
 <div className="flex flex-wrap gap-2">
 {hasUnread && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllReadMutation.mutate()}
              loading={markAllReadMutation.isPending}
            >
              <CheckCheck className="h-4 w-4" />
              Mark all read
 </Button>
 )}
 <Button asChild variant="outline" size="sm" className="min-h-touch">
 <Link to={pathFor('student.notifications')} data-testid="open-notification-settings">
 <Settings className="h-4 w-4"/>
 Notification settings
 </Link>
 </Button>
 </div>
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
              <label className="flex flex-col gap-1 text-base sm:text-sm">
                <span className="font-medium text-muted-foreground">Type</span>
                <select
                  value={typeFilter}
                  onChange={handleTypeChange}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-base sm:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-base sm:text-sm">
                <span className="font-medium text-muted-foreground">Status</span>
                <select
                  value={readFilter}
                  onChange={handleReadChange}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-base sm:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
                      className={`group flex flex-wrap items-start gap-3 px-4 py-4 min-h-[60px] transition-colors ${
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
                          <p className={`text-base sm:text-sm ${!isRead ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground'}`}>
                            {title}
                          </p>
                          {!isRead && (
                            <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
                          )}
                        </div>
                        <p className="mt-0.5 text-base sm:text-sm text-muted-foreground line-clamp-2">
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

 {/* R13.4: delivery state and channel travel with the message.
 Outside the clickable region so a retry is never a
 mark-as-read by accident. */}
 <div className="w-full order-last basis-full">
 <MessageDeliveryState
 message={notification as unknown as CommunicationMessage}
 schema={schema}
 onRetry={handleRetry}
 isRetrying={retryingId === id}
 retryError={retryErrors[id] ?? null}
 retryNotice={retryNotices[id] ?? null}
 />
 </div>

 {/* Delete action */}
                      <button
                        type="button"
                        onClick={() => deleteMutation.mutate(id)}
                        disabled={deleteMutation.isPending}
                        className="mt-1 shrink-0 rounded-lg p-2 min-h-touch min-w-touch flex items-center justify-center text-muted-foreground sm:opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
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
              <p className="text-base sm:text-sm text-muted-foreground">
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
