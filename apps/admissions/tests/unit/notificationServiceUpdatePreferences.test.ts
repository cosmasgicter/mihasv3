/**
 * The preference service sends writable fields, and nothing else.
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task 10.1.
 * Requirements: R13.8 (one persisted schema; unknown channels rejected).
 * Findings:     **STU-14**.
 *
 * ## Why this file changed
 *
 * It used to assert that `updatePreferences` forwarded `sms_enabled`,
 * `marketing_emails`, `quiet_hours_start`, `quiet_hours_end` and `timezone`
 * "without rewriting them" — i.e. it *pinned the retired contract*. Every one of
 * those five is now refused by the endpoint with a stated reason, because the
 * platform has no SMS provider, sends no marketing email, and has no
 * message-deferral scheduler to honour a quiet window with.
 *
 * The behavioural claim that survives is the one that mattered: the service does
 * not rewrite the body it is given. What changed is where the body comes from —
 * `buildPreferenceUpdate`, from the server's own `writable_fields` — so there is
 * no field allow-list in the service to drift from the backend's.
 */
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

  it('sends the body it is given, unchanged', async () => {
    const { notificationService } = await import('@/services/notifications')
    await notificationService.updatePreferences({ email_enabled: false })

    expect(requestSpy).toHaveBeenCalledWith('/notifications/preferences/', {
      method: 'PUT',
      body: JSON.stringify({ email_enabled: false }),
    })
  })

  it('sends one field per change rather than the whole schema', async () => {
    const { notificationService } = await import('@/services/notifications')
    await notificationService.updatePreferences({ payment_reminders: true })

    const [, options] = requestSpy.mock.calls[0] as [string, { body: string }]
    expect(Object.keys(JSON.parse(options.body))).toEqual(['payment_reminders'])
  })

  it('holds no allow-list that could drift from the backend’s', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const source = readFileSync(
      resolve(__dirname, '../../src/services/notifications.ts'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '')

    // The five retired fields no longer appear in executable code at all.
    for (const retired of [
      'sms_enabled',
      'whatsapp_enabled',
      'in_app_enabled',
      'marketing_emails',
      'quiet_hours_start',
      'quiet_hours_end',
    ]) {
      expect(source, retired).not.toContain(retired)
    }
  })

  it('exposes the retry command as a POST to the message’s own path', async () => {
    const { notificationService } = await import('@/services/notifications')
    await notificationService.retryDelivery('11111111-2222-3333-4444-555555555555')

    expect(requestSpy).toHaveBeenCalledWith(
      '/notifications/11111111-2222-3333-4444-555555555555/retry/',
      { method: 'POST' },
    )
  })

  it('encodes a message id rather than interpolating it raw', async () => {
    const { notificationService } = await import('@/services/notifications')
    await notificationService.retryDelivery('a b/c')

    const [path] = requestSpy.mock.calls[0] as [string]
    expect(path).toBe('/notifications/a%20b%2Fc/retry/')
  })
})
