// Feature: audit-remediation, Property 9: Frontend status set matches backend status set
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { APPLICATION_STATUSES } from '@/types/applicationStatus'
import { BACKEND_APPLICATION_STATUSES } from '@/types/__fixtures__/lifecycleStatusBackendMirror'

/**
 * Validates: Requirements 14.3
 *
 * The generated backend mirror is the canonical cross-layer fixture.
 * The frontend APPLICATION_STATUSES must match exactly — no phantom statuses,
 * no missing statuses.
 */

const BACKEND_STATUSES: ReadonlySet<string> = new Set(BACKEND_APPLICATION_STATUSES)

describe('Property 9: Frontend status set matches backend status set', () => {
  it('every frontend status exists in the backend status set', () => {
    const frontendStatusArb = fc.constantFrom(...APPLICATION_STATUSES)

    fc.assert(
      fc.property(frontendStatusArb, (status) => {
        expect(BACKEND_STATUSES.has(status)).toBe(true)
      }),
      { numRuns: 100 },
    )
  })

  it('every backend status exists in the frontend status set', () => {
    const backendStatusArb = fc.constantFrom(...BACKEND_STATUSES)
    const frontendSet = new Set<string>(APPLICATION_STATUSES)

    fc.assert(
      fc.property(backendStatusArb, (status) => {
        expect(frontendSet.has(status)).toBe(true)
      }),
      { numRuns: 100 },
    )
  })

  it('frontend and backend sets have the same size', () => {
    expect(APPLICATION_STATUSES.length).toBe(BACKEND_STATUSES.size)
  })
})
