// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { normalizeNotificationPayload } from '@/hooks/useStudentNotifications'

describe('normalizeNotificationPayload', () => {
  it('maps the current Django notification shape into the frontend model', () => {
    const result = normalizeNotificationPayload({
      id: 'notif-1',
      title: 'Application update',
      message: 'Your application has moved to review.',
      type: 'info',
      is_read: true,
      created_at: '2026-04-05T10:00:00Z',
    })

    expect(result).toEqual({
      id: 'notif-1',
      title: 'Application update',
      content: 'Your application has moved to review.',
      type: 'info',
      read: true,
      action_url: undefined,
      created_at: '2026-04-05T10:00:00Z',
      read_at: undefined,
    })
  })

  it('still supports the legacy frontend notification shape', () => {
    const result = normalizeNotificationPayload({
      id: 'notif-2',
      title: 'Legacy notification',
      content: 'Stored in legacy format.',
      type: 'warning',
      read: false,
      action_url: '/student/status',
      created_at: '2026-04-05T10:00:00Z',
      read_at: null,
    })

    expect(result).toEqual({
      id: 'notif-2',
      title: 'Legacy notification',
      content: 'Stored in legacy format.',
      type: 'warning',
      read: false,
      action_url: '/student/status',
      created_at: '2026-04-05T10:00:00Z',
      read_at: null,
    })
  })
})
