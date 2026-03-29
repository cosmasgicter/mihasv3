import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('bulk/push client usage consistency', () => {
  it('uses apiClient for bulk admin mutations', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/components/admin/BulkOperationsPanel.tsx'), 'utf-8')
    expect(source).toContain("from '@/services/client'")
    expect(source).toContain("apiClient.request<{ success?: number; failed?: number; errors?: string[] }>('/admin?action=bulk-email'")
    expect(source).toContain("apiClient.request<{ success?: number; failed?: number; errors?: string[] }>('/admin?action=bulk-status'")
  })

  it('uses apiClient for push subscription sync', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/services/pushNotificationManager.ts'), 'utf-8')
    expect(source).toContain("from '@/services/client'")
    expect(source).toContain("apiClient.request('/notifications?action=push-subscribe'")
    expect(source).not.toContain("fetch('/api/notifications?action=push-subscribe'")
  })
})
