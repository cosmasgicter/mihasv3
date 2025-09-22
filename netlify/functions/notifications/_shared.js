const fetch = require('node-fetch')

const { supabaseAdminClient } = require('../_lib/supabaseClient')

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN
const TWILIO_SMS_FROM = process.env.TWILIO_SMS_FROM
const TWILIO_SMS_MESSAGING_SERVICE_SID = process.env.TWILIO_SMS_MESSAGING_SERVICE_SID
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM

async function fetchUserNotificationPreferences(userId) {
  const record = await fetchUserNotificationPreferencesRecord(userId)
  return normalizePreferencesRecord(record || { user_id: userId })
}

async function fetchUserNotificationPreferencesRecord(userId) {
  const { data, error } = await supabaseAdminClient
    .from('user_notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data || null
}

function normalizePreferencesRecord(record = {}) {
  const preferences = ensureAuditFields({ ...record })
  preferences.channels = normalizeChannelPreferences(preferences.channels)
  preferences.frequency = preferences.frequency || 'immediate'
  preferences.optimalTiming = typeof preferences.optimal_timing === 'boolean' ? preferences.optimal_timing : true
  return preferences
}

function normalizeChannelPreferences(channels) {
  const defaultConfig = [
    { type: 'email', enabled: true, priority: 1 },
    { type: 'sms', enabled: false, priority: 2 },
    { type: 'whatsapp', enabled: false, priority: 3 },
    { type: 'in_app', enabled: true, priority: 4 }
  ]

  const channelMap = new Map(defaultConfig.map(entry => [entry.type, { ...entry }]))

  if (Array.isArray(channels)) {
    channels.forEach(entry => {
      if (!entry || typeof entry !== 'object' || !entry.type) {
        return
      }

      const type = String(entry.type)
      const normalized = {
        type,
        enabled: Boolean(entry.enabled),
        priority: Number.isFinite(entry.priority)
          ? Number(entry.priority)
          : channelMap.get(type)?.priority ?? defaultConfig.length + 1
      }

      channelMap.set(type, { ...channelMap.get(type), ...normalized })
    })
  }

  return Array.from(channelMap.values()).sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
}

function updateChannelEnabledState(channels, targetChannel, enabled) {
  const normalizedChannels = normalizeChannelPreferences(channels)
  return normalizedChannels.map(entry =>
    entry.type === targetChannel
      ? { ...entry, enabled }
      : entry
  )
}

function ensureAuditFields(preferences) {
  const auditFields = [
    'sms_opt_in_at',
    'sms_opt_in_source',
    'sms_opt_in_actor',
    'sms_opt_out_at',
    'sms_opt_out_source',
    'sms_opt_out_actor',
    'sms_opt_out_reason',
    'whatsapp_opt_in_at',
    'whatsapp_opt_in_source',
    'whatsapp_opt_in_actor',
    'whatsapp_opt_out_at',
    'whatsapp_opt_out_source',
    'whatsapp_opt_out_actor',
    'whatsapp_opt_out_reason'
  ]

  auditFields.forEach(field => {
    if (!(field in preferences)) {
      preferences[field] = null
    }
  })

  if (!preferences.channels) {
    preferences.channels = []
  }

  return preferences
}

function hasExplicitOptIn(preferences, channel) {
  const channelEntry = Array.isArray(preferences.channels)
    ? preferences.channels.find(entry => entry.type === channel)
    : null

  if (!channelEntry || !channelEntry.enabled) {
    return false
  }

  const prefix = channel === 'sms' ? 'sms' : channel === 'whatsapp' ? 'whatsapp' : null

  if (!prefix) {
    return true
  }

  const optInAt = preferences[`${prefix}_opt_in_at`]
  const optOutAt = preferences[`${prefix}_opt_out_at`]

  if (!optInAt) {
    return false
  }

  if (optOutAt) {
    return false
  }

  return true
}

function ensureTwilioConfiguration(channel) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error('Twilio credentials are not configured')
  }

  if (channel === 'sms' && !TWILIO_SMS_MESSAGING_SERVICE_SID && !TWILIO_SMS_FROM) {
    throw new Error('Twilio SMS sender configuration is missing')
  }

  if (channel === 'whatsapp' && !TWILIO_WHATSAPP_FROM) {
    throw new Error('Twilio WhatsApp sender number is not configured')
  }
}

function formatPhoneForChannel(rawPhone, channel) {
  if (!rawPhone || typeof rawPhone !== 'string') {
    return null
  }

  const trimmed = rawPhone.replace(/[\s\-]/g, '')

  if (channel === 'whatsapp') {
    if (trimmed.startsWith('whatsapp:')) {
      return trimmed
    }

    return trimmed.startsWith('+') ? `whatsapp:${trimmed}` : null
  }

  if (trimmed.startsWith('whatsapp:')) {
    const stripped = trimmed.replace(/^whatsapp:/, '')
    return stripped.startsWith('+') ? stripped : null
  }

  return trimmed.startsWith('+') ? trimmed : null
}

async function sendTwilioMessage({ channel, to, body }) {
  const authHeader = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`

  const params = new URLSearchParams()
  params.append('To', to)
  params.append('Body', body)

  if (channel === 'sms') {
    if (TWILIO_SMS_MESSAGING_SERVICE_SID) {
      params.append('MessagingServiceSid', TWILIO_SMS_MESSAGING_SERVICE_SID)
    } else if (TWILIO_SMS_FROM) {
      params.append('From', TWILIO_SMS_FROM)
    }
  } else if (channel === 'whatsapp') {
    params.append('From', TWILIO_WHATSAPP_FROM)
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  })

  let payload

  try {
    payload = await response.json()
  } catch (error) {
    payload = null
  }

  return {
    ok: response.ok,
    status: response.status,
    data: payload
  }
}

async function logChannelDelivery({ userId, type, channel, success, status, messageId }) {
  const channelStatuses = { [channel]: status || (success ? 'sent' : 'failed') }
  const providerMessageIds = messageId ? { [channel]: messageId } : {}

  const { error } = await supabaseAdminClient
    .from('notification_logs')
    .insert({
      user_id: userId,
      type,
      channels: [channel],
      success_count: success ? 1 : 0,
      total_count: 1,
      sent_at: new Date().toISOString(),
      channel_statuses: channelStatuses,
      provider_message_ids: providerMessageIds
    })

  if (error) {
    throw new Error(error.message)
  }
}

module.exports = {
  fetchUserNotificationPreferences,
  fetchUserNotificationPreferencesRecord,
  normalizePreferencesRecord,
  normalizeChannelPreferences,
  updateChannelEnabledState,
  hasExplicitOptIn,
  ensureTwilioConfiguration,
  formatPhoneForChannel,
  sendTwilioMessage,
  logChannelDelivery
}
