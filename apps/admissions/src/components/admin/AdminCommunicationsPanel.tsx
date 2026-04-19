import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  Clock,
  History,
  Info,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Send,
  ArrowRight,
  User,
  Inbox,
} from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { Button } from '@/components/ui/Button'
import {
  communicationsService,
  type PaginatedResponse,
  type TimelineEntry,
} from '@/services/communications'
import { notificationService } from '@/services/notifications'
import { formatRelative } from '@/lib/dateFormat'

// ─── Props ───

export interface AdminCommunicationsPanelProps {
  userId: string
  studentName: string
}

// ─── Notification type config ───

type NotificationType = 'info' | 'success' | 'warning' | 'error'

const TYPE_CONFIG: Record<NotificationType, { icon: React.ReactNode; color: string; label: string }> = {
  info: {
    icon: <Info className="h-4 w-4" aria-hidden="true" />,
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    label: 'Info',
  },
  success: {
    icon: <CheckCircle className="h-4 w-4" aria-hidden="true" />,
    color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    label: 'Success',
  },
  warning: {
    icon: <AlertTriangle className="h-4 w-4" aria-hidden="true" />,
    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    label: 'Warning',
  },
  error: {
    icon: <XCircle className="h-4 w-4" aria-hidden="true" />,
    color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    label: 'Error',
  },
}

function getTypeConfig(type: string | null | undefined) {
  if (type && type in TYPE_CONFIG) return TYPE_CONFIG[type as NotificationType]
  return TYPE_CONFIG.info
}

// ─── Status color mapping (reused from History page) ───

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-400',
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  under_review: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  waitlisted: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
}

const UNKNOWN_STATUS_COLOR = 'bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400'

function getStatusColor(status: string | null | undefined): string {
  if (!status) return UNKNOWN_STATUS_COLOR
  return STATUS_COLORS[status] ?? UNKNOWN_STATUS_COLOR
}

function formatStatus(status: string | null | undefined): string {
  if (!status) return 'Unknown'
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// ─── Type options for send form ───

const TYPE_OPTIONS: { value: NotificationType; label: string }[] = [
  { value: 'info', label: 'Info' },
  { value: 'success', label: 'Success' },
  { value: 'warning', label: 'Warning' },
  { value: 'error', label: 'Error' },
]

// ─── Pagination helper ───

function PaginationControls({
  page,
  totalPages,
  onPrev,
  onNext,
}: {
  page: number
  totalPages: number
  onPrev: () => void
  onNext: () => void
}) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between pt-3">
      <p className="text-xs text-muted-foreground">
        Page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="xs" disabled={page <= 1} onClick={onPrev}>
          Previous
        </Button>
        <Button variant="outline" size="xs" disabled={page >= totalPages} onClick={onNext}>
          Next
        </Button>
      </div>
    </div>
  )
}

// ─── Component ───

