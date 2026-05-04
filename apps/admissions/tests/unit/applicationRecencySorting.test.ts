import { describe, expect, it } from 'vitest'

import { normalizePaginatedApplications, sortApplicationsByActivity } from '@/services/applications'
import type { Application } from '@/types/database'

const application = (overrides: Partial<Application>): Application => ({
  id: overrides.id ?? 'app',
  user_id: 'student-1',
  status: 'draft',
  created_at: '2026-05-01T08:00:00.000Z',
  ...overrides,
})

describe('application recency sorting', () => {
  it('orders applications by submitted, then updated, then created time', () => {
    const sorted = sortApplicationsByActivity([
      application({
        id: 'older-submitted',
        status: 'submitted',
        submitted_at: '2026-05-03T08:00:00.000Z',
        updated_at: '2026-05-04T13:00:00.000Z',
      }),
      application({
        id: 'fresh-draft',
        status: 'draft',
        updated_at: '2026-05-04T12:00:00.000Z',
      }),
      application({
        id: 'new-submitted',
        status: 'submitted',
        submitted_at: '2026-05-04T10:00:00.000Z',
      }),
    ])

    expect(sorted.map(app => app.id)).toEqual(['fresh-draft', 'new-submitted', 'older-submitted'])
  })

  it('normalizes API pages into most-recent-first order', () => {
    const result = normalizePaginatedApplications({
      results: [
        application({ id: 'old', created_at: '2026-05-01T08:00:00.000Z' }),
        application({ id: 'current', updated_at: '2026-05-04T11:00:00.000Z' }),
      ],
      count: 2,
      page: 1,
      pageSize: 20,
    })

    expect(result.applications.map(app => app.id)).toEqual(['current', 'old'])
    expect(result.totalCount).toBe(2)
  })
})
