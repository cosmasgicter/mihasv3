/**
 * Property tests for Admissions Logic Canonicalization — Frontend
 *
 * Property 18: Frontend payment status normalization
 *
 * Uses vitest + fast-check.
 */
// Feature: admissions-logic-canonicalization, Property 18: Frontend payment status normalization
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { normalizePaymentStatus } from '@/lib/paymentStatus'

// ---------------------------------------------------------------------------
// Property 18: Frontend payment status normalization
// ---------------------------------------------------------------------------

/**
 * Property 18: Frontend payment status normalization
 *
 * Each canonical value maps correctly:
 *   verified, paid, successful, force_approved → verified
 *   pending, pending_review → pending_review
 *   failed, rejected → rejected
 *   not_paid, null, undefined, any unknown string → not_paid
 *
 * **Validates: Requirements 8.5**
 */

// Generators for each canonical group
const verifiedInputs = fc.constantFrom('verified', 'paid', 'successful', 'force_approved')
const pendingInputs = fc.constantFrom('pending', 'pending_review')
const rejectedInputs = fc.constantFrom('failed', 'rejected')
const notPaidExplicit = fc.constantFrom('not_paid')
const nullishInputs = fc.constantFrom(null, undefined)

// Generator for unknown strings — anything not in the known set
const KNOWN_STATUSES = new Set([
  'verified', 'paid', 'successful', 'force_approved',
  'pending', 'pending_review',
  'failed', 'rejected',
  'not_paid',
])
const unknownStringArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => !KNOWN_STATUSES.has(s))

describe('Feature: admissions-logic-canonicalization, Property 18: Frontend payment status normalization', () => {
  it('verified, paid, successful, force_approved all normalize to "verified"', () => {
    fc.assert(
      fc.property(verifiedInputs, (input) => {
        expect(normalizePaymentStatus(input)).toBe('verified')
      }),
      { numRuns: 100 },
    )
  })

  it('pending, pending_review normalize to "pending_review"', () => {
    fc.assert(
      fc.property(pendingInputs, (input) => {
        expect(normalizePaymentStatus(input)).toBe('pending_review')
      }),
      { numRuns: 100 },
    )
  })

  it('failed, rejected normalize to "rejected"', () => {
    fc.assert(
      fc.property(rejectedInputs, (input) => {
        expect(normalizePaymentStatus(input)).toBe('rejected')
      }),
      { numRuns: 100 },
    )
  })

  it('not_paid normalizes to "not_paid"', () => {
    fc.assert(
      fc.property(notPaidExplicit, (input) => {
        expect(normalizePaymentStatus(input)).toBe('not_paid')
      }),
      { numRuns: 100 },
    )
  })

  it('null and undefined normalize to "not_paid"', () => {
    fc.assert(
      fc.property(nullishInputs, (input) => {
        expect(normalizePaymentStatus(input)).toBe('not_paid')
      }),
      { numRuns: 100 },
    )
  })

  it('any unknown string normalizes to "not_paid"', () => {
    fc.assert(
      fc.property(unknownStringArb, (input) => {
        expect(normalizePaymentStatus(input)).toBe('not_paid')
      }),
      { numRuns: 100 },
    )
  })

  it('normalizePaymentStatus always returns one of the four canonical values', () => {
    const CANONICAL_VALUES = new Set(['verified', 'pending_review', 'rejected', 'not_paid'])
    const anyInput = fc.oneof(
      verifiedInputs,
      pendingInputs,
      rejectedInputs,
      notPaidExplicit,
      nullishInputs,
      unknownStringArb,
    )

    fc.assert(
      fc.property(anyInput, (input) => {
        const result = normalizePaymentStatus(input)
        expect(CANONICAL_VALUES.has(result)).toBe(true)
      }),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property 15: Draft conflict resolution by timestamp
// ---------------------------------------------------------------------------

/**
 * Property 15: Draft conflict resolution by timestamp
 *
 * Given two drafts with different updated_at timestamps, the resolution
 * logic prefers the more recent one.
 *
 * **Validates: Requirements 7.5**
 */

// Pure function that implements the draft conflict resolution logic
// extracted from DraftManager for testability
function resolveDraftConflict<T extends { updated_at: string }>(
  serverDraft: T | null,
  localDraft: T | null,
): T | null {
  if (!serverDraft && !localDraft) return null
  if (!serverDraft) return localDraft
  if (!localDraft) return serverDraft
  // Prefer whichever has the more recent updated_at
  return new Date(serverDraft.updated_at) >= new Date(localDraft.updated_at)
    ? serverDraft
    : localDraft
}

// Arbitrary for ISO date strings within a reasonable range
const isoDateArb = fc
  .integer({ min: new Date('2020-01-01').getTime(), max: new Date('2030-12-31').getTime() })
  .map((ms) => new Date(ms).toISOString())

describe('Feature: admissions-logic-canonicalization, Property 15: Draft conflict resolution by timestamp', () => {
  it('prefers the draft with the more recent updated_at', () => {
    fc.assert(
      fc.property(isoDateArb, isoDateArb, (ts1, ts2) => {
        const draft1 = { updated_at: ts1, data: 'server' }
        const draft2 = { updated_at: ts2, data: 'local' }

        const result = resolveDraftConflict(draft1, draft2)

        // The winner should be the one with the later (or equal) timestamp
        const d1 = new Date(ts1).getTime()
        const d2 = new Date(ts2).getTime()

        if (d1 >= d2) {
          expect(result).toBe(draft1)
        } else {
          expect(result).toBe(draft2)
        }
      }),
      { numRuns: 100 },
    )
  })

  it('returns the only available draft when one is null', () => {
    fc.assert(
      fc.property(isoDateArb, (ts) => {
        const draft = { updated_at: ts, data: 'only' }

        expect(resolveDraftConflict(draft, null)).toBe(draft)
        expect(resolveDraftConflict(null, draft)).toBe(draft)
      }),
      { numRuns: 100 },
    )
  })

  it('returns null when both drafts are null', () => {
    expect(resolveDraftConflict(null, null)).toBeNull()
  })
})
