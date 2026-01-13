import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { notificationService } from '@/services/notifications'
import { ArrowLeft, MessageCircle, MessageSquare } from 'lucide-react'
import PushNotificationSettings from '@/components/notifications/PushNotificationSettings'

type ChannelKey = 'sms' | 'whatsapp'

interface ChannelPreference {
  type: string
  enabled: boolean
  priority: number
}

interface NotificationPreferencesResponse {
  channels: ChannelPreference[]
  optimalTiming: boolean
  frequency: string
  sms_opt_in_at: string | null
  sms_opt_in_source: string | null
  sms_opt_in_actor: string | null
  sms_opt_out_at: string | null
  sms_opt_out_source: string | null
  sms_opt_out_actor: string | null
  sms_opt_out_reason: string | null
  whatsapp_opt_in_at: string | null
  whatsapp_opt_in_source: string | null
  whatsapp_opt_in_actor: string | null
  whatsapp_opt_out_at: string | null
  whatsapp_opt_out_source: string | null
  whatsapp_opt_out_actor: string | null
  whatsapp_opt_out_reason: string | null
  phone?: string | null
}

const CHANNEL_DETAILS: Record<ChannelKey, { title: string; description: string; Icon: React.ComponentType<{ className?: string }> }> = {
  sms: {
    title: 'SMS Alerts',
    description: 'Receive important application updates as text messages directly to your phone.',
    Icon: MessageSquare
  },
  whatsapp: {
    title: 'WhatsApp Updates',
    description: 'Get real-time WhatsApp messages when there are changes to your application status.',
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

function resolveChannelEntry(preferences: NotificationPreferencesResponse | null, channel: ChannelKey) {
  const entry = preferences?.channels?.find(item => item.type === channel)
  return entry ?? { type: channel, enabled: false, priority: channel === 'sms' ? 2 : 3 }
}

function isChannelOptedIn(preferences: NotificationPreferencesResponse | null, channel: ChannelKey) {
  if (!preferences) {
    return false
  }

  const entry = resolveChannelEntry(preferences, channel)
  if (!entry.enabled) {
    return false
  }

  const optInAt = channel === 'sms' ? preferences.sms_opt_in_at : preferences.whatsapp_opt_in_at
  const optOutAt = channel === 'sms' ? preferences.sms_opt_out_at : preferences.whatsapp_opt_out_at

  return Boolean(optInAt) && !optOutAt
}

export default function NotificationSettings() {
  const [loading, setLoading] = useState(true)
  const [preferences, setPreferences] = useState<NotificationPreferencesResponse | null>(null)
  const [savingChannel, setSavingChannel] = useState<ChannelKey | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)


  const fetchPreferences = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await notificationService.getPreferences()
      setPreferences(response)
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Failed to load notification preferences'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])



  useEffect(() => {
    void fetchPreferences()
  }, [fetchPreferences])



  const hasPhoneNumber = Boolean(preferences?.phone)

  const channelSummaries = useMemo(
    () => ({
      sms: {
        optInAt: formatTimestamp(preferences?.sms_opt_in_at),
        optOutAt: formatTimestamp(preferences?.sms_opt_out_at),
        optOutReason: preferences?.sms_opt_out_reason,
        source: preferences?.sms_opt_in_source
      },
      whatsapp: {
        optInAt: formatTimestamp(preferences?.whatsapp_opt_in_at),
        optOutAt: formatTimestamp(preferences?.whatsapp_opt_out_at),
        optOutReason: preferences?.whatsapp_opt_out_reason,
        source: preferences?.whatsapp_opt_in_source
      }
    }),
    [
      preferences?.sms_opt_in_at,
      preferences?.sms_opt_in_source,
      preferences?.sms_opt_out_at,
      preferences?.sms_opt_out_reason,
      preferences?.whatsapp_opt_in_at,
      preferences?.whatsapp_opt_in_source,
      preferences?.whatsapp_opt_out_at,
      preferences?.whatsapp_opt_out_reason
    ]
  )



  const handleConsentChange = async (channel: ChannelKey, enable: boolean) => {
    if (!preferences) {
      return
    }

    setSavingChannel(channel)
    setError(null)
    setSuccess(null)

    try {
      const action = enable ? 'opt_in' : 'opt_out'
      const updatedPreferences = await notificationService.updateConsent({
        channel,
        action,
        source: 'student_settings_page'
      })

      setPreferences(prev => ({
        ...(prev ?? {}),
        ...updatedPreferences,
        phone: prev?.phone ?? updatedPreferences.phone ?? null
      }))

      setSuccess(enable ? `${CHANNEL_DETAILS[channel].title} enabled.` : `${CHANNEL_DETAILS[channel].title} disabled.`)
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Failed to update consent preferences'
      setError(message)
    } finally {
      setSavingChannel(null)
    }
  }



  const renderChannelCard = (channel: ChannelKey) => {
    const details = CHANNEL_DETAILS[channel]
    const optedIn = isChannelOptedIn(preferences, channel)
    const entry = resolveChannelEntry(preferences, channel)
    const summary = channelSummaries[channel]
    const disableGrant = !hasPhoneNumber && !optedIn
    const buttonLabel = optedIn ? 'Opt Out' : 'Opt In'

    return (
      <motion.div
        key={channel}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: channel === 'sms' ? 0.1 : 0.2 }}
        className="bg-card rounded-2xl shadow-lg border border-border p-6 space-y-4"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-3 rounded-xl bg-primary/10 text-primary shadow-inner">
              <details.Icon className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{details.title}</h2>
              <p className="text-sm text-gray-900">{details.description} <span className="text-accent font-medium">(Enabled by default)</span></p>
            </div>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold ${
              optedIn ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-accent text-gray-900 border border-border'
            }`}
          >
            {optedIn ? 'Enabled' : 'Disabled'}
          </span>
        </div>

        <div className="space-y-2 text-sm text-gray-900">
          {optedIn && summary.optInAt && (
            <p>
              <span className="font-semibold">Opted in:</span> {summary.optInAt}
              {summary.source && <span className="text-gray-900"> · via {summary.source}</span>}
            </p>
          )}

          {!optedIn && summary.optOutAt && (
            <p>
              <span className="font-semibold">Consent revoked:</span> {summary.optOutAt}
              {summary.optOutReason && <span className="text-gray-900"> · {summary.optOutReason}</span>}
            </p>
          )}

          {!optedIn && !summary.optOutAt && (
            <p className="text-gray-900">This channel is enabled by default. You can opt out if you prefer.</p>
          )}

          {disableGrant && (
            <div className="rounded-xl bg-accent/5 border border-yellow-200 px-4 py-3 text-xs text-yellow-700">
              <p className="font-medium">Add a valid phone number in your profile to enable this channel.</p>
              <p>
                <Link to="/settings" className="underline font-semibold text-accent-foreground">
                  Update contact information
                </Link>
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2 text-xs text-gray-900">
            <span className="uppercase tracking-wide text-gray-900 font-semibold">Current contact</span>
            <span className="text-sm text-gray-900">{preferences?.phone || 'No phone number on file'}</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-border">
          <div className="text-xs text-gray-900">
            Priority: <span className="font-medium text-gray-900">{entry.priority}</span>
          </div>
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
      </motion.div>
    )
  }

  return (
    <div className="page-container bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <main className="w-full">
        <div className="content-wrapper py-4 sm:py-6 lg:py-8 safe-area-bottom">
        <div className="mb-6 sm:mb-8">
          <Link
            to="/settings"
            className="inline-flex items-center text-primary hover:text-primary/80 mb-4 font-medium transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Profile Settings
          </Link>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-6 sm:p-8 text-white shadow-xl"
          >
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2">Notification Preferences</h1>
            <p className="text-lg sm:text-xl text-white/90">
              All notifications are enabled by default. You can opt out of any you don't want.
            </p>
          </motion.div>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl bg-destructive/5 border border-destructive/30 p-4 sm:p-6 mb-6 shadow-lg"
          >
            <div className="flex items-center space-x-3">
              <div className="text-3xl">⚠️</div>
              <div className="text-error font-medium">{error}</div>
            </div>
          </motion.div>
        )}

        {success && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 sm:p-6 mb-6 shadow-lg"
          >
            <div className="flex items-center space-x-3">
              <div className="text-3xl">✅</div>
              <div className="text-emerald-700 font-medium">{success}</div>
            </div>
          </motion.div>
        )}

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <LoadingSpinner size="lg" />
          </div>
        ) : (
          <div className="space-y-6">
            <section className="grid gap-6 lg:grid-cols-2">
              {(['sms', 'whatsapp'] as ChannelKey[]).map(channel => renderChannelCard(channel))}
            </section>
          </div>
        )}
        </div>
      </main>
    </div>
  )
}
