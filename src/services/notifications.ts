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
  getPreferences: () =>
    apiClient.request('/notifications/preferences', {
      method: 'GET'
    }),
  updateConsent: (payload: UpdateConsentPayload) =>
    apiClient.request('/notifications/update-consent', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
}
