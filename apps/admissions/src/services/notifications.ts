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
  /** Send a notification (admin only). Maps to POST /notifications/ */
  send: async (payload: SendNotificationPayload): Promise<boolean> => {
    const backendPayload = {
      user_id: payload.to,
      title: payload.subject,
      message: payload.message,
      type: 'info'
    }
    const response = await apiClient.request<SendNotificationApiResponse>('/notifications/', {
      method: 'POST',
      body: JSON.stringify(backendPayload)
    })

    if (!response) return false

    // Dedup responses return { duplicate: true }
    if (response.duplicate) return true

    return Boolean(response.notification || response.id)
  },

  /** Get notification preferences. Maps to GET /notifications/preferences/ */
  getPreferences: () =>
    apiClient.request('/notifications/preferences/', {
      method: 'GET'
    }),

  /** Update notification preferences. Django currently supports email/push + quiet hours only. */
  updatePreferences: (payload: UpdatePreferencesPayload) =>
    apiClient.request('/notifications/preferences/', {
      method: 'PUT',
      body: JSON.stringify({
        email_enabled: payload.marketing_emails ?? payload.application_updates ?? true,
        push_enabled: payload.whatsapp_enabled ?? payload.sms_enabled ?? false,
        quiet_hours:
          payload.quiet_hours_start || payload.quiet_hours_end
            ? {
                start: payload.quiet_hours_start ?? null,
                end: payload.quiet_hours_end ?? null,
              }
            : {},
      })
    }),

  /** List notifications for the current user. Maps to GET /notifications/ */
  list: () =>
    apiClient.request('/notifications/', {
      method: 'GET'
    }),

  /** Mark a single notification as read. Maps to PUT /notifications/{id}/read/ */
  markRead: (notificationId: string) =>
    apiClient.request(`/notifications/${encodeURIComponent(notificationId)}/read/`, {
      method: 'PUT'
    }),

  /** Mark all notifications as read. Maps to PUT /notifications/read-all/ */
  markAllRead: () =>
    apiClient.request('/notifications/read-all/', {
      method: 'PUT'
    }),

  /** Delete a notification. Maps to DELETE /notifications/{id}/ */
  delete: (notificationId: string) =>
    apiClient.request(`/notifications/${encodeURIComponent(notificationId)}/`, {
      method: 'DELETE'
    }),
}


// ─── Template-Based Notification Service (merged from src/lib/notificationService.ts) ───

import type { NotificationData } from '@/types/notifications'

const NOTIFICATION_TEMPLATES = {
  submitted: {
    title: '✅ Application Submitted Successfully',
    content: (applicationNumber: string, program: string) =>
      `Your application #${applicationNumber} for ${program} has been submitted and is under review.`,
    type: 'success' as const,
  },
  approved: {
    title: '🎉 Application Approved!',
    content: (applicationNumber: string, program: string) =>
      `Congratulations! Your application #${applicationNumber} for ${program} has been approved.`,
    type: 'success' as const,
  },
  rejected: {
    title: '❌ Application Status Update',
    content: (applicationNumber: string, program: string) =>
      `Your application #${applicationNumber} for ${program} has been reviewed. Please check your email for feedback.`,
    type: 'error' as const,
  },
  pending_documents: {
    title: '📄 Documents Required',
    content: (applicationNumber: string, program: string) =>
      `Your application #${applicationNumber} requires additional documents.`,
    type: 'warning' as const,
  },
} as const;

export class NotificationService {
  static async sendNotification(data: NotificationData): Promise<boolean> {
    if (!data.userId || !data.title || !data.content) return false;
    try {
      await apiClient.request('/notifications/', {
        method: 'POST',
        body: JSON.stringify({
          user_id: data.userId,
          title: data.title,
          message: data.content,
          type: data.type || 'info',
        }),
      });
      return true;
    } catch {
      return false;
    }
  }

  static async sendWelcomeNotification(userId: string, userName: string): Promise<boolean> {
    if (!userId || !userName) return false;
    return this.sendNotification({
      userId,
      title: '🎓 Welcome to MIHAS-KATC!',
      content: `Welcome ${userName}! Your account has been created successfully.`,
      type: 'success',
    });
  }

  static async sendApplicationStatusNotification(
    userId: string, applicationId: string, status: string,
    applicationNumber: string, program: string
  ): Promise<boolean> {
    const template = NOTIFICATION_TEMPLATES[status as keyof typeof NOTIFICATION_TEMPLATES];
    if (!template) return false;
    return this.sendNotification({
      userId,
      title: template.title,
      content: template.content(applicationNumber, program),
      type: template.type,
    });
  }
}
