import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestMock = vi.fn()

vi.mock('@/services/client', () => ({
  apiClient: { request: (...args: unknown[]) => requestMock(...args) },
  buildQueryString: (params: Record<string, unknown>) => {
    const query = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.set(key, String(value))
      }
    })
    const text = query.toString()
    return text ? `?${text}` : ''
  },
}))

vi.mock('@/lib/apiErrorLogger', () => ({
  logApiError: vi.fn(),
}))

import { tenantAdminService } from '@/services/admin/tenants'

describe('tenantAdminService', () => {
  beforeEach(() => {
    requestMock.mockReset()
    requestMock.mockResolvedValue({})
  })

  it('updates offering rules through the tenant-scoped admin endpoint', async () => {
    await tenantAdminService.updateOfferingRules('inst-1', 'offer-1', {
      assignment_priority: 3,
      assignment_rules: { allowed_countries: ['Zambia'] },
    })

    expect(requestMock).toHaveBeenCalledWith('/admin/institutions/inst-1/programs/offer-1/', {
      method: 'PATCH',
      body: JSON.stringify({
        assignment_priority: 3,
        assignment_rules: { allowed_countries: ['Zambia'] },
      }),
    })
  })
})
