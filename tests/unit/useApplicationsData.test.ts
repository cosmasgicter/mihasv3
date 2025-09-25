import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

import { useApplicationsData } from '@/hooks/admin/useApplicationsData'
import { DEFAULT_APPLICATION_FILTERS } from '@/hooks/admin/useApplicationFilters'
import type {
  AdminApplicationChange,
  AdminApplicationRow
} from '@/hooks/admin/useAdminRealtimeMetrics'

const realtimeMock = vi.hoisted(() => ({
  handler: null as ((change: AdminApplicationChange) => void) | null
}))

const supabaseMock = vi.hoisted(() => {
  type Filter = { column: string; value: unknown }

  const state = {
    rangeHandler: null as null | ((
      context: {
        table: string
        filters: Filter[]
        from: number
        to: number
        or?: string
      }
    ) => Promise<{ data: any; count: number; error: null }>),
    singleHandler: null as null | ((
      context: { table: string; filters: Filter[] }
    ) => Promise<{ data: any; error: null }>)
  }

  class QueryBuilder {
    private filters: Filter[] = []
    private orClause?: string

    constructor(private readonly table: string) {}

    select() {
      return this
    }

    or(value: string) {
      this.orClause = value
      return this
    }

    eq(column: string, value: unknown) {
      this.filters.push({ column, value })
      return this
    }

    order() {
      return this
    }

    range(from: number, to: number) {
      const handler = supabaseMock.state.rangeHandler
      if (!handler) {
        return Promise.resolve({ data: [], count: 0, error: null })
      }
      return handler({
        table: this.table,
        filters: [...this.filters],
        from,
        to,
        or: this.orClause
      })
    }

    single() {
      const handler = supabaseMock.state.singleHandler
      if (!handler) {
        return Promise.resolve({ data: null, error: null })
      }
      return handler({ table: this.table, filters: [...this.filters] })
    }
  }

  return {
    state,
    createBuilder: (table: string) => new QueryBuilder(table)
  }
})

vi.mock('@/hooks/admin/useAdminRealtimeMetrics', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/admin/useAdminRealtimeMetrics')>(
    '@/hooks/admin/useAdminRealtimeMetrics'
  )

  return {
    ...actual,
    useAdminRealtimeMetrics: vi.fn().mockImplementation(({ onChange } = {}) => {
      realtimeMock.handler = onChange ?? null
      return {
        isConnected: true,
        lastEventAt: null,
        error: null
      }
    })
  }
})

vi.mock('@/lib/supabase', () => ({
  __esModule: true,
  supabase: {
    from: (table: string) => supabaseMock.createBuilder(table)
  }
}))

const buildRealtimeChange = (
  override: Partial<AdminApplicationChange>
): AdminApplicationChange => ({
  type: 'insert',
  targetId: 'application-id',
  newRow: null,
  oldRow: null,
  metricsDelta: {
    totalApplications: 0,
    pendingApplications: 0,
    approvedApplications: 0,
    rejectedApplications: 0,
    todayApplications: 0,
    weekApplications: 0,
    monthApplications: 0
  },
  ...override
})

const createRealtimeRow = (
  overrides: Partial<AdminApplicationRow>
): AdminApplicationRow => ({
  id: 'application-id',
  application_number: 'APP-1',
  full_name: 'Test User',
  email: 'user@example.com',
  phone: '1234567890',
  program: 'Computer Science',
  intake: '2024',
  institution: 'Test University',
  status: 'approved',
  payment_status: 'verified',
  submitted_at: '2024-01-01T00:00:00.000Z',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  payment_verified_at: null,
  payment_verified_by: null,
  payment_verified_by_name: null,
  payment_verified_by_email: null,
  last_payment_audit_id: null,
  last_payment_audit_at: null,
  last_payment_audit_by_name: null,
  last_payment_audit_by_email: null,
  last_payment_audit_notes: null,
  last_payment_reference: null,
  application_fee: 0,
  amount: null,
  paid_amount: null,
  result_slip_url: null,
  extra_kyc_url: null,
  pop_url: null,
  grades_summary: null,
  total_subjects: null,
  points: null,
  days_since_submission: null,
  user_id: null,
  nrc_number: null,
  passport_number: null,
  ...overrides
})

