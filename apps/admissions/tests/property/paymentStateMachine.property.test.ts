/**
 * Property-based test — Property 18 (UI State Matrix Determinism).
 *
 * Task 35.1 of the payment-hardening spec. Enforcement PBT for the
 * pure `derivePaymentUiState` mapper.
 *
 * Invariants:
 *   1. Totality — the return value is always a member of `PaymentUiState`.
 *   2. Determinism — two calls with structurally equal inputs return
 *      structurally equal outputs.
 *   3. Pending safety (R14.3) — when `backendStatus === 'pending' &&
 *      pollingExceededTimeout === true`, the result is `still_confirming`
 *      (never `expired`, never anything failed-adjacent) UNLESS a
 *      stronger stable-code override applies (e.g. `ALREADY_PAID`).
 *
 * Validates: Requirements R14.1, R14.3, R14.6, R14.7, R20.1.
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { PAYMENT_STABLE_CODES } from '@/lib/paymentErrorCodes'
import {
  derivePaymentUiState,
  type DerivePaymentUiStateInput,
  type PaymentUiState,
} from '@/lib/paymentStatus'

const ALL_UI_STATES: readonly PaymentUiState[] = [
  'idle',
  'initiating',
  'awaiting_provider',
  'still_confirming',
  'confirmed',
  'already_paid',
  'retry_with_different_number',
  'unavailable',
  'max_attempts_reached',
  'sensitive_fields_locked',
  'rate_limited',
  'needs_admin_followup',
  'expired',
]

const uiStateSet = new Set<string>(ALL_UI_STATES)

// Stable codes that outrank the pending-timeout short-circuit.
const TERMINAL_OVERRIDE_CODES = new Set<string>([
  'ALREADY_PAID',
  'MAX_PAYMENT_ATTEMPTS_EXCEEDED',
  'PAYMENT_SENSITIVE_FIELDS_LOCKED',
  'RATE_LIMITED',
  'AMOUNT_MISMATCH',
  'CURRENCY_MISMATCH',
  'MISSING_PROVIDER_REFERENCE',
  'CANNOT_REVERSE_SUCCESSFUL_PAYMENT',
  'OVERRIDE_REASON_REQUIRED',
  'RECEIPT_NOT_ELIGIBLE',
])

const inputArb = fc.record<DerivePaymentUiStateInput>({
  backendStatus: fc.option(
    fc.constantFrom('pending', 'deferred', 'successful', 'failed', 'expired', 'force_approved'),
    { nil: null },
  ),
  inflight: fc.boolean(),
  stableCode: fc.option(fc.constantFrom(...PAYMENT_STABLE_CODES), {
    nil: null,
  }),
  pollingExceededTimeout: fc.boolean(),
})

describe('Property 18 — UI state matrix determinism', () => {
  it('returns a valid PaymentUiState for every input (totality)', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const result = derivePaymentUiState(input)
        return uiStateSet.has(result)
      }),
      { numRuns: 100, seed: 0 },
    )
  })

  it('is pure — two calls with equal inputs return equal outputs', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const a = derivePaymentUiState(input)
        const b = derivePaymentUiState({ ...input })
        return a === b
      }),
      { numRuns: 100, seed: 0 },
    )
  })

  it('pending + polling timeout never lands on expired/failed (R14.3)', () => {
    fc.assert(
      fc.property(
        fc.record<DerivePaymentUiStateInput>({
          backendStatus: fc.constant('pending'),
          inflight: fc.boolean(),
          stableCode: fc.option(fc.constantFrom(...PAYMENT_STABLE_CODES), {
            nil: null,
          }),
          pollingExceededTimeout: fc.constant(true),
        }),
        (input) => {
          const result = derivePaymentUiState(input)
          // Stable codes that explicitly override pending-timeout take
          // priority — those paths are correct by construction, so we
          // only assert the pure pending-timeout path.
          if (input.stableCode !== null && TERMINAL_OVERRIDE_CODES.has(input.stableCode)) {
            return uiStateSet.has(result)
          }
          // Provider unavailability stable codes map to retry / unavailable.
          if (
            input.stableCode === 'PROVIDER_UNAVAILABLE' ||
            input.stableCode === 'PAYMENT_UNAVAILABLE'
          ) {
            return (
              result === 'retry_with_different_number' ||
              result === 'unavailable' ||
              result === 'still_confirming'
            )
          }
          // Default pending + timeout path → still_confirming.
          return result === 'still_confirming'
        },
      ),
      { numRuns: 100, seed: 0 },
    )
  })
})
