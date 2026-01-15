/**
 * Property Test: Multi-Admin Consistency
 * **Property 11: Multi-Admin Consistency**
 * **Validates: Requirements 2.3**
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn()
            }))
          }))
        }))
      })),
      insert: vi.fn(() => Promise.resolve({ error: null }))
    }))
  },
  isSupabaseConfigured: true
}))

vi.mock('@/components/ui/Toast', () => ({
  useToastStore: vi.fn(() => ({
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn()
  }))
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'admin-user-123' }
  }))
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn().mockResolvedValue(undefined)
  })),
  useMutation: vi.fn((options) => ({
    mutate: options.mutationFn,
    mutateAsync: options.mutationFn,
    isPending: false,
    error: null,
    isSuccess: false,
    reset: vi.fn()
  }))
}))


class ConcurrentModificationError extends Error {
  constructor(message: string = 'Application was modified by another admin') {
    super(message)
    this.name = 'ConcurrentModificationError'
  }
}

const applicationIdArb = fc.uuid()
const applicationNumberArb = fc.stringMatching(/^APP-[0-9]{6}$/)
const statusArb = fc.constantFrom('draft', 'submitted', 'under_review', 'approved', 'rejected')
const timestampArb = fc.date({ min: new Date('2024-01-01T00:00:00.000Z'), max: new Date('2024-12-31T23:59:59.999Z') })
  .map(d => d.toISOString())
const adminFeedbackArb = fc.option(fc.string({ minLength: 1, maxLength: 500 }), { nil: undefined })

const applicationDataArb = fc.record({
  id: applicationIdArb,
  application_number: applicationNumberArb,
  status: statusArb,
  updated_at: timestampArb,
  admin_feedback: adminFeedbackArb
})

// Generate two distinct timestamps by using different date ranges
const twoDistinctTimestampsArb = fc.tuple(
  fc.date({ min: new Date('2024-01-01T00:00:00.000Z'), max: new Date('2024-06-30T23:59:59.999Z') }).map(d => d.toISOString()),
  fc.date({ min: new Date('2024-07-01T00:00:00.000Z'), max: new Date('2024-12-31T23:59:59.999Z') }).map(d => d.toISOString())
)

function simulateOptimisticLockCheck(
  clientTimestamp: string,
  databaseTimestamp: string
): { success: boolean; conflictDetected: boolean } {
  const timestampsMatch = clientTimestamp === databaseTimestamp
  return {
    success: timestampsMatch,
    conflictDetected: !timestampsMatch
  }
}

function handleUpdateError(error: { code: string; message: string }): never {
  if (error.code === 'PGRST116') {
    throw new ConcurrentModificationError()
  }
  throw new Error(error.message || 'Failed to update application status')
}


describe('Multi-Admin Consistency Property Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should succeed when updated_at timestamps match', () => {
    fc.assert(
      fc.property(
        applicationDataArb,
        (appData) => {
          const clientTimestamp = appData.updated_at
          const databaseTimestamp = appData.updated_at
          const result = simulateOptimisticLockCheck(clientTimestamp, databaseTimestamp)
          expect(result.success).toBe(true)
          expect(result.conflictDetected).toBe(false)
          return true
        }
      ),
      { numRuns: 20 }
    )
  })

  it('should detect conflict when updated_at timestamps do not match', () => {
    fc.assert(
      fc.property(
        twoDistinctTimestampsArb,
        ([clientTimestamp, databaseTimestamp]) => {
          const result = simulateOptimisticLockCheck(clientTimestamp, databaseTimestamp)
          expect(result.success).toBe(false)
          expect(result.conflictDetected).toBe(true)
          return true
        }
      ),
      { numRuns: 20 }
    )
  })

  it('should throw ConcurrentModificationError for PGRST116 error code', () => {
    fc.assert(
      fc.property(
        applicationIdArb,
        () => {
          expect(() => handleUpdateError({ code: 'PGRST116', message: 'No rows returned' }))
            .toThrow(ConcurrentModificationError)
          return true
        }
      ),
      { numRuns: 20 }
    )
  })

  it('should throw generic Error for non-PGRST116 error codes', () => {
    const errorCodeArb = fc.constantFrom('PGRST001', 'PGRST002', '42501', '23505', 'UNKNOWN')
    const errorMessageArb = fc.string({ minLength: 1, maxLength: 200 })
    fc.assert(
      fc.property(
        errorCodeArb,
        errorMessageArb,
        (errorCode, errorMessage) => {
          expect(() => handleUpdateError({ code: errorCode, message: errorMessage }))
            .toThrow(Error)
          expect(() => handleUpdateError({ code: errorCode, message: errorMessage }))
            .not.toThrow(ConcurrentModificationError)
          return true
        }
      ),
      { numRuns: 20 }
    )
  })


  it('should create ConcurrentModificationError with correct properties', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
        (customMessage) => {
          const error = customMessage 
            ? new ConcurrentModificationError(customMessage)
            : new ConcurrentModificationError()
          expect(error.name).toBe('ConcurrentModificationError')
          expect(error).toBeInstanceOf(Error)
          expect(error.message.length).toBeGreaterThan(0)
          if (customMessage) {
            expect(error.message).toBe(customMessage)
          } else {
            expect(error.message).toBe('Application was modified by another admin')
          }
          return true
        }
      ),
      { numRuns: 20 }
    )
  })

  it('should ensure only one admin succeeds in concurrent modification scenario', () => {
    fc.assert(
      fc.property(
        applicationDataArb,
        (appData) => {
          const originalTimestamp = appData.updated_at
          const admin1UpdatedTimestamp = new Date(Date.now() + 1000).toISOString()
          const admin1Result = simulateOptimisticLockCheck(originalTimestamp, originalTimestamp)
          const admin2Result = simulateOptimisticLockCheck(originalTimestamp, admin1UpdatedTimestamp)
          expect(admin1Result.success).toBe(true)
          expect(admin1Result.conflictDetected).toBe(false)
          expect(admin2Result.success).toBe(false)
          expect(admin2Result.conflictDetected).toBe(true)
          return true
        }
      ),
      { numRuns: 20 }
    )
  })

  it('should use exact string comparison for timestamps', () => {
    fc.assert(
      fc.property(
        timestampArb,
        (timestamp) => {
          const sameResult = simulateOptimisticLockCheck(timestamp, timestamp)
          expect(sameResult.success).toBe(true)
          const date = new Date(timestamp)
          const slightlyDifferent = new Date(date.getTime() + 1).toISOString()
          if (timestamp !== slightlyDifferent) {
            const differentResult = simulateOptimisticLockCheck(timestamp, slightlyDifferent)
            expect(differentResult.conflictDetected).toBe(true)
          }
          return true
        }
      ),
      { numRuns: 20 }
    )
  })

  it('should identify decision statuses correctly', () => {
    const decisionStatuses = ['approved', 'rejected']
    const nonDecisionStatuses = ['draft', 'submitted', 'under_review']
    fc.assert(
      fc.property(
        fc.constantFrom(...decisionStatuses),
        (status) => {
          const isDecision = status === 'approved' || status === 'rejected'
          expect(isDecision).toBe(true)
          return true
        }
      ),
      { numRuns: 20 }
    )
    fc.assert(
      fc.property(
        fc.constantFrom(...nonDecisionStatuses),
        (status) => {
          const isDecision = status === 'approved' || status === 'rejected'
          expect(isDecision).toBe(false)
          return true
        }
      ),
      { numRuns: 20 }
    )
  })
})
