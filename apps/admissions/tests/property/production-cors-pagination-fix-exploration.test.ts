// @vitest-environment node
/**
 * Bug Condition Exploration Tests — Production CORS & Pagination Fix
 *
 * Property 1: Bug Condition — Pagination Zero-Page
 *
 * CRITICAL: These tests MUST FAIL on unfixed code — failure confirms the bugs exist.
 * DO NOT attempt to fix the tests or the code when they fail.
 *
 * These tests encode the EXPECTED (correct) behavior. They will validate
 * the fixes when they pass after implementation.
 *
 * Bug: buildQueryString({ page: 0 }) produces "?page=0" but Django's
 * PageNumberPagination is 1-based and returns 404 for page=0.
 * The expected behavior is that page=0 should be clamped to page=1.
 *
 * Validates: Requirements 1.3, 1.4, 2.3, 2.4
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { buildQueryString } from '../../src/services/client'

// ===========================================================================
// Bug: Pagination sends page=0 — buildQueryString must clamp to page=1
// Validates: Requirements 1.3, 1.4, 2.3, 2.4
// ===========================================================================
describe('Bug: Pagination Zero-Page — buildQueryString must not produce page=0', () => {
  /**
   * **Validates: Requirements 1.3, 2.3**
   *
   * Property: When page=0 is passed to buildQueryString, the output query
   * string must contain "page=1" (clamped), NOT "page=0".
   *
   * On unfixed code: buildQueryString({ page: 0 }) produces "?page=0"
   * because it simply serializes the value as-is with String(0) = "0".
   * This should FAIL because page=0 is not clamped to page=1.
   */
  it('buildQueryString with page=0 produces page=1 not page=0', () => {
    fc.assert(
      fc.property(
        fc.constant(0),
        (page) => {
          const result = buildQueryString({ page })

          // Expected: page=0 should be clamped to page=1
          expect(result).toContain('page=1')
          expect(result).not.toContain('page=0')
        }
      ),
      { numRuns: 10 }
    )
  })

  /**
   * **Validates: Requirements 1.4, 2.4**
   *
   * Property: When page is undefined (simulating filters.page || 0 default),
   * buildQueryString should produce page=1 as the default, not omit it or
   * produce page=0.
   *
   * On unfixed code: data/applications.ts uses `filters.page || 0` which
   * defaults to 0 when page is undefined. The expected behavior is that
   * the resolved page should be >= 1.
   *
   * We test the buildQueryString level: passing page=0 (the result of
   * `undefined || 0`) should produce page=1.
   */
  it('page defaults to 1 when resolved from undefined (filters.page || 0 path)', () => {
    fc.assert(
      fc.property(
        // Simulate the `filters.page || 0` default path
        fc.constant(undefined as unknown as number),
        (pageFilter) => {
          // This is what the unfixed code does: filters.page || 0
          const resolvedPage = pageFilter || 0

          const result = buildQueryString({ page: resolvedPage })

          // Expected: even when page resolves to 0, the output should be page=1
          // On unfixed code, resolvedPage is 0 and buildQueryString produces "page=0"
          expect(result).toContain('page=1')
          expect(result).not.toContain('page=0')
        }
      ),
      { numRuns: 10 }
    )
  })
})
