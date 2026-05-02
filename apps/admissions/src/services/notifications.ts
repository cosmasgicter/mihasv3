import { apiClient } from './client'
import { logApiError } from '@/lib/apiErrorLogger'
import type { NotificationData, StudentNotification } from '@/types/notifications'

type UpdatePreferencesPayload = {
  email_enabled?: boolean
  sms_enabled?: boolean
  whatsapp_enabled?: boolean
  in_app_enabled?: boolean
  application_updates?: boolean
  payment_reminders?: boolean
  interview_reminders?: boolean
  marketing_emails?: boolean
  quiet_hours_start?: string | null
  quiet_hours_end?: string | null
  timezone?: string | null
}

type SendNotificationPayload = {
  to: string
  subject: string
  message: string
  type?: string
  actionUrl?: string
}

type SendNotificationApiResponse = {
  notification?: Record<string, unknown>
  email_sent?: boolean
  mandatory?: boolean
  duplicate?: boolean
  id?: string
}

const VALID_NOTIFICATION_TYPES = new Set(['info', 'success', 'warning', 'error'])

type RawNotification = Record<string, unknown>

function normalizeNotificationType(value: unknown): StudentNotification['type'] {
  return typeof value === 'string' && VALID_NOTIFICATION_TYPES.has(value)
    ? value as StudentNotification['type']
    : 'info'
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

export function normalizeNotificationContent(value: string): string {
  if (!value) return ''

  let text = value

  if (text.includes('<')) {
    text = text
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p\s*>/gi, '\n\n')
      .replace(/<p\b[^>]*>/gi, '')
      .replace(/<[^>]+>/g, '')
  } else if (/^p[A-Z]/.test(text) || text.includes('/pp') || text.includes(',br')) {
    text = text
      .replace(/\/pp/g, '\n\n')
      .replace(/^p(?=[A-Z])/g, '')
      .replace(/\/p$/g, '')
      .replace(/\/p/g, '')
      .replace(/,br/g, ',\n')
      .replace(/\bbr(?=[A-Z])/g, '\n')
  }

  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function createIdempotencyKey(): string {
  const cryptoRef = globalThis.crypto
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID()
  }

  return `notification-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function normalizeNotification(item: unknown): StudentNotification | null {
  if (!item || typeof item !== 'object') {
    return null
  }

  const raw = item as RawNotification
  const id = stringValue(raw.id)

  if (!id) {
    return null
  }

  const read =
    typeof raw.read === 'boolean'
      ? raw.read
      : typeof raw.is_read === 'boolean'
        ? raw.is_read
        : true
  const actionUrl = stringValue(raw.action_url)
  const readAt = stringValue(raw.read_at)

  return {
    id,
    title: stringValue(raw.title, 'Notification'),
    content: normalizeNotificationContent(stringValue(raw.content, stringValue(raw.message))),
    type: normalizeNotificationType(raw.type),
    read,
    ...(actionUrl ? { action_url: actionUrl } : {}),
    created_at: stringValue(raw.created_at),
    ...(readAt ? { read_at: readAt } : {}),
  }
}

function normalizeNotificationArray(value: unknown): StudentNotification[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map(normalizeNotification)
    .filter((notification): notification is StudentNotification => notification !== null)
}

function firstArrayValue(...values: unknown[]): StudentNotification[] {
  for (const value of values) {
    if (Array.isArray(value)) {
      return normalizeNotificationArray(value)
    }
  }

  return []
}

export function normalizeNotificationsResponse(response: unknown): StudentNotification[] {
  if (Array.isArray(response)) {
    return normalizeNotificationArray(response)
  }

  if (!response || typeof response !== 'object') {
    return []
  }

  const envelope = response as Record<string, unknown>
  const data = envelope.data

  if (Array.isArray(data)) {
    return normalizeNotificationArray(data)
  }

  if (data && typeof data === 'object') {
    const nested = data as Record<string, unknown>
    const nestedResults = firstArrayValue(nested.results, nested.notifications)
    if (nestedResults.length > 0) {
      return nestedResults
    }
  }

  return firstArrayValue(envelope.results, envelope.notifications)
}

// ─── Template Constants (merged from NotificationService class) ───

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

export const notificationService = {
  /** Send a notification (admin only). Maps to POST /notifications/ */
  send: async (payload: SendNotificationPayload): Promise<boolean> => {
    const backendPayload = {
      user_id: payload.to,
      title: payload.subject,
      message: payload.message,
      type: normalizeNotificationType(payload.type),
      idempotency_key: createIdempotencyKey(),
      ...(payload.actionUrl ? { action_url: payload.actionUrl } : {}),
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

  /** Update notification preferences. */
  updatePreferences: (payload: UpdatePreferencesPayload) =>
    apiClient.request('/notifications/preferences/', {
      method: 'PUT',
      body: JSON.stringify({
        ...('email_enabled' in payload ? { email_enabled: payload.email_enabled } : {}),
        ...('sms_enabled' in payload ? { sms_enabled: payload.sms_enabled } : {}),
        ...('whatsapp_enabled' in payload ? { whatsapp_enabled: payload.whatsapp_enabled } : {}),
        ...('in_app_enabled' in payload ? { in_app_enabled: payload.in_app_enabled } : {}),
        ...('application_updates' in payload ? { application_updates: payload.application_updates } : {}),
        ...('payment_reminders' in payload ? { payment_reminders: payload.payment_reminders } : {}),
        ...('interview_reminders' in payload ? { interview_reminders: payload.interview_reminders } : {}),
        ...('marketing_emails' in payload ? { marketing_emails: payload.marketing_emails } : {}),
        ...('quiet_hours_start' in payload ? { quiet_hours_start: payload.quiet_hours_start } : {}),
        ...('quiet_hours_end' in payload ? { quiet_hours_end: payload.quiet_hours_end } : {}),
        ...('timezone' in payload ? { timezone: payload.timezone } : {}),
      })
    }),

  /** List notifications for the current user. Maps to GET /notifications/ */
  list: () =>
    apiClient.request('/notifications/', {
      method: 'GET',
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

  // ─── Template-Based Methods (merged from NotificationService class) ───

  /** Send a typed notification with full control. */
  sendNotification: async (data: NotificationData): Promise<boolean> => {
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
    } catch (error) {
      logApiError('notificationService.sendNotification', '/notifications/', error);
      return false;
    }
  },

  /** Send a welcome notification to a new user. */
  sendWelcomeNotification: async (userId: string, userName: string): Promise<boolean> => {
    if (!userId || !userName) return false;
    return notificationService.sendNotification({
      userId,
      title: '🎓 Welcome to MIHAS-KATC!',
      content: `Welcome ${userName}! Your account has been created successfully.`,
      type: 'success',
    });
  },

  /** Send a template-based application status notification. */
  sendApplicationStatusNotification: async (
    userId: string, applicationId: string, status: string,
    applicationNumber: string, program: string
  ): Promise<boolean> => {
    const template = NOTIFICATION_TEMPLATES[status as keyof typeof NOTIFICATION_TEMPLATES];
    if (!template) return false;
    return notificationService.sendNotification({
      userId,
      title: template.title,
      content: template.content(applicationNumber, program),
      type: template.type,
    });
  },
}
