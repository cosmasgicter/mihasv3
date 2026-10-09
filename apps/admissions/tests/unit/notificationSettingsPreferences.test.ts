/**
 * The settings page no longer owns a preference shape.
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task 10.1.
 * Requirements: R13.8 (one persisted backend/frontend schema).
 * Findings:     **STU-14**.
 *
 * ## Why this file changed shape
 *
 * It used to import three helpers **from the page component**:
 * `DEFAULT_NOTIFICATION_PREFERENCES`, `normalizeNotificationPreferences` and
 * `isNotificationChannelEnabled`, plus a `NotificationPreferencesResponse` type
 * declaring nine flat fields. Those helpers are exactly the second schema STU-14
 * is about: a page-local default object that disagreed with the database, a
 * normalizer that quietly filled in fields the backend does not publish, and a
 * channel reader hardcoded to `sms` — a channel the platform cannot send.
 *
 * They are gone, and there is nothing to replace them with, because the schema is
 * the server's. So what this file asserts now is the **absence**: the page exports
 * no preference shape, declares no channel, and names no field list. The
 * behavioural claims moved to `notificationSettingsControls.test.tsx` and
 * `notificationPreferenceSchema.test.ts`.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const PAGE = resolve(__dirname, '../../src/pages/student/NotificationSettings.tsx')
const source = readFileSync(PAGE, 'utf8')

/** Strip block comments so the page's own account of the defect is not scanned. */
function executable(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/**
 * Drop the display-label map before scanning for field names.
 *
 * `PREFERENCE_LABELS` maps the server's own field keys to human copy, which is
 * why the "What this platform does not do" list can say "Quiet hours" instead of
 * `quiet_hours_start`. Those keys must therefore appear in the page — and a guard
 * that forbade the literal strings could only be satisfied by deleting the copy
 * and rendering raw column names at a student. So the field-name scan runs over
 * the page **minus** the map, and the separate comparison scan below runs over
 * the whole file: a label may name a field, but nothing may *decide* from one.
 */
function withoutLabelMap(text: string): string {
  return text.replace(
    /export const PREFERENCE_LABELS[\s\S]*?\n\}/,
    'export const PREFERENCE_LABELS = {}',
  )
}

describe('NotificationSettings owns no preference schema', () => {
  it('exports no page-local default preference object', async () => {
    const page = await import('@/pages/student/NotificationSettings')
    expect(page).not.toHaveProperty('DEFAULT_NOTIFICATION_PREFERENCES')
    expect(page).not.toHaveProperty('normalizeNotificationPreferences')
    expect(page).not.toHaveProperty('isNotificationChannelEnabled')
  })

  it('declares no channel or category name in executable code', () => {
    // Field-shaped declarations: none outside the copy map.
    const decisions = withoutLabelMap(executable(source))
    for (const forbidden of [
      'sms_enabled:',
      'whatsapp_enabled:',
      'quiet_hours_start:',
      'quiet_hours_end:',
      'timezone:',
      'email_enabled:',
      'payment_reminders:',
      'interview_reminders:',
    ]) {
      expect(decisions, forbidden).not.toContain(forbidden)
    }
  })

  it('branches on no channel or category name anywhere, including the copy map', () => {
    // A comparison is a decision, so this one scans the whole file — the label
    // map is allowed to *name* a field and forbidden to *decide* from one.
    const code = executable(source)
    for (const comparison of [
      "=== 'sms",
      "=== 'whatsapp",
      "=== 'in_app_enabled",
      "=== 'application_updates",
      "=== 'payment_reminders",
      "=== 'marketing_emails",
      "!== 'sms",
      "includes('sms",
    ]) {
      expect(code, comparison).not.toContain(comparison)
    }
  })

  it('renders switches from the server’s configurable flag, not from a local list', () => {
    const code = executable(source)
    expect(code).toContain('row.configurable')
    expect(code).toContain('buildPreferenceUpdate')
    // No hardcoded array of preference field names anywhere in the page.
    expect(code).not.toMatch(/const\s+\w*(FIELDS|CHANNELS|CATEGORIES)\s*=\s*\[/)
  })

  it('no longer embeds a second inbox', () => {
    const code = executable(source)
    for (const inboxOnly of [
      'markAllRead',
      'deleteNotification',
      'useNotificationPolling',
      'unreadCount',
    ]) {
      expect(code, inboxOnly).not.toContain(inboxOnly)
    }
  })

  it('takes its title and support affordance from tenant context (STU-24)', () => {
    const code = executable(source)
    expect(code).toContain('usePortalBrand')
    expect(code).toContain('resolveTenantSupportContact')
    expect(code).not.toContain('Beanola')
    expect(code).not.toMatch(/MIHAS|KATC/)
    expect(code).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)
  })
})
