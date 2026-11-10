// Feature: audit-remediation, Property 12: Disabled payment button shows explanation
import { describe, expect, it, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { useForm } from 'react-hook-form'
import fc from 'fast-check'

import PaymentStep from '@/pages/student/applicationWizard/steps/PaymentStep'
import type { FeeQuote } from '@/hooks/useFeeQuote'
import type { WizardFormData } from '@/pages/student/applicationWizard/types'

/**
 * Validates: Requirements 17.1
 *
 * Property 12: When the PaymentStep cannot show a payment form (quote loading,
 * no server quote), the payment form is absent. When a live server-authored quote
 * exists, the mobile money form is rendered as the primary payment method.
 *
 * Updated by admissions-v2 task 8.1: the step's money comes from the expiring
 * server-authored fee quote (`useFeeQuote`), not from the retired client-side
 * `useFeeResolver` hook.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const useFeeQuoteMock = vi.fn()
const useLencoWidgetMock = vi.fn()

vi.mock('@/hooks/useFeeQuote', () => ({
  useFeeQuote: (...args: unknown[]) => useFeeQuoteMock(...args),
}))

vi.mock('@/hooks/useLencoWidget', () => ({
  useLencoWidget: (...args: unknown[]) => useLencoWidgetMock(...args),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SERVER_QUOTE: FeeQuote = {
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
}

// ---------------------------------------------------------------------------
// No-payment-form state arbitrary
// ---------------------------------------------------------------------------

interface NoFormState {
  label: string
  quoteLoading: boolean
  quote: FeeQuote | null
}

const noFormStateArb: fc.Arbitrary<NoFormState> = fc.oneof(
  fc.record({
    label: fc.constant('quote-loading'),
    quoteLoading: fc.constant(true),
    quote: fc.constant(null),
  }),
  fc.record({
    label: fc.constant('no-quote'),
    quoteLoading: fc.constant(false),
    quote: fc.constant(null),
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

function renderWithState(state: { quoteLoading: boolean; quote: FeeQuote | null }) {
  useFeeQuoteMock.mockReturnValue({
    quote: state.quote,
    isLoading: state.quoteLoading,
    error: null,
    isExpired: false,
    refresh: vi.fn(),
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

describe('Property 12: Payment form visibility matches server quote state', () => {
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

  it('does not render payment form when no server quote is available', () => {
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

  it('renders mobile money form when a live server quote exists', () => {
    const markup = renderWithState({ quoteLoading: false, quote: SERVER_QUOTE })
    expect(markup).toContain('data-testid="payment-form"')
    expect(markup).toContain('data-testid="pay-momo-button"')
    expect(markup).toContain('Mobile money')
    expect(markup).toContain('data-testid="pay-later-button"')
  })

  it('renders the server total verbatim and never a client-computed one', () => {
    const markup = renderWithState({ quoteLoading: false, quote: SERVER_QUOTE })
    // Exactly the server strings: base, provider fee, total.
    expect(markup).toContain('K153.00')
    expect(markup).toContain('K1.53')
    expect(markup).toContain('K154.53')
    // The retired client-side label is gone for good (finding STU-08).
    expect(markup).not.toContain('Transaction fee (1%)')
  })
})
