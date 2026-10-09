/**
 * Action-required is not provider-processing — admissions-v2 task 8.2 (STU-09).
 *
 * A pending payment is two different situations. Either the student has a prompt
 * on their handset and must enter a PIN, or the request is with Lenco and the
 * student can do nothing. The platform used to render one state for both, so it
 * either asked for an action that was impossible or hid one that was needed.
 *
 * The distinction is server-derived (`phase` on the payment payload); these tests
 * pin that the UI mapper honours it, that the two states carry different
 * affordances, and that their timeout semantics differ in the right direction.
 *
 * Validates: Requirements R12.4, R12.6
 */

import { describe, expect, it } from 'vitest'

import {
  PAYMENT_WAITING_STATES,
  derivePaymentUiState,
  paymentWaitBudgetMs,
  type PaymentPhase,
  type PaymentUiState,
} from '@/lib/paymentStatus'

const base = {
  backendStatus: 'pending' as const,
  inflight: false,
  stableCode: null,
  pollingExceededTimeout: false,
}

describe('derivePaymentUiState — pending is split by server phase', () => {
  it('renders action_required when the provider issued the customer prompt', () => {
    expect(derivePaymentUiState({ ...base, phase: 'action_required' })).toBe('action_required')
  })

  it('renders provider_processing while the request is with the provider', () => {
    expect(derivePaymentUiState({ ...base, phase: 'provider_processing' })).toBe(
      'provider_processing',
    )
  })

  it.each<[PaymentPhase | null | undefined]>([[undefined], [null], ['not_started']])(
    'falls back to awaiting_provider when the phase is %s',
    (phase) => {
      expect(derivePaymentUiState({ ...base, phase })).toBe('awaiting_provider')
    },
  )

  it('never lets a phase override a confirmed payment', () => {
    expect(
      derivePaymentUiState({
        ...base,
        backendStatus: 'successful',
        phase: 'action_required',
      }),
    ).toBe('confirmed')
  })

  it('keeps the polling-timeout state ahead of the phase split', () => {
    // R14.3: a timed-out poll must never read as failure, and the
    // still_confirming state already carries the right recovery copy.
    expect(
      derivePaymentUiState({
        ...base,
        pollingExceededTimeout: true,
        phase: 'action_required',
      }),
    ).toBe('still_confirming')
  })

  it('keeps a stable-code refusal ahead of the phase split', () => {
    expect(
      derivePaymentUiState({
        ...base,
        stableCode: 'MAX_PAYMENT_ATTEMPTS_EXCEEDED',
        phase: 'action_required',
      }),
    ).toBe('max_attempts_reached')
  })
})

describe('the two waiting states are genuinely different affordances', () => {
  it('only action_required asks the student to do something', () => {
    expect(PAYMENT_WAITING_STATES.action_required.studentActionable).toBe(true)
    expect(PAYMENT_WAITING_STATES.provider_processing.studentActionable).toBe(false)
  })

  it('provider_processing tells the student there is nothing to do', () => {
    expect(PAYMENT_WAITING_STATES.provider_processing.body.toLowerCase()).toContain(
      'nothing to do',
    )
  })

  it('action_required tells the student to approve on their phone', () => {
    expect(PAYMENT_WAITING_STATES.action_required.body.toLowerCase()).toContain('pin')
  })

  it('chases the student sooner than it chases the provider', () => {
    expect(PAYMENT_WAITING_STATES.action_required.timeoutSeconds).toBeLessThan(
      PAYMENT_WAITING_STATES.provider_processing.timeoutSeconds,
    )
  })

  it('offers a resend on action_required timeout and reassurance on the other', () => {
    expect(PAYMENT_WAITING_STATES.action_required.onTimeout.toLowerCase()).toContain('again')
    expect(
      PAYMENT_WAITING_STATES.provider_processing.onTimeout.toLowerCase(),
    ).toContain('twice')
  })

  it('mirrors the backend phase_timeout_seconds values', () => {
    // backend: apps/documents/payment_phase.py::PHASE_UI_TIMEOUT_SECONDS
    expect(PAYMENT_WAITING_STATES.action_required.timeoutSeconds).toBe(120)
    expect(PAYMENT_WAITING_STATES.provider_processing.timeoutSeconds).toBe(600)
  })
})

describe('paymentWaitBudgetMs', () => {
  it('returns a budget for the waiting states only', () => {
    expect(paymentWaitBudgetMs('action_required')).toBe(120_000)
    expect(paymentWaitBudgetMs('provider_processing')).toBe(600_000)
  })

  it.each<PaymentUiState>(['idle', 'confirmed', 'expired', 'already_paid', 'unavailable'])(
    'returns null for %s',
    (state) => {
      expect(paymentWaitBudgetMs(state)).toBeNull()
    },
  )
})
