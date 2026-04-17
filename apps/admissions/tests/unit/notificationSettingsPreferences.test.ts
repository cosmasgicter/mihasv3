import { describe, expect, it } from 'vitest'

import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  isNotificationChannelEnabled,
  normalizeNotificationPreferences,
  type NotificationPreferencesResponse,
} from '@/pages/student/NotificationSettings'

describe('NotificationSettings preference helpers', () => {
  it('normalizes partial backend preferences onto stable defaults', () => {
    const normalized = normalizeNotificationPreferences({
      sms_enabled: true,
      quiet_hours_start: '21:00',
    })

    expect(normalized).toEqual({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      sms_enabled: true,
      quiet_hours_start: '21:00',
    })
  })

  it('reads channel state from the backend flat flags', () => {
    const preferences: NotificationPreferencesResponse = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      sms_enabled: true,
    }

    expect(isNotificationChannelEnabled(preferences, 'sms')).toBe(true)
  })
})
