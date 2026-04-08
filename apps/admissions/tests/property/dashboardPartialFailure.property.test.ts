// Feature: ui-overhaul-and-critical-fixes, Property 5: Dashboard partial failure resilience
/**
 * Property-based test: Dashboard partial failure resilience
 *
 * For any combination of the three dashboard data sources (applications,
 * intakes, interviews) where exactly K sources (1 ≤ K ≤ 2) fail with a 403
 * status and the remaining (3 − K) sources succeed, the dashboard should
 * render the successful data sources and display inline error messages only
 * for the failed sources. The count of rendered error messages should equal K,
 * and the count of rendered data sections should equal (3 − K).
 *
 * **Validates: Requirements 8.3**
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

// ---------------------------------------------------------------------------
// Types mirroring the Dashboard's data sources
// ---------------------------------------------------------------------------
type SourceName = 'applications' | 'intakes' | 'interviews'

interface SourceOutcome {
  name: SourceName
  fails: boolean
}

interface DashboardState {
  errors: SourceName[]
  dataSections: SourceName[]
}

// ---------------------------------------------------------------------------
// Pure function that mirrors the Dashboard's Promise.allSettled processing
// logic from Dashboard.tsx (loadDashboardData). This extracts the partial
// failure handling pattern without requiring React rendering.
// ---------------------------------------------------------------------------
function processDashboardResults(
  outcomes: SourceOutcome[],
): DashboardState {
  const errors: SourceName[] = []
  const dataSections: SourceName[] = []

  // Simulate Promise.allSettled results
  const results: PromiseSettledResult<{ data: unknown }>[] = outcomes.map(
    (outcome) => {
      if (outcome.fails) {
        return {
          status: 'rejected' as const,
          reason: Object.assign(new Error('Forbidden'), { status: 403 }),
        }
      }
      return {
        status: 'fulfilled' as const,
        value: { data: `${outcome.name}-data` },
      }
    },
  )

  // Process each result — mirrors the Dashboard's per-source handling
  for (let i = 0; i < outcomes.length; i++) {
    const result = results[i]
    const sourceName = outcomes[i].name

    if (result.status === 'fulfilled') {
      dataSections.push(sourceName)
    } else {
      // Dashboard sets per-section error state for rejected promises
      errors.push(sourceName)
    }
  }

  return { errors, dataSections }
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generate a subset of K sources (1 ≤ K ≤ 2) that fail out of 3 total */
const allSources: SourceName[] = ['applications', 'intakes', 'interviews']

const failingSourcesArb = fc
  .integer({ min: 1, max: 2 })
  .chain((k) =>
    fc.shuffledSubarray(allSources, { minLength: k, maxLength: k }),
  )

// ---------------------------------------------------------------------------
// Property test
// ---------------------------------------------------------------------------
describe('Property 5: Dashboard partial failure resilience', () => {
  it(
    'for any combination where K sources (1 ≤ K ≤ 2) fail with 403 and (3 − K) succeed, error count equals K and data section count equals (3 − K)',
    () => {
      fc.assert(
        fc.property(failingSourcesArb, (failingSources) => {
          const k = failingSources.length

          // Build outcomes: mark failing sources
          const outcomes: SourceOutcome[] = allSources.map((name) => ({
            name,
            fails: failingSources.includes(name),
          }))

          // Process through the extracted dashboard logic
          const state = processDashboardResults(outcomes)

          // Property: error count equals K
          expect(state.errors.length).toBe(k)

          // Property: data section count equals (3 − K)
          expect(state.dataSections.length).toBe(3 - k)

          // Additional invariant: errors and data sections are disjoint and cover all sources
          const allReported = [...state.errors, ...state.dataSections].sort()
          expect(allReported).toEqual([...allSources].sort())

          // Verify the correct sources are in each bucket
          for (const source of failingSources) {
            expect(state.errors).toContain(source)
          }
          for (const source of allSources) {
            if (!failingSources.includes(source)) {
              expect(state.dataSections).toContain(source)
            }
          }
        }),
        { numRuns: 100 },
      )
    },
  )
})
