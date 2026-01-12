import { apiClient } from './client'

type DispatchChannelPayload = {
  userId: string
  channel: 'sms' | 'whatsapp'
  type: string
  content: string
  metadata?: Record<string, unknown>
}

type UpdateConsentPayload = {
  channel: 'sms' | 'whatsapp'
  action: 'opt_in' | 'opt_out'
  source?: string
  reason?: string
}

type UpdatePreferencesPayload = {
  action?: 'update_channel' | 'update_multiple_channels' | 'update_quiet_hours'
  channel?: string
  enabled?: boolean
  channels?: Record<string, boolean>
  quiet_hours_start?: string
  quiet_hours_end?: string
  timezone?: string
  reason?: string
}

type ConsentPayload = {
  user_id?: string
  channel: string
  action: 'opt_in' | 'opt_out'
  reason?: string
  source?: string
  email?: string
}

type BulkConsentPayload = {
  user_id?: string
  consents: Record<string, boolean>
  reason?: string
  source?: string
  email?: string
}

type SendNotificationPayload = {
  to: string
  subject: string
  message: string
}

type SendNotificationResponse = {
  success?: boolean
}

type SendNotificationApiResponse = SendNotificationResponse & {
  notificationId?: string | null
  notification?: Record<string, unknown>
  id?: string
}

export const notificationService = {
  send: async (payload: SendNotificationPayload): Promise<boolean> => {
    // Transform payload to match backend expectations
    const backendPayload = {
      user_id: payload.to,
      title: payload.subject,
      message: payload.message,
      type: 'info'
    }
    const response = await apiClient.request<SendNotificationApiResponse>('/notifications/send', {
      method: 'POST',
      body: JSON.stringify(backendPayload)
    })

    if (!response) {
      return false
    }

    if ('success' in response) {
      return Boolean(response.success)
    }

    // Fallback for legacy responses that returned the notification row
    return Boolean(response.id || (response.notification as { id?: string | number } | undefined)?.id)
  },
  applicationSubmitted: (data: { applicationId: string; userId: string }) =>
    apiClient.request('/notifications/application-submitted', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  dispatchChannel: (payload: DispatchChannelPayload) =>
    apiClient.request('/notifications/dispatch-channel', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  getPreferences: (includeAudit = false, auditLimit = 50) =>
    apiClient.request(`/notifications/preferences?include_audit=${includeAudit}&audit_limit=${auditLimit}`, {
      method: 'GET'
    }),
  updateConsent: (payload: UpdateConsentPayload) =>
    apiClient.request('/notifications/update-consent', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  
  // New preference management methods
  updatePreferences: (payload: UpdatePreferencesPayload) =>
    apiClient.request('/notifications/preferences', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  
  exportPreferences: () =>
    apiClient.request('/notifications/preferences', {
      method: 'PUT'
    }),
  
  // Consent management methods
  updateChannelConsent: (payload: ConsentPayload) =>
    apiClient.request('/notifications/consent', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  
  checkConsentStatus: (userId?: string, channel?: string, email?: string) => {
    const params = new URLSearchParams()
    if (userId) params.append('user_id', userId)
    if (channel) params.append('channel', channel)
    if (email) params.append('email', email)
    
    return apiClient.request(`/notifications/consent?${params.toString()}`, {
      method: 'GET'
    })
  },
  
  updateBulkConsent: (payload: BulkConsentPayload) =>
    apiClient.request('/notifications/consent', {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  
  revokeAllConsents: (userId?: string, email?: string, reason?: string) => {
    const params = new URLSearchParams()
    if (userId) params.append('user_id', userId)
    if (email) params.append('email', email)
    if (reason) params.append('reason', reason)
    
    return apiClient.request(`/notifications/consent?${params.toString()}`, {
      method: 'DELETE'
    })
  }
}
