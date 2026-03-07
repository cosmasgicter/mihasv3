import { describe, expect, it } from 'vitest'

import { buildApplicationsOverview } from '@/pages/admin/lib/applicationsOverview'

describe('buildApplicationsOverview', () => {
  it('prefers the API total count over the loaded page length', () => {
    const loadedApplications = Array.from({ length: 25 }, (_, index) => ({
      id: `app-${index + 1}`,
      status: index % 2 === 0 ? 'submitted' : 'approved',
      payment_status: index % 3 === 0 ? 'pending_review' : 'verified',
      submitted_at: '2026-03-07T08:00:00.000Z',
      created_at: '2026-03-07T08:00:00.000Z',
    }))

    const overview = buildApplicationsOverview(loadedApplications, 62)

    expect(overview.total).toBe(62)
    expect(overview.loadedCount).toBe(25)
    expect(overview.pendingReview).toBeGreaterThan(0)
    expect(overview.approved).toBeGreaterThan(0)
  })
})
