/**
 * Property-based tests for Gate 5 (Bundle_Guard) pure predicate.
 *
 * Spec: `.kiro/specs/beanola-launch-verification/` — tasks 4.2 and 4.3.
 * Module under test: `apps/admissions/scripts/launchBundlePredicate.ts`.
 *
 * Two properties live here (one test file, shared generators):
 *   - Property 3: the entry-path guard fails iff an excluded chunk is present
 *                 (Requirements 5.1, 5.2, 5.7, 5.8).
 *   - Property 4: the size-threshold checks fail iff a measured size exceeds
 *                 its budget (Requirements 5.3, 5.4, 5.5, 5.6).
 *
 * fast-check, ≥100 runs per property.
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  ENTRY_GZ_BUDGET_BYTES,
  PDF_GZ_BUDGET_BYTES,
  checkEntryBudget,
  checkEntryExclusions,
  checkPdfBudget,
  checkSentryOnPublicEntry,
  SENTRY_MARKERS,
} from '../../scripts/launchBundlePredicate'

const NUM_RUNS = 100

// ---------------------------------------------------------------------------
// Shared generators
// ---------------------------------------------------------------------------

/** Short content-hash suffix mirroring a real bundler output name. */
const hashArb = fc.stringMatching(/^[a-f0-9]{4,8}$/)

/**
 * Chunk base names that are guaranteed to contain NONE of the forbidden
 * entry-path markers or any Sentry marker. Curated (not random) so the "clean"
 * side of the biconditional is provably clean.
 */
const cleanBaseArb = fc.constantFrom(
  'index',
  'main',
  'app',
  'vendor-react',
  'vendor-router',
  'vendor-query',
  'vendor-zod',
  'student-dashboard',
  'wizard',
  'auth',
  'profile',
  'settings',
)

/** A clean entry chunk: a safe base plus a hash suffix, e.g. `index-a1b2.js`. */
const cleanChunkArb = fc
  .tuple(cleanBaseArb, hashArb)
  .map(([base, hash]) => `${base}-${hash}.js`)

/**
 * Marker substrings that each match exactly one forbidden family in
 * `FORBIDDEN_ENTRY_MARKERS`. A chunk built from any of these must be rejected.
 */
const forbiddenMarkerArb = fc.constantFrom(
  'vendor-react-pdf',
  '@react-pdf',
  'react-pdf-core',
  'yoga.wasm',
  'vendor-pdf',
  'jspdf',
  'pdf-lib',
  'html2canvas',
  'tesseract',
  'vendor-ocr',
  'recharts',
  'vendor-charts',
  'vendor-recharts',
  'chart-vendor',
  'admin-dashboard',
  'page-admin',
  'admindashboard',
)

/** A forbidden entry chunk carrying a known marker, e.g. `jspdf-9f3c.js`. */
const forbiddenChunkArb = fc
  .tuple(forbiddenMarkerArb, hashArb)
  .map(([marker, hash]) => `${marker}-${hash}.js`)

/** Sentry vendor chunk built from a real Sentry marker. */
const sentryChunkArb = fc
  .tuple(fc.constantFrom(...SENTRY_MARKERS), hashArb)
  .map(([marker, hash]) => `${marker}-${hash}.js`)

// ---------------------------------------------------------------------------
// Property 3 — entry-path exclusion guard (R5.1, R5.2, R5.7, R5.8)
// ---------------------------------------------------------------------------

