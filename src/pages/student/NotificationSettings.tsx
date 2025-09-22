import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import { AuthenticatedNavigation } from '@/components/ui/AuthenticatedNavigation'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { notificationService } from '@/services/notifications'
import { userConsentService, type UserConsentRecord } from '@/services/consents'
import { ArrowLeft, MessageCircle, MessageSquare } from 'lucide-react'

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
  const [generalConsents, setGeneralConsents] = useState<Record<string, UserConsentRecord>>({})
  const [loadingConsents, setLoadingConsents] = useState(true)
  const [updatingConsent, setUpdatingConsent] = useState<string | null>(null)

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

  const fetchConsents = useCallback(async () => {
    try {
      setLoadingConsents(true)
      const response = await userConsentService.list()
      const mapping: Record<string, UserConsentRecord> = {}
      response.consents.forEach(consent => {
        mapping[consent.consentType] = consent
      })
      setGeneralConsents(mapping)
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Failed to load consent history'
      setError(message)
    } finally {
      setLoadingConsents(false)
    }
  }, [])

  useEffect(() => {
    void fetchPreferences()
  }, [fetchPreferences])

  useEffect(() => {
    void fetchConsents()
  }, [fetchConsents])

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

  const generalConsentDetails = useMemo(
    () => ({
      outreach: {
        label: 'Outreach & communications',
        description: 'Allows MIHAS to contact you about your application, offers, and important reminders.'
      },
      analytics: {
        label: 'Analytics & product improvements',
        description: 'Allows MIHAS to analyze usage patterns to improve student services.'
      }
    }),
    []
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

  const isGeneralConsentActive = (consentType: keyof typeof generalConsentDetails) =>
    Boolean(generalConsents[consentType]?.active)

  const handleGeneralConsentUpdate = async (
    consentType: keyof typeof generalConsentDetails,
    enable: boolean
  ) => {
    setUpdatingConsent(consentType)
    setError(null)
    setSuccess(null)

    try {
      const action = enable ? 'grant' : 'revoke'
      await userConsentService.update(consentType, action, { source: 'student_settings_page' })
      await fetchConsents()
      const detail = generalConsentDetails[consentType]
      setSuccess(
        enable
          ? `${detail.label} enabled.`
          : `${detail.label} disabled.`
      )
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Failed to update consent'
      setError(message)
    } finally {
      setUpdatingConsent(null)
    }
  }

  const renderGeneralConsentCard = (consentType: keyof typeof generalConsentDetails) => {
    const detail = generalConsentDetails[consentType]
    const record = generalConsents[consentType]
    const isActive = isGeneralConsentActive(consentType)
    const buttonLabel = isActive ? 'Opt Out' : 'Opt In'

    return (
      <motion.div
        key={consentType}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: consentType === 'outreach' ? 0.05 : 0.15 }}
        className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{detail.label}</h3>
            <p className="mt-1 text-sm text-gray-600">{detail.description}</p>
          </div>
          <span
            className={`px-3 py-1 text-xs font-semibold rounded-full ${
              isActive
                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                : 'bg-gray-100 text-gray-600 border border-gray-200'
            }`}
          >
            {isActive ? 'Active' : 'Inactive'}
          </span>
        </div>

        <div className="mt-4 space-y-1 text-xs text-gray-500">
          <p>
            Last granted: {record?.grantedAt ? formatTimestamp(record.grantedAt) ?? record.grantedAt : '—'}
          </p>
          <p>
            Last revoked: {record?.revokedAt ? formatTimestamp(record.revokedAt) ?? record.revokedAt : '—'}
          </p>
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            variant={isActive ? 'outline' : 'primary'}
            loading={updatingConsent === consentType}
            disabled={updatingConsent === consentType}
            onClick={() => handleGeneralConsentUpdate(consentType, !isActive)}
          >
            {updatingConsent === consentType ? 'Saving…' : buttonLabel}
          </Button>
        </div>
      </motion.div>
    )
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
        className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 space-y-4"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-3 rounded-xl bg-blue-100 text-blue-600 shadow-inner">
              <details.Icon className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{details.title}</h2>
              <p className="text-sm text-gray-600">{details.description} <span className="text-green-600 font-medium">(Enabled by default)</span></p>
            </div>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold ${
              optedIn ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-gray-100 text-gray-600 border border-gray-200'
            }`}
          >
            {optedIn ? 'Enabled' : 'Disabled'}
          </span>
        </div>

        <div className="space-y-2 text-sm text-gray-700">
          {optedIn && summary.optInAt && (
            <p>
              <span className="font-semibold">Opted in:</span> {summary.optInAt}
              {summary.source && <span className="text-gray-500"> · via {summary.source}</span>}
            </p>
          )}

          {!optedIn && summary.optOutAt && (
            <p>
              <span className="font-semibold">Consent revoked:</span> {summary.optOutAt}
              {summary.optOutReason && <span className="text-gray-500"> · {summary.optOutReason}</span>}
            </p>
          )}

          {!optedIn && !summary.optOutAt && (
            <p className="text-gray-600">This channel is enabled by default. You can opt out if you prefer.</p>
          )}

          {disableGrant && (
            <div className="rounded-xl bg-yellow-50 border border-yellow-200 px-4 py-3 text-xs text-yellow-700">
              <p className="font-medium">Add a valid phone number in your profile to enable this channel.</p>
              <p>
                <Link to="/settings" className="underline font-semibold text-yellow-800">
                  Update contact information
                </Link>
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2 text-xs text-gray-500">
            <span className="uppercase tracking-wide text-gray-400 font-semibold">Current contact</span>
            <span className="text-sm text-gray-700">{preferences?.phone || 'No phone number on file'}</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-gray-100">
          <div className="text-xs text-gray-500">
            Priority: <span className="font-medium text-gray-700">{entry.priority}</span>
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <AuthenticatedNavigation />
      <div className="container-mobile py-4 sm:py-6 lg:py-8 safe-area-bottom">
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
            className="bg-gradient-to-r from-primary to-secondary rounded-2xl p-6 sm:p-8 text-white shadow-xl"
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
            className="rounded-xl bg-red-50 border border-red-200 p-4 sm:p-6 mb-6 shadow-lg"
          >
            <div className="flex items-center space-x-3">
              <div className="text-3xl">⚠️</div>
              <div className="text-red-700 font-medium">{error}</div>
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
            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Data usage preferences</h2>
                  <p className="text-sm text-gray-600">
                    All data usage is enabled by default to provide you the best service. You can opt out of any you prefer not to have.
                  </p>
                </div>
                {loadingConsents && <LoadingSpinner size="sm" />}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {(Object.keys(generalConsentDetails) as Array<keyof typeof generalConsentDetails>).map(consentType =>
                  renderGeneralConsentCard(consentType)
                )}
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              {(['sms', 'whatsapp'] as ChannelKey[]).map(channel => renderChannelCard(channel))}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
