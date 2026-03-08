import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { useForm } from 'react-hook-form'

import PaymentStep from '@/pages/student/applicationWizard/steps/PaymentStep'
import type { WizardFormData } from '@/pages/student/applicationWizard/types'

function renderMarkup(element: React.ReactElement) {
  const markup = renderToStaticMarkup(element)
  return new DOMParser().parseFromString(markup, 'text/html')
}

function PaymentStepHarness() {
  const form = useForm<WizardFormData>({
    defaultValues: {
      full_name: '',
      nrc_number: '',
      passport_number: '',
      date_of_birth: '',
      sex: 'Male',
      phone: '',
      email: '',
      residence_town: '',
      country: 'Zambia',
      nationality: 'Zambian',
      next_of_kin_name: '',
      next_of_kin_phone: '',
      program: '',
      intake: '',
      payment_option: 'pay_now',
      payment_method: 'MTN Money',
      payer_name: '',
      payer_phone: '',
      amount: 153,
      paid_at: '',
      momo_ref: '',
    },
  })

  return (
    <PaymentStep
      title="Payment"
      form={form}
      getPaymentTarget={async () => '0970000000'}
      handleProofOfPaymentUpload={() => undefined}
      proofOfPaymentFile={null}
      uploadProgress={{}}
      uploadedFiles={{}}
    />
  )
}

describe('PaymentStep accessibility', () => {
  it('exposes payment options as a radio group with clear option descriptions', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const document = renderMarkup(<PaymentStepHarness />)

    const paymentOptionGroup = document.querySelector('[role="radiogroup"]')
    const legend = document.querySelector('#payment-option-legend')
    expect(paymentOptionGroup).not.toBeNull()
    expect(legend?.textContent).toBe('Choose when you want to complete payment')
    expect(paymentOptionGroup?.getAttribute('aria-labelledby')).toBe('payment-option-legend')

    const paymentOptions = [...document.querySelectorAll('input[type="radio"][name="payment_option"]')]
    expect(paymentOptions).toHaveLength(2)
    expect(paymentOptions.some(option => option.getAttribute('value') === 'pay_now')).toBe(true)
    expect(paymentOptions.some(option => option.getAttribute('value') === 'pay_later')).toBe(true)

    consoleError.mockRestore()
  })
})