describe('Bundle_Guard — entry-path exclusion guard (Property 3)', () => {
  // Feature: beanola-launch-verification, Property 3: The bundle entry-path
  // guard fails iff an excluded chunk is present.
  // Validates: Requirements 5.1, 5.2
  it('passes iff no forbidden chunk is present, recording every offender', () => {
    fc.assert(
      fc.property(
        fc.array(cleanChunkArb, { maxLength: 8 }),
        fc.array(forbiddenChunkArb, { maxLength: 4 }),
        (clean, forbidden) => {
          const entryChunks = [...clean, ...forbidden]
          const result = checkEntryExclusions(entryChunks)

          // Biconditional: pass exactly when no excluded chunk is present.
          expect(result.pass).toBe(forbidden.length === 0)

          if (forbidden.length === 0) {
            expect(result.forbiddenPresent).toHaveLength(0)
          } else {
            // Every injected forbidden chunk is recorded as an offender.
            for (const chunk of forbidden) {
              expect(
                result.forbiddenPresent.some((entry) =>
                  entry.startsWith(chunk),
                ),
              ).toBe(true)
            }
          }
        },
      ),
      { numRuns: NUM_RUNS },
    )
  })

  // Feature: beanola-launch-verification, Property 3: The bundle entry-path
  // guard fails iff an excluded chunk is present (Sentry-on-public-route half).
  // Validates: Requirements 5.7, 5.8
  it('fails the public-route Sentry check iff vendor-sentry is on the entry path', () => {
    fc.assert(
      fc.property(
        fc.array(cleanChunkArb, { maxLength: 8 }),
        fc.array(sentryChunkArb, { maxLength: 3 }),
        (clean, sentry) => {
          const publicEntryChunks = [...clean, ...sentry]
          const result = checkSentryOnPublicEntry(publicEntryChunks)

          // Biconditional: pass exactly when no Sentry chunk is present.
          expect(result.pass).toBe(sentry.length === 0)
          expect(result.sentryPresent).toBe(sentry.length > 0)

          if (sentry.length === 0) {
            expect(result.offenders).toHaveLength(0)
          } else {
            for (const chunk of sentry) {
              expect(result.offenders).toContain(chunk)
            }
          }
        },
      ),
      { numRuns: NUM_RUNS },
    )
  })
})

// ---------------------------------------------------------------------------
// Property 4 — size-threshold checks (R5.3, R5.4, R5.5, R5.6)
// ---------------------------------------------------------------------------

/**
 * Build a byte-size generator that spans far below, around, and far above a
 * budget so the boundary (`<=` vs `>`) is exercised densely.
 */
function sizeAroundBudgetArb(budget: number): fc.Arbitrary<number> {
  return fc.oneof(
    fc.integer({ min: 0, max: budget * 3 }),
    fc.integer({ min: budget - 4096, max: budget + 4096 }),
    fc.constantFrom(budget - 1, budget, budget + 1, 0),
  )
}

describe('Bundle_Guard — size-threshold checks (Property 4)', () => {
  // Feature: beanola-launch-verification, Property 4: Size-threshold checks
  // fail iff a measured size exceeds its budget (entry-path 150 KB gz).
  // Validates: Requirements 5.3, 5.4
  it('entry budget passes iff measured gzipped size <= 150 KB', () => {
    fc.assert(
      fc.property(sizeAroundBudgetArb(ENTRY_GZ_BUDGET_BYTES), (bytes) => {
        const result = checkEntryBudget(bytes)

        expect(result.pass).toBe(bytes <= ENTRY_GZ_BUDGET_BYTES)
        // Measured value and budget are recorded for the evidence row.
        expect(result.observedBytes).toBe(bytes)
        expect(result.thresholdBytes).toBe(ENTRY_GZ_BUDGET_BYTES)
      }),
      { numRuns: NUM_RUNS },
    )
  })

  // Feature: beanola-launch-verification, Property 4: Size-threshold checks
  // fail iff a measured size exceeds its budget (first-PDF-action 772 KB gz).
  // Validates: Requirements 5.5, 5.6
  it('pdf budget passes iff first-PDF-action gzipped size <= 772 KB', () => {
    fc.assert(
      fc.property(sizeAroundBudgetArb(PDF_GZ_BUDGET_BYTES), (bytes) => {
        const result = checkPdfBudget(bytes)

        expect(result.pass).toBe(bytes <= PDF_GZ_BUDGET_BYTES)
        expect(result.observedBytes).toBe(bytes)
        expect(result.thresholdBytes).toBe(PDF_GZ_BUDGET_BYTES)
      }),
      { numRuns: NUM_RUNS },
    )
  })

  it('confirms the exact documented budget constants', () => {
    expect(ENTRY_GZ_BUDGET_BYTES).toBe(150 * 1024)
    expect(PDF_GZ_BUDGET_BYTES).toBe(772 * 1024)
  })
})
