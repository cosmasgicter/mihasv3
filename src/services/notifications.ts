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

export const notificationService = {
  send: (data: { userId: string; type: string; title: string; message: string; data?: Record<string, unknown> }) =>
    apiClient.request('/api/notifications/send', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  applicationSubmitted: (data: { applicationId: string; userId: string }) =>
    apiClient.request('/api/notifications/application-submitted', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  dispatchChannel: (payload: DispatchChannelPayload) =>
    apiClient.request('/api/notifications/dispatch-channel', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  getPreferences: () =>
    apiClient.request('/api/notifications/preferences', {
      method: 'GET'
    }),
  updateConsent: (payload: UpdateConsentPayload) =>
    apiClient.request('/api/notifications/update-consent', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
}
