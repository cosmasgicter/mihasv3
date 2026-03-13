import { describe, expect, it, vi } from 'vitest'

vi.mock('@/services/client', () => ({
  apiClient: {
    request: vi.fn()
  }
}))

import { routes } from '@/routes/config'
import { ADMIN_DASHBOARD_STATUS_KEYS, adminDashboardService } from '@/services/admin/dashboard'
import { apiClient } from '@/services/client'

describe('admin dashboard canonical route wiring', () => {
  it('resolves /admin/dashboard to a single routed page module', () => {
    const dashboardRoutes = routes.filter((route) => route.path === '/admin/dashboard')
    expect(dashboardRoutes).toHaveLength(1)

    const adminRootRoute = routes.find((route) => route.path === '/admin')
    expect(adminRootRoute).toBeDefined()
    expect(dashboardRoutes[0].element).toBe(adminRootRoute?.element)
  })
})

describe('admin dashboard data mapping', () => {
  it('keeps status breakdown keys consistent (approved/pending/rejected)', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce({
      stats: {
        approvedApplications: 4,
        pendingApplications: 3,
        rejectedApplications: 1
      },
      statusBreakdown: {
        approved: '4',
        pending: '3',
        rejected: '1',
        submitted: '2'
      }
    })

    const response = await adminDashboardService.getOverview()

    expect(ADMIN_DASHBOARD_STATUS_KEYS).toEqual(
      expect.arrayContaining(['approved', 'pending', 'rejected'])
    )

    const mapped = response.statusBreakdown
    for (const key of ['approved', 'pending', 'rejected'] as const) {
      expect(mapped).toHaveProperty(key)
      expect(typeof mapped[key]).toBe('number')
    }
  })
})
