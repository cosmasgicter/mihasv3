import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const requestSpy = vi.fn()

vi.mock('@/services/client', () => ({
  apiClient: {
    request: (...args: unknown[]) => requestSpy(...args),
  },
}))

describe('notificationService.updatePreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requestSpy.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('sends the backend flat preference fields without rewriting them', async () => {
    const { notificationService } = await import('@/services/notifications')

    await notificationService.updatePreferences({
      sms_enabled: true,
      push_enabled: false,
      application_updates: true,
      marketing_emails: false,
      quiet_hours_start: '22:00',
      quiet_hours_end: '06:00',
      timezone: 'Africa/Lusaka',
    })

    expect(requestSpy).toHaveBeenCalledWith('/notifications/preferences/', {
      method: 'PUT',
      body: JSON.stringify({
        push_enabled: false,
        sms_enabled: true,
        application_updates: true,
        marketing_emails: false,
        quiet_hours_start: '22:00',
        quiet_hours_end: '06:00',
        timezone: 'Africa/Lusaka',
      }),
    })
  })

  it('maps legacy whatsapp_enabled callers to push_enabled for backward compatibility', async () => {
    const { notificationService } = await import('@/services/notifications')

    await notificationService.updatePreferences({
      whatsapp_enabled: true,
    })

    expect(requestSpy).toHaveBeenCalledWith('/notifications/preferences/', {
      method: 'PUT',
      body: JSON.stringify({
        push_enabled: true,
      }),
    })
  })
})
