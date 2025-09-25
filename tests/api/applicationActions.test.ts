import { describe, it, expect, beforeEach, vi } from 'vitest'

const supabaseMock = {
  from: vi.fn()
}

vi.mock('../../api/_lib/supabaseClient.js', () => ({
  supabaseAdminClient: supabaseMock
}))

const { updateStatusForApplications } = await import('../../api/applications/applicationActions.js')

describe('updateStatusForApplications', () => {
  beforeEach(() => {
    supabaseMock.from.mockReset()
  })

  it('decrements available spots when approving a new application', async () => {
    const existingApplications = [
      { id: 'app-1', status: 'under_review', intake_id: 'intake-1' }
    ]

    const intakeState = { available_spots: 5, total_capacity: 10 }

    const applicationSelectIn = vi.fn().mockResolvedValue({ data: existingApplications, error: null })
    const applicationSelect = vi.fn(() => ({ in: applicationSelectIn }))
    const applicationUpdateIn = vi.fn().mockResolvedValue({ error: null })
    const applicationUpdate = vi.fn(() => ({ in: applicationUpdateIn }))

    const intakeSelectMaybeSingle = vi.fn().mockImplementation(() =>
      Promise.resolve({
        data: { id: 'intake-1', available_spots: intakeState.available_spots, total_capacity: intakeState.total_capacity },
        error: null
      })
    )
    const intakeSelectEq = vi.fn(() => ({ maybeSingle: intakeSelectMaybeSingle }))
    const intakeSelect = vi.fn(() => ({ eq: intakeSelectEq }))

    const intakeUpdateEq = vi.fn((column: string, value: string) => {
      expect(column).toBe('id')
      expect(value).toBe('intake-1')
      return Promise.resolve({ error: null })
    })
    const intakeUpdate = vi.fn(({ available_spots }: { available_spots: number }) => {
      intakeState.available_spots = available_spots
      return { eq: intakeUpdateEq }
    })

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'applications_new') {
        return { select: applicationSelect, update: applicationUpdate }
      }
      if (table === 'intakes') {
        return { select: intakeSelect, update: intakeUpdate }
      }
      throw new Error(`Unexpected table ${table}`)
    })

    const result = await updateStatusForApplications(['app-1'], 'approved')

    expect(result.updateData.status).toBe('approved')
    expect(applicationSelect).toHaveBeenCalled()
    expect(applicationUpdate).toHaveBeenCalled()
    expect(intakeSelect).toHaveBeenCalled()
    expect(intakeUpdate).toHaveBeenCalled()
    expect(intakeState.available_spots).toBe(4)
  })

  it('increments available spots when an approved application is changed', async () => {
    const existingApplications = [
      { id: 'app-2', status: 'approved', intake: 'July Intake' }
    ]

    const intakeState = { available_spots: 0, total_capacity: 3 }

    const applicationSelect = vi.fn(() => ({
      in: vi.fn().mockResolvedValue({ data: existingApplications, error: null })
    }))
    const applicationUpdate = vi.fn(() => ({
      in: vi.fn().mockResolvedValue({ error: null })
    }))

    const intakeSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'intake-2', available_spots: intakeState.available_spots, total_capacity: intakeState.total_capacity },
          error: null
        })
      }))
    }))

    const intakeUpdate = vi.fn(({ available_spots }: { available_spots: number }) => ({
      eq: vi.fn((column: string, value: string) => {
        expect(column).toBe('name')
        expect(value).toBe('July Intake')
        intakeState.available_spots = available_spots
        return Promise.resolve({ error: null })
      })
    }))

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'applications_new') {
        return { select: applicationSelect, update: applicationUpdate }
      }
      if (table === 'intakes') {
        return { select: intakeSelect, update: intakeUpdate }
      }
      throw new Error(`Unexpected table ${table}`)
    })

    await updateStatusForApplications(['app-2'], 'rejected')

    expect(intakeUpdate).toHaveBeenCalled()
    expect(intakeState.available_spots).toBe(1)
  })

  it('skips intake updates when applications have no intake reference', async () => {
    const existingApplications = [
      { id: 'app-3', status: 'under_review' }
    ]

    const applicationSelect = vi.fn(() => ({
      in: vi.fn().mockResolvedValue({ data: existingApplications, error: null })
    }))
    const applicationUpdate = vi.fn(() => ({
      in: vi.fn().mockResolvedValue({ error: null })
    }))

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'applications_new') {
        return { select: applicationSelect, update: applicationUpdate }
      }
      throw new Error(`Intakes table should not be queried for table ${table}`)
    })

    await updateStatusForApplications(['app-3'], 'approved')

    expect(applicationSelect).toHaveBeenCalled()
    expect(applicationUpdate).toHaveBeenCalled()
  })
})
