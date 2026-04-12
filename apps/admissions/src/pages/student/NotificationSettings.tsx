import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { Seo } from '@/components/seo/Seo'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Skeleton, SkeletonCard } from '@/components/ui'
import { Container } from '@/components/ui/Container'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionCard } from '@/components/ui/SectionCard'
import { PageShell } from '@/components/ui/PageShell'
import { notificationService } from '@/services/notifications'
import { ArrowLeft, Bell, ExternalLink, MessageCircle, MessageSquare, RefreshCw, Trash2 } from 'lucide-react'
import PushNotificationSettings from '@/components/notifications/PushNotificationSettings'
import { staggerChild, animateClasses } from '@/lib/animations'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { useStudentNotifications } from '@/hooks/useStudentNotifications'
import { isSafeNavigationUrl } from '@/lib/urlSafety'
import { CACHE_CONFIG } from '@/hooks/queries/useQueryConfig'
import { useAuth } from '@/contexts/AuthContext'

type ChannelKey = 'sms' | 'push'

export interface NotificationPreferencesResponse {
  email_enabled: boolean
  push_enabled: boolean
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
  push_enabled: false,
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
  channel: ChannelKey
) {
  return channel === 'sms' ? preferences.sms_enabled : preferences.push_enabled
}

const CHANNEL_DETAILS: Record<ChannelKey, { title: string; description: string; Icon: React.ComponentType<{ className?: string }> }> = {
  sms: {
    title: 'SMS Alerts',
    description: 'Receive important application updates as text messages directly to your phone.',
    Icon: MessageSquare
  },
  push: {
    title: 'Browser Push Alerts',
    description: 'Receive browser push notifications on this device when you grant notification permission.',
    Icon: MessageCircle
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
  const { profile } = useProfileQuery()
  const queryClient = useQueryClient()
  const {
    notifications,
    unreadCount,
    loading: notificationsLoading,
    refresh: refreshNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    isSSEConnected,
    isPolling,
    connectionError,
    lastLoadedAt,
  } = useStudentNotifications()
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
  const inboxRefreshLabel = isSSEConnected
    ? 'Live push connection active'
    : isPolling
      ? 'Auto-refreshing every 30 seconds and when you return to the tab'
      : 'Manual refresh only'

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
      window.location.href = actionUrl
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
    const disableGrant = channel === 'sms' && !hasPhoneNumber && !optedIn
    const buttonLabel = optedIn ? 'Opt Out' : 'Opt In'
    const contactDetail = channel === 'sms'
      ? (contactPhone || 'No phone number on file')
      : 'Uses this browser or device after permission is granted'
    const channelSupportText = channel === 'sms'
      ? 'SMS uses the phone number on your profile.'
      : 'Push notifications also depend on your browser permission settings below.'

    return (
      <div
        key={channel}
        className={`bg-card rounded-2xl shadow-lg border border-border p-6 space-y-4 ${animateClasses.slideUp}`}
        style={staggerChild(channel === 'sms' ? 0 : 1, 100)}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-3 rounded-xl bg-primary/10 text-primary shadow-inner">
              <details.Icon className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{details.title}</h2>
              <p className="text-sm text-foreground">{details.description}</p>
            </div>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold ${
              optedIn ? 'bg-success/5 text-success border border-success/30' : 'bg-accent text-foreground border border-border'
            }`}
          >
            {optedIn ? 'Enabled' : 'Disabled'}
          </span>
        </div>

        <div className="space-y-2 text-sm text-foreground">
          <p className="text-foreground">{channelSupportText}</p>

          {disableGrant && (
            <div className="rounded-xl bg-accent/5 border border-yellow-200 px-4 py-3 text-xs text-yellow-700">
              <p className="font-medium">Add a valid phone number in your profile to enable this channel.</p>
              <p>
                <Link to="/student/settings" className="underline font-semibold text-accent-foreground">
                  Update contact information
                </Link>
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2 text-xs text-foreground">
            <span className="uppercase tracking-wide text-foreground font-semibold">
              {channel === 'sms' ? 'Current contact' : 'Current delivery target'}
            </span>
            <span className="text-sm text-foreground">{contactDetail}</span>
            {channel === 'sms' && (
              <span className="text-xs text-muted-foreground">{contactSourceLabel}</span>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3 pt-2 border-t border-border">
          <Button
            type="button"
            variant={optedIn ? 'outline' : 'primary'}
            loading={savingChannel === channel}
            disabled={savingChannel === channel || disableGrant}
            onClick={() => handleConsentChange(channel, !optedIn)}
          >
            {savingChannel === channel ? 'Saving…' : buttonLabel}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <Seo
        title="Notification Settings | MIHAS-KATC Admissions"
        description="Manage your notification preferences, SMS alerts, and browser push settings for your MIHAS-KATC admissions portal."
        path="/student/notifications"
        noindex
      />
    <PageShell
      title="Notification preferences and portal inbox"
      subtitle="In-app notifications stay available inside the portal. You can manage SMS and browser push delivery below."
    >
      <div className="space-y-6 sm:space-y-8">
        <div className="mb-6 sm:mb-8">
          <Link
            to="/student/settings"
            className="mb-4 inline-flex items-center font-medium text-primary transition-colors hover:text-primary/80"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to profile settings
          </Link>
        </div>

        {(error || preferencesErrorMessage) && (
          <div
            className={`rounded-xl bg-destructive/5 border border-destructive/30 p-4 sm:p-6 mb-6 shadow-lg ${animateClasses.slideUp}`}
          >
            <div className="flex items-center space-x-3">
              <div className="text-3xl">⚠️</div>
              <div className="text-error font-medium">{error || preferencesErrorMessage}</div>
            </div>
          </div>
        )}

        {success && (
          <div
            className={`rounded-xl bg-success/5 border border-success/30 p-4 sm:p-6 mb-6 shadow-lg ${animateClasses.slideUp}`}
          >
            <div className="flex items-center space-x-3">
              <div className="text-3xl">✅</div>
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
                <div className="rounded-2xl border border-border bg-muted/40 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current delivery number</p>
                  <p className="mt-2 text-sm font-semibold text-foreground break-words">
                    {contactPhone || 'No phone number on file'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{contactSourceLabel}</p>
                </div>
                <div className="rounded-2xl border border-border bg-muted/40 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Portal inbox refresh</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">{inboxRefreshLabel}</p>
                  {lastLoadedAt && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Last synced {formatTimestamp(lastLoadedAt)}
                    </p>
                  )}
                  {connectionError && (
                    <p className="mt-1 text-xs text-amber-700">{connectionError}</p>
                  )}
                </div>
                <div className="rounded-2xl border border-border bg-muted/40 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Always enabled</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">Portal inbox notifications</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    SMS and browser push preferences can be changed below.
                  </p>
                </div>
              </div>
            </SectionCard>

            <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {(['sms', 'push'] as ChannelKey[]).map(channel => renderChannelCard(channel))}
            </section>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <SectionCard
                title="Portal inbox"
                description="Important application, payment, and interview updates appear here even if you opt out of SMS or browser push delivery."
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
                    <p className="text-sm text-foreground">
                      The inbox refreshes when the page is active and whenever you return to this tab, so recent updates should appear here without a full page reload.
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-border bg-muted/50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Unread</p>
                    <p className="mt-1 text-2xl font-bold text-foreground">{unreadCount}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Total recent</p>
                    <p className="mt-1 text-2xl font-bold text-foreground">{notifications.length}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Phone source</p>
                    <p className="mt-1 text-sm font-semibold text-foreground break-words">{contactSourceLabel}</p>
                  </div>
                </div>

                {lastLoadedAt && (
                  <p className="text-xs text-muted-foreground">
                    Last inbox sync: {formatTimestamp(lastLoadedAt)}
                  </p>
                )}

                {notificationsLoading ? (
                  <div className="space-y-3 py-4" role="status" aria-label="Loading notifications">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="rounded-xl border border-border px-4 py-3 space-y-2">
                        <Skeleton className="h-4 w-3/5" />
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-1/3" />
                      </div>
                    ))}
                  </div>
                ) : notifications.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
                      <p className="font-medium text-foreground">No in-app notifications yet</p>
                    <p className="mt-1 text-sm text-foreground">Important updates will appear here as soon as they are sent. If you have just changed application state elsewhere, use refresh to pull the newest inbox items immediately.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {notifications.slice(0, 5).map(notification => (
                      <div
                        key={notification.id}
                        className={`rounded-xl border px-4 py-3 ${
                          notification.read
                            ? 'border-border bg-card'
                            : 'border-primary/20 bg-primary/5'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-foreground">{notification.title}</p>
                            <p className="mt-1 text-sm text-foreground">{notification.content}</p>
                          </div>
                          {!notification.read && (
                            <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-primary" aria-label="Unread notification" />
                          )}
                        </div>
                        <p className="mt-2 text-xs text-foreground">{formatTimestamp(notification.created_at) || 'Recently'}</p>
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

              <PushNotificationSettings />
            </section>
          </div>
        )}
      </div>
    </PageShell>
    </>
  )
}
