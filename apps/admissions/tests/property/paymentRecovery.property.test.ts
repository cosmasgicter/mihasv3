/**
 * Payment-recovery invariants over every combination of server signals.
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task 8.3.
 * Requirements: R12.3, R12.4, R12.6, R14.1, R14.3.
 * Findings:     STU-09, STU-24.
 *
 * These are **task invariants**, not numbered spec properties (task 8.3 has no
 * property-based-testing sub-task, so nothing here is registered in the spec's
 * property register). They exist because the mapper's inputs form a product space
 * — six ledger statuses × eight phases × two timeout flags × the stable-code
 * catalogue — and the dangerous cases are the rare corners, not the examples a
 * table test happens to pick.
 *
 * The invariants:
 *   1. Every combination resolves to a decided presentation. No screen is undefined.
 *   2. A payment the provider is still working on never offers a way to pay again.
 *   3. A spent wait budget is never rendered as a failure.
 *   4. `resendAvailable` implies the student was the bottleneck.
 *   5. The mapper is pure — same input, same output.
 */
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { resolvePaymentRecovery } from '@/lib/paymentRecovery'
import {
  PAYMENT_STABLE_CODES,
  type PaymentStableCode,
} from '@/lib/paymentErrorCodes'
import type { CanonicalPaymentServiceStatus, PaymentPhase } from '@/lib/paymentStatus'

const ledgerStatus = fc.constantFrom<CanonicalPaymentServiceStatus | null>(
  'pending',
  'deferred',
  'successful',
  'failed',
  'expired',
  'force_approved',
  null,
)

const phase = fc.constantFrom<PaymentPhase | null>(
  'not_started',
  'action_required',
  'provider_processing',
  'paid',
  'failed_retryable',
  'expired',
  'deferred',
  null,
)

const applicationProjection = fc.constantFrom<string | null>(
  'not_paid',
  'pending_review',
  'verified',
  'paid',
  'successful',
  'force_approved',
  'deferred',
  'failed',
  'rejected',
  'expired',
  null,
)

const stableCode = fc.constantFrom<PaymentStableCode | null>(
  ...(PAYMENT_STABLE_CODES as readonly PaymentStableCode[]),
  null,
)

const recoveryInput = fc.record({
  latestPaymentStatus: ledgerStatus,
  phase,
  applicationPaymentStatus: applicationProjection,
  inflight: fc.boolean(),
  stableCode,
  pollingExceededTimeout: fc.boolean(),
})

describe('payment recovery invariants (task 8.3)', () => {
  it('always resolves a decided presentation', () => {
    fc.assert(
      fc.property(recoveryInput, (input) => {
        const view = resolvePaymentRecovery(input)
        expect(view.presentation).toBeDefined()
        expect(view.presentation.label.trim().length).toBeGreaterThan(0)
        expect(view.presentation.detail.trim().length).toBeGreaterThan(0)
        // An action always comes with a label, and a label never without an action.
        expect(Boolean(view.presentation.action)).toBe(Boolean(view.presentation.actionLabel))
        // Colour is never the only signal.
        expect(view.presentation.tone.length).toBeGreaterThan(0)
      }),
      { numRuns: 500 },
    )
  })

  it('never offers a second collection request while one is with the provider', () => {
    fc.assert(
      fc.property(recoveryInput, (input) => {
        const view = resolvePaymentRecovery(input)
        if (view.isWaiting) {
          expect(view.presentation.allowsInitiate).toBe(false)
          expect(view.presentation.action).not.toBe('pay')
          expect(view.needsStudentAction).toBe(false)
        }
        // A settled fee is never payable again either.
        if (view.isSettled) {
          expect(view.presentation.allowsInitiate).toBe(false)
        }
      }),
      { numRuns: 500 },
    )
  })

  it('never renders a spent wait budget as a failure (R14.3)', () => {
    fc.assert(
      fc.property(recoveryInput, (input) => {
        const view = resolvePaymentRecovery({ ...input, pollingExceededTimeout: true })
        if (input.latestPaymentStatus === 'pending' && input.stableCode === null && !input.inflight) {
          expect(view.uiState).toBe('still_confirming')
          expect(view.presentation.tone).not.toBe('destructive')
        }
      }),
      { numRuns: 300 },
    )
  })

  it('offers a resend only when the student was the one being waited on', () => {
    fc.assert(
      fc.property(recoveryInput, (input) => {
        const view = resolvePaymentRecovery(input)
        if (view.resendAvailable) {
          expect(view.phase).toBe('action_required')
          expect(input.latestPaymentStatus).toBe('pending')
          expect(input.pollingExceededTimeout).toBe(true)
        }
        // The inverse is the double-charge guard.
        if (view.phase === 'provider_processing') {
          expect(view.resendAvailable).toBe(false)
        }
      }),
      { numRuns: 500 },
    )
  })

  it('is pure — the same server signals always resolve the same view', () => {
    fc.assert(
      fc.property(recoveryInput, (input) => {
        expect(resolvePaymentRecovery(input)).toEqual(resolvePaymentRecovery(input))
      }),
      { numRuns: 200 },
    )
  })

  it('claims a wait budget only for the two server-derived waits', () => {
    fc.assert(
      fc.property(recoveryInput, (input) => {
        const view = resolvePaymentRecovery(input)
        if (view.waitBudgetSeconds !== null) {
          expect(['action_required', 'provider_processing']).toContain(view.uiState)
          // The student is chased sooner than the provider is.
          expect(view.waitBudgetSeconds).toBe(view.uiState === 'action_required' ? 120 : 600)
        }
      }),
      { numRuns: 300 },
    )
  })
})
