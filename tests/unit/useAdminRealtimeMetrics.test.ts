import { describe, expect, it } from 'vitest'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import {
  deriveMetricsDelta,
  type AdminApplicationRow,
  type ApplicationStatus,
  type AdminMetricsDelta
} from '@/hooks/admin/useAdminRealtimeMetrics'

const createRow = (status: ApplicationStatus | null): AdminApplicationRow => ({
  id: 'application-id',
  application_number: null,
  full_name: null,
  email: null,
  phone: null,
  program: null,
  intake: null,
  institution: null,
  status,
  payment_status: null,
  submitted_at: '2000-01-01T00:00:00.000Z',
  created_at: '2000-01-01T00:00:00.000Z',
  updated_at: '2000-01-01T00:00:00.000Z'
})

const buildPayload = (
  eventType: 'INSERT' | 'UPDATE' | 'DELETE',
  newRow: AdminApplicationRow | null,
  oldRow: AdminApplicationRow | null
): RealtimePostgresChangesPayload<AdminApplicationRow> => ({
  eventType,
  new: newRow,
  old: oldRow
} as unknown as RealtimePostgresChangesPayload<AdminApplicationRow>)

describe('deriveMetricsDelta pending application logic', () => {
  it('treats under_review inserts as pending applications', () => {
    const payload = buildPayload('INSERT', createRow('under_review'), null)

    const delta = deriveMetricsDelta(payload)

    expect(delta).toMatchObject<Partial<AdminMetricsDelta>>({
      totalApplications: 1,
      pendingApplications: 1,
      approvedApplications: 0,
      rejectedApplications: 0
    })
  })

  it('treats under_review deletions as pending application removals', () => {
    const payload = buildPayload('DELETE', null, createRow('under_review'))

    const delta = deriveMetricsDelta(payload)

    expect(delta).toMatchObject<Partial<AdminMetricsDelta>>({
      totalApplications: -1,
      pendingApplications: -1,
      approvedApplications: 0,
      rejectedApplications: 0
    })
  })

  it.each<[
    ApplicationStatus,
    ApplicationStatus,
    { pending: number; approved?: number; rejected?: number }
  ]>([
    ['submitted', 'under_review', { pending: 0 }],
    ['under_review', 'submitted', { pending: 0 }],
    ['under_review', 'approved', { pending: -1, approved: 1 }],
    ['approved', 'under_review', { pending: 1, approved: -1 }],
    ['under_review', 'rejected', { pending: -1, rejected: 1 }],
    ['rejected', 'under_review', { pending: 1, rejected: -1 }]
  ])(
    'tracks pending applications correctly when transitioning from %s to %s',
    (oldStatus, newStatus, expected) => {
      const payload = buildPayload('UPDATE', createRow(newStatus), createRow(oldStatus))

      const delta = deriveMetricsDelta(payload)

      expect(delta.pendingApplications).toBe(expected.pending)
      expect(delta.approvedApplications).toBe(expected.approved ?? 0)
      expect(delta.rejectedApplications).toBe(expected.rejected ?? 0)
    }
  )
})
