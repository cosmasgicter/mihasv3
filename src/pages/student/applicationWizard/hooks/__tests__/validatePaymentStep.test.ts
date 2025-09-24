import { describe, expect, it, vi } from 'vitest'

import type { WizardFormData } from '../../types'
import { validatePaymentStep } from '../useWizardController'

const baseFormData = {
  full_name: 'Test User',
  nrc_number: '123456/78/9',
  passport_number: null,
  date_of_birth: '2000-01-01',
  sex: 'Male',
  phone: '0970000000',
  email: 'test@example.com',
  residence_town: 'Lusaka',
  next_of_kin_name: null,
  next_of_kin_phone: null,
  program: 'Clinical Medicine',
  intake: 'January 2026 Intake',
  payment_method: 'MTN Money',
  payer_name: null,
  payer_phone: null,
  amount: 153,
  paid_at: null,
  momo_ref: null
} as unknown as WizardFormData

describe('validatePaymentStep', () => {
  it('fails when payment method is missing', () => {
    const setError = vi.fn()
    const showError = vi.fn()
    const formData = { ...baseFormData, payment_method: '' as WizardFormData['payment_method'] }

    const result = validatePaymentStep({
      formData,
      proofOfPaymentFile: new File(['dummy'], 'proof.pdf', { type: 'application/pdf' }),
      setError,
      showError
    })

    expect(result).toBe(false)
    expect(setError).toHaveBeenCalledWith('')
    expect(showError).toHaveBeenCalledWith('Payment method is required')
  })

  it('fails when proof of payment file is missing', () => {
    const setError = vi.fn()
    const showError = vi.fn()

    const result = validatePaymentStep({
      formData: baseFormData,
      proofOfPaymentFile: null,
      setError,
      showError
    })

    expect(result).toBe(false)
    expect(setError).toHaveBeenCalledWith('')
    expect(showError).toHaveBeenCalledWith('Proof of payment must be uploaded before review')
  })

  it('fails when amount is less than the minimum fee', () => {
    const setError = vi.fn()
    const showError = vi.fn()
    const formData = { ...baseFormData, amount: 120 }

    const result = validatePaymentStep({
      formData,
      proofOfPaymentFile: new File(['dummy'], 'proof.pdf', { type: 'application/pdf' }),
      setError,
      showError
    })

    expect(result).toBe(false)
    expect(setError).toHaveBeenCalledWith('')
    expect(showError).toHaveBeenCalledWith('Amount paid must be at least K153')
  })

  it('passes when payment details are valid', () => {
    const setError = vi.fn()
    const showError = vi.fn()

    const result = validatePaymentStep({
      formData: baseFormData,
      proofOfPaymentFile: new File(['dummy'], 'proof.pdf', { type: 'application/pdf' }),
      setError,
      showError
    })

    expect(result).toBe(true)
    expect(setError).not.toHaveBeenCalled()
    expect(showError).not.toHaveBeenCalled()
  })
})
