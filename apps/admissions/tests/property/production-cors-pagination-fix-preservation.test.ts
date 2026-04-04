// @vitest-environment node
/**
 * Preservation Property Tests — Production CORS & Pagination Fix
 *
 * Property 2: Preservation — Valid Pagination Unchanged
 *
 * These tests MUST PASS on unfixed code — they capture baseline behavior
 * to preserve. They verify that buildQueryString correctly serializes
 * valid page values (>= 1) and non-page parameters unchanged.
 *
 * Validates: Requirements 3.3, 3.7
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { buildQueryString } from '../../src/services/client'

// ===========================================================================
// Preservation: Valid page values [1, 1000] pass through unchanged
// Validates: Requirements 3.3
// ===========================================================================
describe('Preservation: Valid page values pass through buildQueryString unchanged', () => {
  /**
   * **Validates: Requirements 3.3**
   *
   * Property: For any page value in [1, 1000], buildQueryString output
   * contains page=N exactly as provided. The pagination fix must not
   * alter valid page values.
   */
  it('buildQueryString preserves page values in [1, 1000]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        (page) => {
          const result = buildQueryString({ page })
          expect(result).toContain(`page=${page}`)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ===========================================================================
// Preservation: Non-page params serialize identically
// Validates: Requirements 3.7
// ===========================================================================
describe('Preservation: Non-page params serialize identically through buildQueryString', () => {
  /**
   * **Validates: Requirements 3.7**
   *
   * Property: For any combination of non-page parameters (status, search,
   * sortBy, sortOrder), buildQueryString serializes them identically.
   * The pagination fix must not affect non-page parameter serialization.
   */
  it('non-page params are serialized unchanged', () => {
    const statusArb = fc.constantFrom('pending', 'approved', 'rejected', 'draft', 'submitted')
    const searchArb = fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/)
    const sortByArb = fc.constantFrom('createdAt', 'updatedAt', 'name', 'status')
    const sortOrderArb = fc.constantFrom('asc', 'desc')

    fc.assert(
      fc.property(
        fc.record({
          status: fc.option(statusArb, { nil: undefined }),
          search: fc.option(searchArb, { nil: undefined }),
          sortBy: fc.option(sortByArb, { nil: undefined }),
          sortOrder: fc.option(sortOrderArb, { nil: undefined }),
        }),
        (params) => {
          const result = buildQueryString(params)

          // Each defined param must appear in the query string
          for (const [key, value] of Object.entries(params)) {
            if (value !== undefined && value !== null && value !== '') {
              expect(result).toContain(`${key}=${encodeURIComponent(String(value))}`)
            }
          }

          // If all params are undefined, result should be empty
          const hasAnyParam = Object.values(params).some(
            (v) => v !== undefined && v !== null && v !== ''
          )
          if (!hasAnyParam) {
            expect(result).toBe('')
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
