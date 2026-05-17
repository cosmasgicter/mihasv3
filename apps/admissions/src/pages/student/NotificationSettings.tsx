import React, { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Seo } from '@/components/seo/Seo'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Skeleton, SkeletonCard } from '@/components/ui'
import { SectionCard } from '@/components/ui/SectionCard'
import { PageShell } from '@/components/ui/PageShell'
import { notificationService } from '@/services/notifications'
import { AlertTriangle, ArrowLeft, Bell, CheckCircle2, ExternalLink, MessageSquare, RefreshCw, Trash2 } from 'lucide-react'
import { staggerChild, animateClasses } from '@/lib/animations'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { useNotificationPolling } from '@/hooks/useNotificationPolling'
import { isSafeNavigationUrl } from '@/lib/urlSafety'
import { CACHE_CONFIG } from '@/hooks/queries/useQueryConfig'
import { useAuth } from '@/contexts/AuthContext'

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

const CHANNEL_DETAILS: Record<ChannelKey, { title: string; description: string; Icon: React.ComponentType<{ className?: string }> }> = {
  sms: {
    title: 'SMS Alerts — Coming Soon',
    description: 'SMS delivery is not yet available. This feature is planned for a future release.',
    Icon: MessageSquare
  }
}

function formatTimestamp(timestamp?: string | null) {
  if (!timestamp) {
    return null
  }

  try {
    return format(new Date(timestamp), 'PPP p')
  } catch (error) {
    console.error('Failed to format timestamp:', error)
    return timestamp
  }
}

