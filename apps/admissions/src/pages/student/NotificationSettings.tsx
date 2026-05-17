import React, { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Seo } from '@/components/seo/Seo'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Skeleton, SkeletonCard } from '@/components/ui'
import { SectionCard } from '@/components/ui/SectionCard'
import { PageShell } from '@/components/ui/PageShell'
import { Banner } from '@/components/ui/Banner'
import { useToastStore } from '@/components/ui/Toast'
import { notificationService } from '@/services/notifications'
import { AlertTriangle, ArrowLeft, Bell, CheckCircle2, ExternalLink, MessageSquare, RefreshCw, Trash2 } from 'lucide-react'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { useNotificationPolling } from '@/hooks/useNotificationPolling'
import { isSafeNavigationUrl } from '@/lib/urlSafety'
import { CACHE_CONFIG } from '@/hooks/queries/useQueryConfig'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

type ChannelKey = 'sms'

export interface NotificationPreferencesResponse {
  email_enabled: boolean
  sms_enabled: boolean
  application_updates: boolean | null
  payment_reminders: boolean | null
  interview_reminders: boolean | null
  marketing_emails: boolean | null
  quiet_hours_start: string | null
  quiet_hours_end: string | null
  timezone: string | null
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferencesResponse = {
  email_enabled: true,
  sms_enabled: false,
  application_updates: null,
  payment_reminders: null,
  interview_reminders: null,
  marketing_emails: null,
  quiet_hours_start: null,
  quiet_hours_end: null,
  timezone: null,
}

export function normalizeNotificationPreferences(
  preferences: Partial<NotificationPreferencesResponse> | null | undefined
): NotificationPreferencesResponse {
  return {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...(preferences ?? {}),
  }
}

export function isNotificationChannelEnabled(
  preferences: NotificationPreferencesResponse,
  _channel: ChannelKey
) {
  return preferences.sms_enabled
}

function formatTimestamp(timestamp?: string | null) {
  if (!timestamp) return null
  try {
    const d = new Date(timestamp)
    if (Number.isNaN(d.getTime())) return timestamp
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return timestamp
  }
}

export default function NotificationSettings() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { profile } = useProfileQuery()
  const queryClient = useQueryClient()
  const toast = useToastStore()
  const {
    notifications,
    unreadCount,
    isLoading: notificationsLoading,
    refresh: refreshNotifications,
    markRead: markAsRead,
    markAllRead: markAllAsRead,
    deleteNotification,
  } = useNotificationPolling()
  const [error, setError] = useState<string | null>(null)
  const [successBanner, setSuccessBanner] = useState<string | null>(null)
  const preferenceQueryKey = useMemo(() => ['notification_preferences', user?.id] as const, [user?.id])

  const {
    data: preferences = DEFAULT_NOTIFICATION_PREFERENCES,
    isLoading: loading,
    error: preferencesError,
  } = useQuery<NotificationPreferencesResponse>({
    queryKey: preferenceQueryKey,
    queryFn: async (): Promise<NotificationPreferencesResponse> => {
      const response = await notificationService.getPreferences() as Partial<NotificationPreferencesResponse> | null
      return normalizeNotificationPreferences(response)
    },
    enabled: Boolean(user?.id),
    ...CACHE_CONFIG.realtime,
  })

  const preferencesErrorMessage = preferencesError instanceof Error ? preferencesError.message : preferencesError ? 'Failed to load notification preferences' : null

  const contactPhone = profile?.phone?.trim() || null
  const hasPhoneNumber = Boolean(contactPhone)

  const handleNotificationOpen = async (notificationId: string, actionUrl?: string) => {
    try {
      await markAsRead(notificationId)
    } catch {
      setError('Failed to mark notification as read')
      return
    }
    if (actionUrl && isSafeNavigationUrl(actionUrl)) {
      navigate(actionUrl)
    }
  }

  const handleNotificationDelete = async (notificationId: string) => {
    try {
      await deleteNotification(notificationId)
    } catch {
      setError('Failed to delete notification')
    }
  }

  const handleMarkAllRead = async () => {
    try {
      setError(null)
      await markAllAsRead()
      toast.success('All notifications marked as read')
    } catch {
      setError('Failed to mark all notifications as read')
    }
  }

