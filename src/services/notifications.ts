import { apiClient } from './client'

type UpdatePreferencesPayload = {
  sms_enabled?: boolean
  whatsapp_enabled?: boolean
  application_updates?: boolean
  payment_reminders?: boolean
  interview_reminders?: boolean
  marketing_emails?: boolean
  quiet_hours_start?: string | null
  quiet_hours_end?: string | null
}

type SendNotificationPayload = {
  to: string
  subject: string
  message: string
}

type SendNotificationApiResponse = {
  notification?: Record<string, unknown>
  email_sent?: boolean
  mandatory?: boolean
  duplicate?: boolean
  id?: string
}

export const notificationService = {
  /** Send a notification (admin only). Maps to POST /api/notifications?action=send */
  send: async (payload: SendNotificationPayload): Promise<boolean> => {
    const backendPayload = {
      user_id: payload.to,
      title: payload.subject,
      message: payload.message,
      type: 'info'
    }
    const response = await apiClient.request<SendNotificationApiResponse>('/notifications?action=send', {
      method: 'POST',
      body: JSON.stringify(backendPayload)
    })

    if (!response) return false

    // Dedup responses return { duplicate: true }
    if (response.duplicate) return true

    return Boolean(response.notification || response.id)
  },

  /** Get notification preferences. Maps to GET /api/notifications?action=preferences */
  getPreferences: () =>
    apiClient.request('/notifications?action=preferences', {
      method: 'GET'
    }),

  /** Update notification preferences. Maps to POST /api/notifications?action=preferences */
  updatePreferences: (payload: UpdatePreferencesPayload) =>
    apiClient.request('/notifications?action=preferences', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  /** List notifications. Maps to GET /api/notifications?action=list */
  list: () =>
    apiClient.request('/notifications?action=list', {
      method: 'GET'
    }),

  /** Mark a notification as read. Maps to PUT /api/notifications?action=mark-read */
  markRead: (notificationId: string) =>
    apiClient.request('/notifications?action=mark-read', {
      method: 'PUT',
      body: JSON.stringify({ notificationId })
    }),

  /** Mark all notifications as read. Maps to PUT /api/notifications?action=mark-all-read */
  markAllRead: () =>
    apiClient.request('/notifications?action=mark-all-read', {
      method: 'PUT'
    }),

  /** Delete a notification. Maps to DELETE /api/notifications?action=delete */
  delete: (notificationId: string) =>
    apiClient.request('/notifications?action=delete', {
      method: 'DELETE',
      body: JSON.stringify({ notificationId })
    }),
}
