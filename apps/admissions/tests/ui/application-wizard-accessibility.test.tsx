import { describe, expect, it, beforeEach, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { useForm } from 'react-hook-form'

import PaymentStep from '@/pages/student/applicationWizard/steps/PaymentStep'
import type { WizardFormData } from '@/pages/student/applicationWizard/types'

const useFeeQuoteMock = vi.fn()
const useLencoWidgetMock = vi.fn()

// Task 8.1: the payment step reads the expiring server-authored fee quote.
vi.mock('@/hooks/useFeeQuote', () => ({
  useFeeQuote: (...args: unknown[]) => useFeeQuoteMock(...args),
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
    useFeeQuoteMock.mockReturnValue({
      quote: {
        quote_id: 'a2f5ee2e-1b8d-4c2f-96c1-95c8fbb0f7d1',
        application_id: 'app-1',
        configuration_version: 'cfg-1',
        fee_configuration_version: 'fp-1',
        fee_type: 'application',
        base_amount: '153.00',
        provider_fee: '1.53',
        total_amount: '154.53',
        currency: 'ZMW',
        bearer: 'customer',
        residency_category: 'local',
        waiver_applied: false,
        status: 'active',
        expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
        signature: 'a'.repeat(64),
        signature_version: 1,
      },
      isLoading: false,
      error: null,
      isExpired: false,
      refresh: vi.fn(),
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
