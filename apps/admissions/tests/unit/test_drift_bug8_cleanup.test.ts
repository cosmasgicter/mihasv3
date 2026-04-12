/**
 * Bug 8 (LOW) — Legacy duplicate frontend surfaces: Cleanup Verification Test
 *
 * Vitest tests verifying:
 * 1. Single notification export (no duplicate NotificationService class)
 * 2. Correct bulk status URL (/applications/bulk-status/)
 * 3. No legacy ApplicationsTable component file
 *
 * **Validates: Requirements 2.19, 2.20, 2.21**
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const ADMISSIONS_SRC = resolve(__dirname, '../../src')

describe('Bug 8 — Legacy cleanup verification', () => {
  describe('8.1 — Single notification export', () => {
    it('notifications.ts does not export a NotificationService class', () => {
      const filePath = resolve(ADMISSIONS_SRC, 'services/notifications.ts')
      const content = readFileSync(filePath, 'utf-8')

      // Should NOT have "export class NotificationService"
      expect(content).not.toMatch(/export\s+class\s+NotificationService/)

      // Should have the notificationService object export
      expect(content).toMatch(/export\s+const\s+notificationService/)
    })

    it('notificationService object includes template methods', () => {
      const filePath = resolve(ADMISSIONS_SRC, 'services/notifications.ts')
      const content = readFileSync(filePath, 'utf-8')

      // Template methods should be merged into the object
      expect(content).toContain('sendNotification')
      expect(content).toContain('sendWelcomeNotification')
      expect(content).toContain('sendApplicationStatusNotification')
    })
  })

  describe('8.2 — Correct bulk status URL', () => {
    it('applications.ts uses /applications/bulk-status/ not /applications/bulk', () => {
      const filePath = resolve(ADMISSIONS_SRC, 'data/applications.ts')
      const content = readFileSync(filePath, 'utf-8')

      // Should use the correct URL
      expect(content).toContain('/applications/bulk-status/')

      // Should NOT have the old incorrect URL (without trailing slash or -status)
      const bulkMatches = content.match(/\/applications\/bulk[^-]/g)
      expect(bulkMatches).toBeNull()
    })
  })

  describe('8.3 — No legacy ApplicationsTable component', () => {
    it('legacy ApplicationsTable.tsx does not exist at admin root', () => {
      const legacyPath = resolve(ADMISSIONS_SRC, 'components/admin/ApplicationsTable.tsx')
      expect(existsSync(legacyPath)).toBe(false)
    })

    it('active ApplicationsTable.tsx exists in applications subdirectory', () => {
      const activePath = resolve(ADMISSIONS_SRC, 'components/admin/applications/ApplicationsTable.tsx')
      expect(existsSync(activePath)).toBe(true)
    })
  })
})
