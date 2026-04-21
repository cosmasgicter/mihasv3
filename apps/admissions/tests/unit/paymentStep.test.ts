// Feature: audit-remediation, Property 12: Disabled payment button shows explanation
import { describe, expect, it, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { useForm } from 'react-hook-form'
import fc from 'fast-check'

import PaymentStep from '@/pages/student/applicationWizard/steps/PaymentStep'
import type { WizardFormData } from '@/pages/student/applicationWizard/types'

/**
 * Validates: Requirements 17.1
 *
 * Property 12: When the PaymentStep cannot show a payment form (fee loading,
 * no fee resolved), the payment form is absent. When fee is resolved, the
 * mobile money form is rendered as the primary payment method.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const useFeeResolverMock = vi.fn()
const useLencoWidgetMock = vi.fn()

vi.mock('@/hooks/useFeeResolver', () => ({
  useFeeResolver: (...args: unknown[]) => useFeeResolverMock(...args),
}))

vi.mock('@/hooks/useLencoWidget', () => ({
  useLencoWidget: (...args: unknown[]) => useLencoWidgetMock(...args),
}))

// ---------------------------------------------------------------------------
// No-payment-form state arbitrary
// ---------------------------------------------------------------------------

interface NoFormState {
  label: string
  feeLoading: boolean
  fee: { amount: number; currency: string; residency_category: string } | null
}

const noFormStateArb: fc.Arbitrary<NoFormState> = fc.oneof(
  fc.record({
    label: fc.constant('fee-loading'),
    feeLoading: fc.constant(true),
    fee: fc.constant(null),
  }),
  fc.record({
    label: fc.constant('no-fee'),
    feeLoading: fc.constant(false),
    fee: fc.constant(null),
  }),
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_FORM_VALUES: Partial<WizardFormData> = {
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
}

function renderWithState(state: {
  feeLoading: boolean
  fee: { amount: number; currency: string; residency_category: string } | null
}) {
  useFeeResolverMock.mockReturnValue({
    fee: state.fee,
    isLoading: state.feeLoading,
    error: null,
  })
  useLencoWidgetMock.mockReturnValue({
    openWidget: vi.fn(),
    isLoading: false,
    isScriptLoaded: true,
  })

  const Harness = () => {
    const form = useForm<WizardFormData>({ defaultValues: DEFAULT_FORM_VALUES })
    return createElement(PaymentStep, {
      title: 'Payment',
      form,
      applicationId: 'app-1',
      applicationNumber: 'MIHAS-2026-0001',
    })
  }

  return renderToStaticMarkup(createElement(Harness))
}

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe('Property 12: Payment form visibility matches fee state', () => {
  let originalConsoleError: typeof console.error
  beforeAll(() => {
    originalConsoleError = console.error
    console.error = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].includes('useLayoutEffect does nothing on the server')) return
      originalConsoleError(...args)
    }
  })
  afterAll(() => {
    console.error = originalConsoleError
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not render payment form when fee is unavailable', () => {
    fc.assert(
      fc.property(noFormStateArb, (state) => {
        const markup = renderWithState(state)

        // No payment form should be rendered
        expect(markup).not.toContain('data-testid="payment-form"')
        // No pay buttons should be present
        expect(markup).not.toContain('data-testid="pay-momo-button"')
      }),
      { numRuns: 100 },
    )
  })

  it('renders mobile money form when fee is resolved', () => {
    const markup = renderWithState({
      feeLoading: false,
      fee: { amount: 153, currency: 'ZMW', residency_category: 'resident' },
    })

    expect(markup).toContain('data-testid="payment-form"')
    expect(markup).toContain('data-testid="pay-momo-button"')
    expect(markup).toContain('Mobile Money')
    expect(markup).toContain('data-testid="pay-later-button"')
  })
})