export default function AdminCommunicationsPanel({
  userId,
  studentName,
}: AdminCommunicationsPanelProps) {
  const queryClient = useQueryClient()

  // ─── Notification history state ───
  const [notifPage, setNotifPage] = useState(1)
  const PAGE_SIZE = 10

  const notifQuery = useQuery({
    queryKey: ['admin-notifications', userId, notifPage],
    queryFn: () =>
      communicationsService.listUserNotifications(userId, {
        page: notifPage,
        pageSize: PAGE_SIZE,
      }),
  })

  const notifData = notifQuery.data as PaginatedResponse<Record<string, unknown>> | undefined
  const notifications = notifData?.results ?? []
  const notifTotalPages = Math.max(
    1,
    Math.ceil((notifData?.totalCount ?? 0) / (notifData?.pageSize ?? PAGE_SIZE))
  )

  // ─── Timeline state ───
  const [timelinePage, setTimelinePage] = useState(1)

  const timelineQuery = useQuery({
    queryKey: ['admin-timeline', userId, timelinePage],
    queryFn: () =>
      communicationsService.listHistory({
        userId,
        page: timelinePage,
        pageSize: PAGE_SIZE,
      }),
  })

  const timelineData = timelineQuery.data as PaginatedResponse<TimelineEntry> | undefined
  const timelineEntries = timelineData?.results ?? []
  const timelineTotalPages = Math.max(
    1,
    Math.ceil((timelineData?.totalCount ?? 0) / (timelineData?.pageSize ?? PAGE_SIZE))
  )

  // ─── Send message form state ───
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [type, setType] = useState<NotificationType>('info')
  const [sendError, setSendError] = useState<string | null>(null)

  const sendMutation = useMutation({
    mutationFn: () =>
      notificationService.send({ to: userId, subject: title, message }),
    onMutate: async () => {
      setSendError(null)
      // Cancel outgoing refetches so they don't overwrite optimistic update
      await queryClient.cancelQueries({ queryKey: ['admin-notifications', userId] })

      // Snapshot previous data
      const previousData = queryClient.getQueryData(['admin-notifications', userId, notifPage])

      // Optimistic update: prepend the new notification to page 1
      if (notifPage === 1) {
        queryClient.setQueryData(
          ['admin-notifications', userId, 1],
          (old: PaginatedResponse<Record<string, unknown>> | undefined) => {
            if (!old) return old
            const optimisticNotification: Record<string, unknown> = {
              id: `optimistic-${Date.now()}`,
              title,
              message,
              type,
              is_read: false,
              created_at: new Date().toISOString(),
            }
            return {
              ...old,
              totalCount: old.totalCount + 1,
              results: [optimisticNotification, ...old.results],
            }
          }
        )
      }

      return { previousData }
    },
    onError: (_err, _vars, context) => {
      setSendError('Failed to send notification. Please try again.')
      // Rollback optimistic update
      if (context?.previousData) {
        queryClient.setQueryData(
          ['admin-notifications', userId, notifPage],
          context.previousData
        )
      }
    },
    onSuccess: () => {
      // Clear form on success
      setTitle('')
      setMessage('')
      setType('info')
      setSendError(null)
    },
    onSettled: () => {
      // Refetch to get real server data
      queryClient.invalidateQueries({ queryKey: ['admin-notifications', userId] })
    },
  })

  const handleSend = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!title.trim() || !message.trim()) return
      sendMutation.mutate()
    },
    [title, message, sendMutation]
  )

  return (
    <div className="space-y-6">
      {/* ─── Send Message Form ─── */}
      <SectionCard
        icon={<Send className="h-5 w-5" />}
        title={`Send Message to ${studentName}`}
        padding="sm"
      >
        <form onSubmit={handleSend} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted-foreground">Title</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={100}
                placeholder="Notification title"
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted-foreground">Type</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as NotificationType)}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-muted-foreground">Message</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              rows={3}
              maxLength={1000}
              placeholder="Write your message here..."
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          {sendError && (
            <ErrorDisplay
              message={sendError}
              variant="inline"
              onRetry={() => sendMutation.mutate()}
            />
          )}

          <div className="flex justify-end">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={sendMutation.isPending}
              disabled={!title.trim() || !message.trim()}
            >
              <Send className="h-4 w-4" />
              Send Notification
            </Button>
          </div>
        </form>
      </SectionCard>

      {/* ─── Two-column layout: Notifications + Timeline ─── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* ─── Notification History ─── */}
        <SectionCard
          icon={<Bell className="h-5 w-5" />}
          title={`Notifications${notifData ? ` (${notifData.totalCount})` : ''}`}
          padding="sm"
        >
          {notifQuery.error && (
            <ErrorDisplay
              title="Failed to load notifications"
              message={
                (notifQuery.error as Error).message ||
                'Something went wrong while fetching notification history.'
              }
              onRetry={() => notifQuery.refetch()}
              variant="inline"
            />
          )}

          {notifQuery.isLoading && !notifQuery.error && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-lg border border-border bg-card p-3">
                  <div className="h-3 w-1/3 rounded bg-muted" />
                  <div className="mt-2 h-2 w-2/3 rounded bg-muted" />
                </div>
              ))}
            </div>
          )}

          {!notifQuery.isLoading && !notifQuery.error && notifications.length === 0 && (
            <EmptyState
              icon={<Inbox className="h-10 w-10" />}
              heading="No notifications"
              description={`No notifications have been sent to ${studentName} yet.`}
            />
          )}

          {!notifQuery.isLoading && !notifQuery.error && notifications.length > 0 && (
            <>
              <ul className="divide-y divide-border/50" role="list">
                {notifications.map((notification) => {
                  const id = notification.id as string
                  const isOptimistic = typeof id === 'string' && id.startsWith('optimistic-')
                  const nType = notification.type as string | null
                  const nTitle = notification.title as string
                  const nMessage = notification.message as string
                  const createdAt = notification.created_at as string
                  const config = getTypeConfig(nType)

                  return (
                    <li key={id} className={`flex items-start gap-3 px-2 py-3${isOptimistic ? ' opacity-70' : ''}`}>
                      <div
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${config.color}`}
                        title={config.label}
                      >
                        {config.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{nTitle}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                          {nMessage}
                        </p>
                        <time
                          className="mt-1 block text-xs text-muted-foreground"
                          dateTime={createdAt}
                        >
                          {formatRelative(createdAt)}
                        </time>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <PaginationControls
                page={notifPage}
                totalPages={notifTotalPages}
                onPrev={() => setNotifPage((p) => Math.max(1, p - 1))}
                onNext={() => setNotifPage((p) => Math.min(notifTotalPages, p + 1))}
              />
            </>
          )}
        </SectionCard>

        {/* ─── Timeline ─── */}
        <SectionCard
          icon={<History className="h-5 w-5" />}
          title={`Activity Timeline${timelineData ? ` (${timelineData.totalCount})` : ''}`}
          padding="sm"
        >
          {timelineQuery.error && (
            <ErrorDisplay
              title="Failed to load timeline"
              message={
                (timelineQuery.error as Error).message ||
                'Something went wrong while fetching the activity timeline.'
              }
              onRetry={() => timelineQuery.refetch()}
              variant="inline"
            />
          )}

          {timelineQuery.isLoading && !timelineQuery.error && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-lg border border-border bg-card p-3">
                  <div className="h-3 w-1/4 rounded bg-muted" />
                  <div className="mt-2 h-2 w-1/2 rounded bg-muted" />
                </div>
              ))}
            </div>
          )}

          {!timelineQuery.isLoading && !timelineQuery.error && timelineEntries.length === 0 && (
            <EmptyState
              icon={<Clock className="h-10 w-10" />}
              heading="No activity"
              description={`No application activity found for ${studentName}.`}
            />
          )}

          {!timelineQuery.isLoading && !timelineQuery.error && timelineEntries.length > 0 && (
            <>
              <ul className="divide-y divide-border/50" role="list">
                {timelineEntries.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-3 px-2 py-3">
                    <div className="mt-0.5 flex shrink-0 items-center gap-1">
                      <span
                        className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${getStatusColor(entry.old_status)}`}
                      >
                        {formatStatus(entry.old_status)}
                      </span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                      <span className="sr-only">changed to</span>
                      <span
                        className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${getStatusColor(entry.new_status)}`}
                      >
                        {formatStatus(entry.new_status)}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      {entry.notes && (
                        <p className="text-xs text-foreground/80">{entry.notes}</p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <time
                          className="text-[10px] text-muted-foreground"
                          dateTime={entry.created_at}
                        >
                          {formatRelative(entry.created_at)}
                        </time>
                        {entry.changed_by_name && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                            <User className="h-2.5 w-2.5" />
                            {entry.changed_by_name}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                        {entry.application_number}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <PaginationControls
                page={timelinePage}
                totalPages={timelineTotalPages}
                onPrev={() => setTimelinePage((p) => Math.max(1, p - 1))}
                onNext={() => setTimelinePage((p) => Math.min(timelineTotalPages, p + 1))}
              />
            </>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
