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

  it('counts updated drafts and submitted applications as active today', () => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const overview = buildApplicationsOverview([
      {
        status: 'draft',
        payment_status: 'verified',
        updated_at: today.toISOString(),
        created_at: yesterday.toISOString(),
      },
      {
        status: 'submitted',
        payment_status: 'verified',
        submitted_at: today.toISOString(),
        created_at: yesterday.toISOString(),
      },
      {
        status: 'draft',
        payment_status: 'not_paid',
        created_at: yesterday.toISOString(),
      },
    ])

    expect(overview.todaySubmissions).toBe(2)
  })
})
