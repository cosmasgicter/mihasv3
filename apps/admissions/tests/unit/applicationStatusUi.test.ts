import { describe, expect, it } from 'vitest'
import { APPLICATION_STATUSES, formatApplicationStatus } from '@/types/applicationStatus'
import {
  BULK_ACTION_STATUS_MAP,
  STATUS_FILTER_OPTIONS,
  getApplicationStatusBadgeClass
} from '@/lib/applicationStatusUi'

describe('application status canonical values', () => {
  it('defines the single canonical status source', () => {
    expect(APPLICATION_STATUSES).toEqual([
      'draft',
      'submitted',
      'under_review',
      'approved',
      'rejected',
      'waitlisted',
      'pending_documents'
    ])
  })

  it('formats display labels without changing stored values', () => {
    expect(formatApplicationStatus('under_review')).toBe('Under Review')
    expect(formatApplicationStatus('pending_documents')).toBe('Pending Documents')
  })
})

describe('status filters, badges, and bulk actions', () => {
  it('builds status filter options from canonical values', () => {
    expect(STATUS_FILTER_OPTIONS.map(option => option.value)).toEqual(APPLICATION_STATUSES)
    expect(STATUS_FILTER_OPTIONS.find(option => option.value === 'under_review')?.label).toBe('Under Review')
  })

  it('maps all bulk actions to canonical status values', () => {
    expect(BULK_ACTION_STATUS_MAP).toEqual({
      approve: 'approved',
      reject: 'rejected',
      review: 'under_review'
    })
  })

  it('returns badge classes for canonical statuses', () => {
    for (const status of APPLICATION_STATUSES) {
      expect(getApplicationStatusBadgeClass(status)).toContain('text-')
    }
  })
})
