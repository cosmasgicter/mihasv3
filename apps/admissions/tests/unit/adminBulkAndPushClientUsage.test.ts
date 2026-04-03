import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('bulk/push client usage consistency', () => {
  it('routes bulk status changes through the current applications review flow', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/admin/Applications.tsx'), 'utf-8')
    // Bulk actions now use applicationService.bulkStatus() instead of mapping individual updateStatus calls
    expect(source).toContain('applicationService.bulkStatus')
    expect(source).not.toContain('/admin?action=bulk-status')
    expect(source).not.toContain('/admin?action=bulk-email')
  })

  it('uses apiClient for push subscription sync', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/services/pushNotificationManager.ts'), 'utf-8')
    expect(source).toContain("localStorage.setItem('push_subscription'")
    expect(source).toContain("apiClient.request('/notifications/push-subscribe/'")
  })
})