export default function NotificationSettings() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { profile } = useProfileQuery()
  const queryClient = useQueryClient()
  const {
    notifications,
    unreadCount,
    isLoading: notificationsLoading,
    refresh: refreshNotifications,
    markRead: markAsRead,
    markAllRead: markAllAsRead,
    deleteNotification,
  } = useNotificationPolling()
  const [savingChannel, setSavingChannel] = useState<ChannelKey | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
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
  const hasPhoneNumber = Boolean(contactPhone?.trim())
  const contactSourceLabel = profile?.phone?.trim()
    ? 'Using your profile phone number'
    : 'No phone number connected yet'
  const inboxRefreshLabel = 'Auto-refreshing every 60 seconds and when you return to the tab'

  const handleConsentChange = async (channel: ChannelKey, enable: boolean) => {
    setSavingChannel(channel)
    setError(null)
    setSuccess(null)

    try {
      const response = await notificationService.updatePreferences({
        [`${channel}_enabled`]: enable
      }) as Partial<NotificationPreferencesResponse> | null

      queryClient.setQueryData<NotificationPreferencesResponse>(
        preferenceQueryKey,
        normalizeNotificationPreferences(response)
      )

      setSuccess(enable ? `${CHANNEL_DETAILS[channel].title} enabled.` : `${CHANNEL_DETAILS[channel].title} disabled.`)
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Failed to update consent preferences'
      setError(message)
    } finally {
      setSavingChannel(null)
    }
  }

  const handleNotificationOpen = async (notificationId: string, actionUrl?: string) => {
    try {
      await markAsRead(notificationId)
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Failed to mark notification as read'
      setError(message)
      return
    }

    if (actionUrl && isSafeNavigationUrl(actionUrl)) {
      navigate(actionUrl)
    }
  }

  const handleNotificationDelete = async (notificationId: string) => {
    try {
      await deleteNotification(notificationId)
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Failed to delete notification'
      setError(message)
    }
  }

  const handleMarkAllRead = async () => {
    try {
      setError(null)
      await markAllAsRead()
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Failed to mark all notifications as read'
      setError(message)
    }
  }



  const renderChannelCard = (channel: ChannelKey) => {
    const details = CHANNEL_DETAILS[channel]
    const optedIn = isNotificationChannelEnabled(preferences, channel)
    const disableGrant = !hasPhoneNumber && !optedIn
    const buttonLabel = optedIn ? 'Opt Out' : 'Opt In'
    const contactDetail = contactPhone || 'No phone number on file'

    return (
      <div
        key={channel}
        className={`bg-card rounded-lg shadow-sm border border-border p-6 space-y-4 ${animateClasses.slideUp}`}
        style={staggerChild(0, 100)}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-3 text-primary">
              <details.Icon className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{details.title}</h2>
              <p className="text-sm text-muted-foreground">{details.description}</p>
            </div>
          </div>
          <span
            className={`rounded-md px-3 py-1 text-xs font-semibold ${
              optedIn ? 'bg-success/5 text-success border border-success/30' : 'bg-accent text-foreground border border-border'
            }`}
          >
            {optedIn ? 'Enabled' : 'Disabled'}
          </span>
        </div>

        <div className="space-y-2 text-sm text-muted-foreground">
          <p>SMS uses the phone number on your profile.</p>

          {disableGrant && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-xs text-yellow-800">
              <p className="font-medium">Add a valid phone number in your profile to enable this channel.</p>
              <p>
                <Link to="/student/settings" className="underline font-semibold text-accent-foreground">
                  Update contact information
                </Link>
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2 text-xs">
            <span className="uppercase tracking-wide text-muted-foreground font-semibold">
              Current contact
            </span>
            <span className="text-sm text-foreground">{contactDetail}</span>
            <span className="text-xs text-muted-foreground">{contactSourceLabel}</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-border">
          <span className="text-xs text-muted-foreground">
            Coming soon — SMS delivery is not yet available
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={false}
            disabled
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 bg-muted`}
          >
            <span
              className="pointer-events-none inline-block h-5 w-5 rounded-full bg-card shadow-lg ring-0 transition-transform duration-200 ease-in-out translate-x-0"
            />
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <Seo
        title="Notification Settings | MIHAS-KATC Admissions"
        description="Manage your notification preferences and SMS alerts for your MIHAS-KATC admissions portal."
        path="/student/notifications"
        noindex
      />
    <PageShell
      title="Notification preferences and portal inbox"
      subtitle="In-app notifications stay available inside the portal. You can manage SMS delivery below."
      eyebrow="Notifications"
      tone="student"
      metrics={[
        { label: 'Inbox items', value: notifications.length, helper: 'Latest portal notifications on this page' },
        { label: 'SMS consent', value: 'Coming soon', helper: 'SMS delivery is planned for a future release' },
        { label: 'Contact source', value: contactSourceLabel, helper: contactPhone || 'No phone number on file' },
        { label: 'State', value: loading ? 'Loading' : (error || preferencesErrorMessage) ? 'Needs attention' : 'Ready', helper: error || preferencesErrorMessage || success || 'Notification controls are available' },
      ]}
    >
      <div className="space-y-6 sm:space-y-8">
        <div className="mb-6 sm:mb-8">
          <Link
            to="/student/settings"
            className="mb-4 inline-flex min-h-[44px] items-center rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to profile settings
          </Link>
        </div>

        {(error || preferencesErrorMessage) && (
          <div
            className={`mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:p-5 ${animateClasses.slideUp}`}
          >
            <div className="flex items-center space-x-3">
              <AlertTriangle className="h-5 w-5 flex-shrink-0 text-destructive" />
              <div className="text-error font-medium">{error || preferencesErrorMessage}</div>
            </div>
          </div>
        )}

        {success && (
          <div
            className={`mb-6 rounded-lg border border-success/30 bg-success/5 p-4 sm:p-5 ${animateClasses.slideUp}`}
          >
            <div className="flex items-center space-x-3">
              <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-success" />
              <div className="text-success font-medium">{success}</div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-6" role="status" aria-label="Loading notification preferences">
            <SkeletonCard />
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <SkeletonCard />
              <SkeletonCard />
            </div>
            <SkeletonCard />
            <span className="sr-only">Loading notification preferences</span>
          </div>
        ) : (
          <div className="space-y-6">
            <SectionCard
              title="Delivery overview"
              description="Review which number is used for messaging and how the in-app inbox currently refreshes."
              icon={<Bell className="h-5 w-5" />}
            >
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current delivery number</p>
                  <p className="mt-2 text-sm font-semibold text-foreground break-words">
                    {contactPhone || 'No phone number on file'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{contactSourceLabel}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Portal inbox refresh</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">{inboxRefreshLabel}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Always enabled</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">Portal inbox notifications</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    SMS delivery preferences can be changed below.
                  </p>
                </div>
              </div>
            </SectionCard>

            <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {(['sms'] as ChannelKey[]).map(channel => renderChannelCard(channel))}
            </section>

            <section>
              <SectionCard
                title="Portal inbox"
                description="Important application, payment, and interview updates appear here even if you opt out of SMS delivery."
                icon={<Bell className="h-5 w-5" />}
                className={animateClasses.slideUp}
                actions={
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => refreshNotifications()}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Refresh
                    </Button>
                    {unreadCount > 0 && (
                      <Button type="button" onClick={handleMarkAllRead}>
                        Mark all read
                      </Button>
                    )}
                  </div>
                }
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      The inbox refreshes when the page is active and whenever you return to this tab.
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unread</p>
                    <p className="mt-1 text-2xl font-bold text-foreground">{unreadCount}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total recent</p>
                    <p className="mt-1 text-2xl font-bold text-foreground">{notifications.length}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Phone source</p>
                    <p className="mt-1 text-sm font-semibold text-foreground break-words">{contactSourceLabel}</p>
                  </div>
                </div>

                {notificationsLoading ? (
                  <div className="space-y-3 py-4" role="status" aria-label="Loading notifications">
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
                      <p className="font-medium text-foreground">No in-app notifications yet</p>
                    <p className="mt-1 text-sm text-muted-foreground">Important updates will appear here as soon as they are sent. Use refresh to pull the newest inbox items.</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {notifications.map(notification => (
                      <div
                        key={notification.id}
                        className={`min-h-[60px] rounded-lg px-4 py-3 transition-colors ${
                          notification.read
                            ? 'bg-transparent hover:bg-muted/50'
                            : 'bg-primary/5 border-l-2 border-primary hover:bg-primary/10'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-foreground">{notification.title}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{notification.content}</p>
                          </div>
                          {!notification.read && (
                            <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-primary" aria-label="Unread notification" />
                          )}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{formatTimestamp(notification.created_at) || 'Recently'}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {!notification.read && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleNotificationOpen(notification.id)}
                            >
                              Mark as read
                            </Button>
                          )}
                          {notification.action_url && isSafeNavigationUrl(notification.action_url) && (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleNotificationOpen(notification.id, notification.action_url)}
                            >
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Open update
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleNotificationDelete(notification.id)}
                            className="text-destructive hover:bg-destructive/5"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

            </section>
          </div>
        )}
      </div>
    </PageShell>
    </>
  )
}
