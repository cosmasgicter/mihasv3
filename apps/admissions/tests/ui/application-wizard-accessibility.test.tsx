import { describe, expect, it, beforeEach, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { useForm } from 'react-hook-form'

import PaymentStep from '@/pages/student/applicationWizard/steps/PaymentStep'
import type { WizardFormData } from '@/pages/student/applicationWizard/types'

const useFeeResolverMock = vi.fn()
const useLencoWidgetMock = vi.fn()

vi.mock('@/hooks/useFeeResolver', () => ({
  useFeeResolver: (...args: unknown[]) => useFeeResolverMock(...args),
}))

vi.mock('@/hooks/useLencoWidget', () => ({
  useLencoWidget: (...args: unknown[]) => useLencoWidgetMock(...args),
}))

function renderPaymentMarkup() {
  const Harness = () => {
    const form = useForm<WizardFormData>({
      defaultValues: {
        full_name: 'Jane Student',
        nrc_number: '123456/78/9',
        passport_number: '',
        date_of_birth: '2001-09-08',
        sex: 'Female',
        phone: '+260971234567',
        email: 'jane@example.com',
        residence_town: 'Kitwe',
        country: 'Zambia',
        nationality: 'Zambian',
        next_of_kin_name: 'John Student',
        next_of_kin_phone: '+260977000000',
        program: 'program-1',
        intake: 'intake-2026-aug',
      },
    })

    return (
      <PaymentStep
        title="Payment"
        form={form}
        applicationId="app-1"
        applicationNumber="MIHAS-2026-0001"
      />
    )
  }

  return renderToStaticMarkup(<Harness />)
}

describe('PaymentStep accessibility', () => {
  beforeEach(() => {
    useFeeResolverMock.mockReturnValue({
      fee: { amount: 153, currency: 'ZMW', residency_category: 'resident' },
      isLoading: false,
      error: null,
    })
    useLencoWidgetMock.mockReturnValue({
      openWidget: vi.fn(),
      isLoading: false,
      isScriptLoaded: true,
    })
  })

  it('uses fieldset semantics and removes the retired payment-choice radios', () => {
    const markup = renderPaymentMarkup()

    expect(markup).toContain('<fieldset')
    expect(markup).toContain('<legend class="sr-only">Payment</legend>')
    expect(markup).toContain('data-testid="pay-momo-button"')
    expect(markup).toContain('data-testid="pay-later-button"')
    expect(markup).not.toContain('radiogroup')
    expect(markup).not.toContain('type="radio"')
  })
})
