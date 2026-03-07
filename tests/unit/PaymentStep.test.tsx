import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { useForm } from 'react-hook-form'

import PaymentStep from '@/pages/student/applicationWizard/steps/PaymentStep'
import type { WizardFormData } from '@/pages/student/applicationWizard/types'

function renderPaymentStep(paymentOption: 'pay_now' | 'pay_later' = 'pay_now') {
  const Harness = () => {
    const form = useForm<WizardFormData>({
      defaultValues: {
        payment_option: paymentOption,
        payment_method: 'MTN Money',
      },
    })

    return (
      <PaymentStep
        title="Payment"
        form={form}
        getPaymentTarget={async () => 'MIHAS Collections Account'}
        handleProofOfPaymentUpload={() => undefined}
        proofOfPaymentFile={null}
        uploadProgress={{}}
        uploadedFiles={{}}
      />
    )
  }

  return renderToStaticMarkup(<Harness />)
}

describe('PaymentStep', () => {
  it('renders separate payment-details and proof-upload sections for pay-now flows', () => {
    const markup = renderPaymentStep('pay_now')

    expect(markup).toContain('Payment details')
    expect(markup).toContain('Proof of payment upload')
    expect(markup).toContain('Submit for review')
  })

  it('renders a clear dashboard follow-up message for pay-later flows', () => {
    const markup = renderPaymentStep('pay_later')

    expect(markup).toContain('Complete payment later from your dashboard')
    expect(markup).toContain('student dashboard payment section')
  })
})
