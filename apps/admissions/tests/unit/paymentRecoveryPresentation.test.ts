/**
 * The payment page's post-submission vocabulary — one presentation per state.
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task 8.3.
 * Requirements: R12.3 (the payment page owns deferred / failed / expired / pending
 *               recovery), R12.4 (the states are distinguished), R12.6 (recovery
 *               action, no indefinite disabled controls).
 * Findings:     **STU-09** (pending provider state was not separated from student
 *               action), STU-24.
 *
 * The load-bearing assertions here are the safety ones: a wait never offers a
 * second collection request, and `provider_processing` never offers a resend. Both
 * are how a student gets charged twice.
 */
import { describe, expect, it } from 'vitest'

import {
  PAYMENT_DEFERRED_PRESENTATION,
  PAYMENT_RECOVERY_PRESENTATION,
  resolvePaymentRecovery,
} from '@/lib/paymentRecovery'
import { PAYMENT_WAITING_STATES, type PaymentUiState } from '@/lib/paymentStatus'

const ALL_UI_STATES: PaymentUiState[] = [
  'idle',
  'initiating',
  'action_required',
  'provider_processing',
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

describe('PAYMENT_RECOVERY_PRESENTATION — every state is decided', () => {
  it('covers exactly the PaymentUiState union', () => {
    expect(Object.keys(PAYMENT_RECOVERY_PRESENTATION).sort()).toEqual([...ALL_UI_STATES].sort())
  })

  it.each(ALL_UI_STATES)('%s says something and pairs its colour with a label', (state) => {
    const presentation = PAYMENT_RECOVERY_PRESENTATION[state]
    expect(presentation.label.trim().length).toBeGreaterThan(0)
    expect(presentation.detail.trim().length).toBeGreaterThan(0)
    expect(presentation.tone.length).toBeGreaterThan(0)
  })

  it('labels an action exactly when it offers one', () => {
    for (const state of ALL_UI_STATES) {
      const { action, actionLabel } = PAYMENT_RECOVERY_PRESENTATION[state]
      expect(Boolean(action)).toBe(Boolean(actionLabel))
    }
  })

  it('reuses the task 8.2 waiting copy instead of writing a second version', () => {
    expect(PAYMENT_RECOVERY_PRESENTATION.action_required.detail).toBe(
      PAYMENT_WAITING_STATES.action_required.body,
    )
    expect(PAYMENT_RECOVERY_PRESENTATION.provider_processing.detail).toBe(
      PAYMENT_WAITING_STATES.provider_processing.body,
    )
  })
})

describe('a wait is never an invitation to pay again', () => {
  it.each<PaymentUiState>([
    'initiating',
    'action_required',
    'provider_processing',
    'awaiting_provider',
    'still_confirming',
  ])('%s allows no initiate control', (state) => {
    const presentation = PAYMENT_RECOVERY_PRESENTATION[state]
    expect(presentation.allowsInitiate).toBe(false)
    expect(presentation.action).not.toBe('pay')
  })

  it('offers a status re-check on the two server-derived waits', () => {
    expect(PAYMENT_RECOVERY_PRESENTATION.action_required.action).toBe('check_status')
    expect(PAYMENT_RECOVERY_PRESENTATION.provider_processing.action).toBe('check_status')
  })

  it('never reads a spent wait budget as a failure (R14.3)', () => {
    const presentation = PAYMENT_RECOVERY_PRESENTATION.still_confirming
    expect(presentation.tone).not.toBe('destructive')
    expect(presentation.label.toLowerCase()).not.toContain('fail')
    expect(presentation.detail.toLowerCase()).not.toContain('failed')
  })
})

describe('the states the payment page exists for (R12.3)', () => {
  it('deferred is named as a choice, and can still be paid', () => {
    const view = resolvePaymentRecovery({
      latestPaymentStatus: 'deferred',
      applicationPaymentStatus: 'deferred',
    })
    expect(view.deferred).toBe(true)
    expect(view.presentation).toBe(PAYMENT_DEFERRED_PRESENTATION)
    expect(view.presentation.action).toBe('pay')
    expect(view.presentation.detail.toLowerCase()).toContain('later')
    expect(view.needsStudentAction).toBe(true)
  })

  it('a never-attempted fee is unpaid, not deferred', () => {
    const view = resolvePaymentRecovery({
      latestPaymentStatus: null,
      applicationPaymentStatus: 'not_paid',
    })
    expect(view.deferred).toBe(false)
    expect(view.uiState).toBe('idle')
    expect(view.presentation.action).toBe('pay')
  })

  it('failed offers a retry and says nothing was charged', () => {
    const view = resolvePaymentRecovery({ latestPaymentStatus: 'failed' })
    expect(view.uiState).toBe('retry_with_different_number')
    expect(view.presentation.allowsInitiate).toBe(true)
    expect(view.presentation.detail.toLowerCase()).toContain('not been charged')
  })

  it('expired says the fee is still owed and starts a new attempt', () => {
    const view = resolvePaymentRecovery({ latestPaymentStatus: 'expired' })
    expect(view.uiState).toBe('expired')
    expect(view.presentation.allowsInitiate).toBe(true)
    expect(view.presentation.actionLabel).toBe('Start a new payment')
    expect(view.presentation.detail.toLowerCase()).toContain('still owed')
  })

  it('pending + action_required asks the student to approve, with the short budget', () => {
    const view = resolvePaymentRecovery({
      latestPaymentStatus: 'pending',
      phase: 'action_required',
    })
    expect(view.uiState).toBe('action_required')
    expect(view.waitBudgetSeconds).toBe(120)
    expect(view.isWaiting).toBe(true)
    expect(view.needsStudentAction).toBe(false)
  })

  it('pending + provider_processing waits, with the long budget and no retry', () => {
    const view = resolvePaymentRecovery({
      latestPaymentStatus: 'pending',
      phase: 'provider_processing',
    })
    expect(view.uiState).toBe('provider_processing')
    expect(view.waitBudgetSeconds).toBe(600)
    expect(view.presentation.allowsInitiate).toBe(false)
    expect(view.resendAvailable).toBe(false)
  })

  it('paid offers the receipt and nothing to pay', () => {
    const view = resolvePaymentRecovery({
      latestPaymentStatus: 'successful',
      applicationPaymentStatus: 'verified',
    })
    expect(view.isSettled).toBe(true)
    expect(view.presentation.action).toBe('receipt')
    expect(view.needsStudentAction).toBe(false)
  })

  it('treats an admin-recorded payment as settled', () => {
    const view = resolvePaymentRecovery({ latestPaymentStatus: 'force_approved' })
    expect(view.isSettled).toBe(true)
    expect(view.presentation.allowsInitiate).toBe(false)
  })
})

describe('the spent wait budget names the phase it was spent in', () => {
  it('offers a resend only after an action_required budget', () => {
    const view = resolvePaymentRecovery({
      latestPaymentStatus: 'pending',
      phase: 'action_required',
      pollingExceededTimeout: true,
    })
    expect(view.resendAvailable).toBe(true)
    expect(view.timeoutNotice).toBe(PAYMENT_WAITING_STATES.action_required.onTimeout)
  })

  it('never offers a resend after a provider_processing budget', () => {
    const view = resolvePaymentRecovery({
      latestPaymentStatus: 'pending',
      phase: 'provider_processing',
      pollingExceededTimeout: true,
    })
    expect(view.resendAvailable).toBe(false)
    expect(view.timeoutNotice).toBe(PAYMENT_WAITING_STATES.provider_processing.onTimeout)
    expect(view.timeoutNotice?.toLowerCase()).toContain('twice')
  })

  it('says nothing about a timeout while the budget still has time on it', () => {
    const view = resolvePaymentRecovery({
      latestPaymentStatus: 'pending',
      phase: 'action_required',
      pollingExceededTimeout: false,
    })
    expect(view.timeoutNotice).toBeNull()
    expect(view.resendAvailable).toBe(false)
  })

  it('does not claim a timeout for a settled payment', () => {
    const view = resolvePaymentRecovery({
      latestPaymentStatus: 'successful',
      pollingExceededTimeout: true,
    })
    expect(view.timeoutNotice).toBeNull()
    expect(view.resendAvailable).toBe(false)
  })
})
