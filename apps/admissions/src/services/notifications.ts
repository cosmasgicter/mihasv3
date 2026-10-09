import { apiClient } from './client'
import { logApiError } from '@/lib/apiErrorLogger'
import { generateIdempotencyKey } from '@/lib/paymentStatus'
import type { NotificationData, StudentNotification } from '@/types/notifications'
import type {
  NotificationPreferenceSchema,
  PreferenceUpdate,
} from '@/lib/notificationPreferences'

/**
 * A preference PUT body (task 10.1, R13.8).
 *
 * Writable field names only. This used to be a hand-written union that included
 * `whatsapp_enabled` and `in_app_enabled` — neither of which the backend has —
 * plus quiet hours and a timezone that **no delivery path reads**. The server now
 * publishes `writable_fields` and the caller builds the body from it
 * (`buildPreferenceUpdate`), so this app cannot offer a control the platform will
 * not honour. Finding **STU-14**.
 */
type UpdatePreferencesPayload = PreferenceUpdate

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

type SendEmailPayload = {
  recipientEmail: string
  subject: string
  body: string
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

/**
 * Read the notification rows out of a notification list response.
 *
 * Task 12.2 (R14.5, finding API-02) reduced this from a five-shape sniff to the
 * one shape the endpoint publishes. `NotificationListView` has **four** return
 * paths — page-number mode, implicit-no-params mode, cursor mode, and cursor
 * mode with an unknown anchor — and every one of them returns
 * `{"success": true, "data": {…, "results": [...]}}`. The client unwraps exactly
 * one envelope level, so `.results` is the whole contract.
 *
 * Deleted, with why each was unreachable:
 *
 * - the bare-array branch — no path returns `data` as an array.
 * - `.data`, `.data.results`, `.data.notifications` — a **second** envelope.
 * - `.notifications` — a domain-keyed list this endpoint has never had.
 * - `firstArrayValue`, the helper that tried keys in order and returned the
 *   first array it found. It is worth naming what that did on an empty page:
 *   `nestedResults.length > 0` meant an empty `results` fell THROUGH to the
 *   next candidate key, so "no notifications" and "unrecognised shape" produced
 *   the same answer by different routes. A strict read distinguishes them.
 *
 * Three first-party callers, all in `hooks/useNotificationPolling.ts`, and all
 * three hand this the unwrapped payload of a list or cursor read
 * (`scripts/v1_surface_telemetry.py`, surface
 * `normalizer.notifications.response_sniff`). None of them needs a shape other
 * than `.results`.
 */
export function normalizeNotificationsResponse(response: unknown): StudentNotification[] {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    return []
  }

  return normalizeNotificationArray((response as { results?: unknown }).results)
}

// ─── Template Constants (merged from NotificationService class) ───

const NOTIFICATION_TEMPLATES = {
  submitted: {
    title: 'Application Submitted Successfully',
    content: (applicationNumber: string, program: string) =>
      `Your application #${applicationNumber} for ${program} has been submitted and is under review.`,
    type: 'success' as const,
  },
  approved: {
    title: 'Application Approved',
    content: (applicationNumber: string, program: string) =>
      `Congratulations! Your application #${applicationNumber} for ${program} has been approved.`,
    type: 'success' as const,
  },
  rejected: {
    title: 'Application Status Update',
    content: (applicationNumber: string, program: string) =>
      `Your application #${applicationNumber} for ${program} has been reviewed. Please check your email for feedback.`,
    type: 'error' as const,
  },
  pending_documents: {
    title: 'Documents Required',
    content: (applicationNumber: string, _program: string) =>
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
      idempotency_key: generateIdempotencyKey(),
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

  /** Queue a direct email (admin only). Maps to POST /email/send/ */
  sendEmail: async (payload: SendEmailPayload): Promise<boolean> => {
    const response = await apiClient.request<{ id?: string }>('/email/send/', {
      method: 'POST',
      body: JSON.stringify({
        recipient_email: payload.recipientEmail,
        subject: payload.subject,
        body: payload.body,
      }),
    })

    return Boolean(response?.id)
  },

  /**
   * The published preference schema. Maps to GET /notifications/preferences/.
   *
   * Returns what the server published — channels, categories, which of them are
   * configurable, each one's definition, the writable field names, the refusal
   * table, and the delivery-state vocabulary. This app derives no part of it.
   */
  getPreferences: () =>
    apiClient.request<NotificationPreferenceSchema>('/notifications/preferences/', {
      method: 'GET'
    }),

  /**
   * Persist a preference change. Maps to PUT /notifications/preferences/.
   *
   * The body is passed through unchanged: it is built by
   * `buildPreferenceUpdate` from the server's own `writable_fields`, so there is
   * no field allow-list here to drift from the backend's. A field the platform
   * cannot honour comes back as a 400 carrying a per-field code and reason
   * (`preferenceRejections`), never as a silent no-op.
   */
  updatePreferences: (payload: UpdatePreferencesPayload) =>
    apiClient.request<NotificationPreferenceSchema>('/notifications/preferences/', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  /**
   * Ask the platform to try one message's failed email again.
   * Maps to POST /notifications/{id}/retry/ (task 10.1, R13.4).
   *
   * Owner-scoped, state-guarded, bounded and audited on the server. The retry
   * writes a new durable outbox row — it is never a direct provider call — so a
   * success here means "queued again", not "delivered".
   */
  retryDelivery: (notificationId: string) =>
    apiClient.request<{ message: string; channel: string; attempts: number }>(
      `/notifications/${encodeURIComponent(notificationId)}/retry/`,
      { method: 'POST' },
    ),

  /** List notifications for the current user. Maps to GET /notifications/ */
  list: () =>
    apiClient.request('/notifications/', {
      method: 'GET',
    }),

  /** List notifications newer than a cursor id. Maps to GET /notifications/?after=<id> */
  listAfter: (afterId: string) =>
    apiClient.request(`/notifications/?after=${encodeURIComponent(afterId)}`, {
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
      title: 'Welcome to Beanola',
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
