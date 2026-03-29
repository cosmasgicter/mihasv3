import { describe, expect, it, vi } from 'vitest'

import {
  buildApplicationPaymentUpdate,
  requiresImmediatePayment,
  validatePaymentStep,
} from '@/pages/student/applicationWizard/lib/paymentFlow'

describe('paymentFlow', () => {
  it('treats pay later as a deferred payment path', () => {
    expect(requiresImmediatePayment({ payment_option: 'pay_later' })).toBe(false)
    expect(requiresImmediatePayment({ payment_option: 'pay_now' })).toBe(true)
    expect(requiresImmediatePayment({})).toBe(true)
  })

  it('allows the payment step to proceed without proof when pay later is selected', () => {
    const setError = vi.fn()
    const showError = vi.fn()

    const result = validatePaymentStep({
      formData: {
        payment_option: 'pay_later',
      } as any,
      proofOfPaymentFile: null,
      setError,
      showError,
    })

    expect(result).toBe(true)
    expect(setError).not.toHaveBeenCalled()
    expect(showError).not.toHaveBeenCalled()
  })

  it('still requires proof of payment when pay now is selected', () => {
    const setError = vi.fn()
    const showError = vi.fn()

    const result = validatePaymentStep({
      formData: {
        payment_option: 'pay_now',
        payment_method: 'MTN Money',
        amount: 153,
      } as any,
      proofOfPaymentFile: null,
      setError,
      showError,
    })

    expect(result).toBe(false)
    expect(showError).toHaveBeenCalledWith('Proof of payment must be uploaded before review')
  })

  it('builds a cleared payment payload for pay later submissions', () => {
    expect(
      buildApplicationPaymentUpdate(
        {
          payment_option: 'pay_later',
          payment_method: 'MTN Money',
          payer_name: 'Student',
          payer_phone: '260971000000',
          amount: 153,
          paid_at: '2026-03-07T08:00',
          momo_ref: 'ABC123',
        } as any,
        { clearProofOfPayment: true },
      ),
    ).toEqual({
      payment_method: null,
      payer_name: null,
      payer_phone: null,
      amount: null,
      paid_at: null,
      momo_ref: null,
      payment_status: null,
      pop_url: null,
    })
  })

  it('builds a review payload for pay now submissions', () => {
    expect(
      buildApplicationPaymentUpdate({
        payment_option: 'pay_now',
        payment_method: 'Airtel Money',
        payer_name: 'Student',
        payer_phone: '260971000000',
        amount: 200,
        paid_at: '2026-03-07T08:00',
        momo_ref: 'REF-123',
      } as any, { markPendingReview: true }),
    ).toEqual({
      payment_method: 'Airtel Money',
      payer_name: 'Student',
      payer_phone: '260971000000',
      amount: 200,
      paid_at: '2026-03-07T06:00:00.000Z',
      momo_ref: 'REF-123',
      payment_status: 'pending_review',
    })
  })
})
