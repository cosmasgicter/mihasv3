import { describe, expect, it, vi } from 'vitest'

import { invalidateAdminApplicationQueries } from '@/hooks/admin/applicationQueryInvalidation'

describe('invalidateAdminApplicationQueries', () => {
  it('invalidates the shared admin application query set', async () => {
    const invalidateQueries = vi.fn(() => Promise.resolve())
    const queryClient = { invalidateQueries } as any

    await invalidateAdminApplicationQueries(queryClient, {
      applicationId: 'app-1',
      includeApplicationHistory: true,
      includePaymentStatus: true,
    })

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['applications'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['applications', 'app-1'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['application-stats'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['admin-applications'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['admin-dashboard-polling'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['application-history'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['payment-status'] })
  })
})