  return (
    <>
      <Seo
        title="Notification Settings | MIHAS-KATC Admissions"
        description="Manage your notification preferences for your MIHAS-KATC admissions portal."
        path="/student/notifications"
        noindex
      />
      <PageShell
        title="Notifications"
        subtitle="Manage your notification preferences and view recent updates."
        eyebrow="Settings"
        tone="student"
      >
        <div className="space-y-6">
          <Link
            to="/student/settings"
            className="inline-flex min-h-touch items-center rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
            Back to settings
          </Link>

          {(error || preferencesErrorMessage) && (
            <Banner variant="danger" dismissible onDismiss={() => setError(null)}>
              {error || preferencesErrorMessage}
            </Banner>
          )}

          {successBanner && (
            <Banner variant="success" dismissible onDismiss={() => setSuccessBanner(null)}>
              {successBanner}
            </Banner>
          )}

          {loading ? (
            <div className="space-y-6" role="status" aria-label="Loading notification preferences">
              <SkeletonCard />
              <SkeletonCard />
              <span className="sr-only">Loading notification preferences</span>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Channel preferences */}
              <SectionCard
                title="Delivery channels"
                description="Control how you receive notifications. In-app notifications are always enabled."
                icon={<Bell className="h-5 w-5" />}
              >
                <div className="space-y-4">
                  {/* In-app — always on */}
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Bell className="h-5 w-5 text-primary" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-medium text-foreground">In-app notifications</p>
                        <p className="text-xs text-muted-foreground">Always enabled. Updates appear in your notification bell.</p>
                      </div>
                    </div>
                    <span className="rounded-md px-2.5 py-1 text-xs font-semibold bg-success/10 text-success border border-success/20">
                      Always on
                    </span>
                  </div>

                  {/* Email — always on */}
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Bell className="h-5 w-5 text-primary" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-medium text-foreground">Email notifications</p>
                        <p className="text-xs text-muted-foreground">Important updates are sent to your registered email.</p>
                      </div>
                    </div>
                    <span className="rounded-md px-2.5 py-1 text-xs font-semibold bg-success/10 text-success border border-success/20">
                      Always on
                    </span>
                  </div>

                  {/* SMS — coming soon */}
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <MessageSquare className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-medium text-foreground">SMS alerts</p>
                        <p className="text-xs text-muted-foreground">
                          {hasPhoneNumber
                            ? 'SMS delivery is planned for a future release.'
                            : 'Add a phone number in your profile to enable SMS when available.'}
                        </p>
                      </div>
                    </div>
                    <span className="rounded-md px-2.5 py-1 text-xs font-semibold bg-muted text-muted-foreground border border-border">
                      Coming soon
                    </span>
                  </div>
                </div>
              </SectionCard>

              {/* Inbox */}
              <SectionCard
                title="Recent notifications"
                description="Application, payment, and interview updates appear here."
                icon={<Bell className="h-5 w-5" />}
                actions={
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => refreshNotifications()} className="min-h-touch">
                      <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                      Refresh
                    </Button>
                    {unreadCount > 0 && (
                      <Button type="button" size="sm" onClick={handleMarkAllRead} className="min-h-touch">
                        Mark all read
                      </Button>
                    )}
                  </div>
                }
              >
                <p className="text-xs text-muted-foreground mb-4">
                  Auto-refreshes every 60 seconds and when you return to this tab.
                  {unreadCount > 0 && ` ${unreadCount} unread.`}
                </p>

                {notificationsLoading ? (
                  <div className="space-y-3" role="status" aria-label="Loading notifications">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="space-y-2 rounded-lg border border-border px-4 py-3">
                        <Skeleton className="h-4 w-3/5" />
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-1/3" />
                      </div>
                    ))}
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
                    <Bell className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" aria-hidden="true" />
                    <p className="font-medium text-foreground text-sm">No notifications yet</p>
                    <p className="mt-1 text-xs text-muted-foreground">Important updates will appear here as they are sent.</p>
                  </div>
                ) : (
                  <div className="space-y-1 -mx-2">
                    {notifications.map(notification => (
                      <div
                        key={notification.id}
                        className={cn(
                          'min-h-[60px] rounded-lg px-4 py-3 transition-colors',
                          notification.read
                            ? 'hover:bg-muted/40'
                            : 'bg-primary/5 border-l-2 border-primary hover:bg-primary/10'
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className={cn('text-sm', !notification.read ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground')}>
                              {notification.title}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{notification.content}</p>
                            <p className="mt-1.5 text-[11px] text-muted-foreground/70">{formatTimestamp(notification.created_at) || 'Recently'}</p>
                          </div>
                          {!notification.read && (
                            <span className="mt-1 inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {!notification.read && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="min-h-touch"
                              onClick={() => handleNotificationOpen(notification.id)}
                            >
                              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                              Mark read
                            </Button>
                          )}
                          {notification.action_url && isSafeNavigationUrl(notification.action_url) && (
                            <Button
                              type="button"
                              size="sm"
                              className="min-h-touch"
                              onClick={() => handleNotificationOpen(notification.id, notification.action_url)}
                            >
                              <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                              Open
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="min-h-touch text-destructive hover:bg-destructive/5"
                            onClick={() => handleNotificationDelete(notification.id)}
                          >
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>
          )}
        </div>
      </PageShell>
    </>
  )
}