const createSummary = (overrides: Record<string, unknown> = {}) => ({
  id: 'application-id',
  application_number: 'APP-1',
  full_name: 'Test User',
  email: 'user@example.com',
  phone: '1234567890',
  program: 'Computer Science',
  intake: '2024',
  institution: 'Test University',
  status: 'approved',
  payment_status: 'verified',
  payment_verified_at: null,
  payment_verified_by: null,
  payment_verified_by_name: null,
  payment_verified_by_email: null,
  last_payment_audit_id: null,
  last_payment_audit_at: null,
  last_payment_audit_by_name: null,
  last_payment_audit_by_email: null,
  last_payment_audit_notes: null,
  last_payment_reference: null,
  application_fee: 0,
  paid_amount: 0,
  submitted_at: '2024-01-01T00:00:00.000Z',
  created_at: '2024-01-01T00:00:00.000Z',
  result_slip_url: '',
  extra_kyc_url: '',
  pop_url: '',
  grades_summary: '',
  total_subjects: 0,
  points: 0,
  age: 0,
  days_since_submission: 0,
  ...overrides
})

describe('useApplicationsData realtime filtering', () => {
  let rangeHandler: ReturnType<typeof vi.fn>
  let singleHandler: ReturnType<typeof vi.fn>

  beforeEach(() => {
    realtimeMock.handler = null

    rangeHandler = vi.fn().mockResolvedValue({ data: [], count: 0, error: null })
    singleHandler = vi.fn().mockResolvedValue({ data: null, error: null })

    supabaseMock.state.rangeHandler = rangeHandler
    supabaseMock.state.singleHandler = singleHandler
  })

  it('ignores realtime inserts that do not satisfy active filters', async () => {
    const filters = {
      ...DEFAULT_APPLICATION_FILTERS,
      statusFilter: 'approved',
      paymentFilter: 'verified',
      programFilter: 'Computer Science',
      institutionFilter: 'Test University',
      searchTerm: 'test'
    }

    const { result } = renderHook(() => useApplicationsData(filters))

    await waitFor(() => expect(result.current.isInitialLoading).toBe(false))

    expect(realtimeMock.handler).toBeInstanceOf(Function)

    const mismatchedRow = createRealtimeRow({
      id: 'application-other',
      status: 'submitted',
      payment_status: 'pending_review',
      program: 'Business',
      institution: 'Other University'
    })

    await act(async () => {
      realtimeMock.handler?.(
        buildRealtimeChange({
          type: 'insert',
          targetId: mismatchedRow.id,
          newRow: mismatchedRow
        })
      )
      await Promise.resolve()
    })

    expect(singleHandler).not.toHaveBeenCalled()
    expect(result.current.applications).toHaveLength(0)
    await waitFor(() => expect(result.current.pagination.totalCount).toBe(0))
  })

  it('removes realtime updates that fall outside active filters', async () => {
    const summary = createSummary()

    rangeHandler.mockResolvedValueOnce({
      data: [summary],
      count: 1,
      error: null
    })

    const filters = {
      ...DEFAULT_APPLICATION_FILTERS,
      programFilter: 'Computer Science',
      institutionFilter: 'Test University'
    }

    const { result } = renderHook(() => useApplicationsData(filters))

    await waitFor(() => expect(result.current.isInitialLoading).toBe(false))
    await waitFor(() => expect(result.current.applications).toHaveLength(1))
    expect(result.current.pagination.totalCount).toBe(1)

    expect(realtimeMock.handler).toBeInstanceOf(Function)

    const matchingOldRow = createRealtimeRow({
      id: summary.id,
      program: 'Computer Science',
      institution: 'Test University'
    })

    const updatedRow = createRealtimeRow({
      id: summary.id,
      program: 'Business Administration',
      institution: 'Another University'
    })

    await act(async () => {
      realtimeMock.handler?.(
        buildRealtimeChange({
          type: 'update',
          targetId: summary.id,
          newRow: updatedRow,
          oldRow: matchingOldRow
        })
      )
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current.applications).toHaveLength(0))
    expect(singleHandler).not.toHaveBeenCalled()
  })
})
