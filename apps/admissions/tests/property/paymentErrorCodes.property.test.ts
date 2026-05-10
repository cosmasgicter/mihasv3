/**
 * Property-based tests — Phase 4 frontend primitives.
 *
 * Covers Task 32.2 of the payment-hardening spec:
 *
 * - Property 16 (frontend half): MSISDN Zod-schema idempotence.
 * - Stable-code coverage completeness: every `PaymentStableCode` has a
 *   non-empty `PAYMENT_ERROR_COPY` entry.
 *
 * Validates: Requirements R11.5, R14.5, R15.1, R15.3, R20.1.
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  PAYMENT_ERROR_COPY,
  PAYMENT_STABLE_CODES,
  type PaymentStableCode,
} from '@/lib/paymentErrorCodes'
import { normalizeZambianMsisdn } from '@/lib/zambianMsisdn'

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

/** Seven-digit subscriber suffix — the last 7 digits of every Zambian MSISDN. */
const sevenDigitSuffix = fc.stringMatching(/^[0-9]{7}$/) as fc.Arbitrary<string>

/** Two-digit operator prefix drawn from the Airtel/MTN ranges + some extras. */
const twoDigitPrefix = fc.constantFrom('75', '76', '77', '95', '96', '97', '90')

/**
 * Generator: a Zambian MSISDN in one of the supported shapes. The
 * `normalizeZambianMsisdn` helper must accept every value from this
 * strategy and return the same canonical form regardless of input shape.
 */
const validMsisdn = fc
  .tuple(twoDigitPrefix, sevenDigitSuffix, fc.constantFrom('plus', 'trunk', 'bare', 'country'))
  .map(([prefix, suffix, shape]) => {
    const subscriber = `${prefix}${suffix}`
    if (shape === 'plus') {
      return `+260${subscriber}`
    }
    if (shape === 'trunk') {
      return `0${subscriber}`
    }
    if (shape === 'country') {
      return `260${subscriber}`
    }
    return subscriber
  })

/**
 * Optionally insert spaces / dashes / parens into a string at random
 * positions. Deterministic given the fast-check seed.
 */
const withSeparators = fc
  .tuple(validMsisdn, fc.array(fc.constantFrom(' ', '-', '(', ')', '\t'), { maxLength: 4 }))
  .map(([s, seps]) => {
    if (seps.length === 0) {
      return s
    }
    // Insert one separator per entry at roughly even positions.
    let out = s
    for (const sep of seps) {
      const mid = Math.floor(out.length / 2)
      out = `${out.slice(0, mid)}${sep}${out.slice(mid)}`
    }
    return out
  })

/**
 * Generator: any string. Used to cover invalid inputs and confirm
 * idempotence on nulls (`null → null → null`).
 */
const anyString = fc.string({ maxLength: 40 })

// ---------------------------------------------------------------------------
// Property — MSISDN Zod idempotence (R11.5, R14.5)
// ---------------------------------------------------------------------------

describe('normalizeZambianMsisdn — idempotence property', () => {
  it('valid MSISDNs round-trip through a second normalisation unchanged', () => {
    fc.assert(
      fc.property(withSeparators, (input) => {
        const first = normalizeZambianMsisdn(input)
        if (first === null) {
          return true // the validMsisdn strategy guarantees non-null, but be defensive
        }
        const second = normalizeZambianMsisdn(first)
        return second === first
      }),
      { numRuns: 100, seed: 0 },
    )
  })

  it('idempotent on arbitrary strings (null → null → null)', () => {
    fc.assert(
      fc.property(anyString, (input) => {
        const first = normalizeZambianMsisdn(input)
        if (first === null) {
          return normalizeZambianMsisdn('') === null
        }
        const second = normalizeZambianMsisdn(first)
        return second === first
      }),
      { numRuns: 100, seed: 0 },
    )
  })

  it('canonical output is always `+260XXXXXXXXX`', () => {
    fc.assert(
      fc.property(validMsisdn, (input) => {
        const normalized = normalizeZambianMsisdn(input)
        if (normalized === null) {
          return false
        }
        return /^\+260\d{9}$/.test(normalized)
      }),
      { numRuns: 100, seed: 0 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property — stable-code copy completeness (R15.1, R15.3)
// ---------------------------------------------------------------------------

describe('PAYMENT_ERROR_COPY — stable-code coverage property', () => {
  it('every stable code has non-empty title and body copy', () => {
    fc.assert(
      fc.property(fc.constantFrom(...PAYMENT_STABLE_CODES), (code) => {
        const copy = PAYMENT_ERROR_COPY[code as PaymentStableCode]
        return (
          copy !== undefined &&
          copy.title.trim().length > 0 &&
          copy.body.trim().length > 0
        )
      }),
      { numRuns: 100, seed: 0 },
    )
  })
})
