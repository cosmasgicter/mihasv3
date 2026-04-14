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
 * Property 12: For any state where the PaymentStep "Pay now" button is
 * disabled (fee loading, widget unavailable, or no fee resolved), the
 * component renders visible helper text (data-testid="pay-disabled-hint")
 * explaining why the button is disabled. Conversely, when the button is
 * enabled the hint is absent.
 *
 * Note: The "payment pending" disabled state is driven by internal
 * component state (useState) which cannot be set via static rendering.
 * The three externally-controllable disabled states are tested here.
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
// Disabled-state arbitrary
// ---------------------------------------------------------------------------

interface DisabledState {
  label: string
  feeLoading: boolean
  isScriptLoaded: boolean
  fee: { amount: number; currency: string; residency_category: string } | null
}

/**
 * Generates one of the three externally-controllable disabled-button scenarios:
 *  1. Fee is loading
 *  2. Widget script not loaded
 *  3. No fee resolved yet (fee === null, not loading)
 */
const disabledStateArb: fc.Arbitrary<DisabledState> = fc.oneof(
  fc.record({
    label: fc.constant('fee-loading'),
    feeLoading: fc.constant(true),
    isScriptLoaded: fc.boolean(),
    fee: fc.constant(null),
  }),
  fc.record({
    label: fc.constant('widget-unavailable'),
    feeLoading: fc.constant(false),
    isScriptLoaded: fc.constant(false),
    fee: fc.oneof(
      fc.constant(null),
      fc.constant({ amount: 153, currency: 'ZMW', residency_category: 'resident' }),
    ),
  }),
  fc.record({
    label: fc.constant('no-fee'),
    feeLoading: fc.constant(false),
    isScriptLoaded: fc.constant(true),
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
  isScriptLoaded: boolean
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
    isScriptLoaded: state.isScriptLoaded,
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

describe('Property 12: Disabled payment button shows explanation', () => {
  // Suppress the harmless useLayoutEffect SSR warning from react-hook-form
  // when using renderToStaticMarkup (server-side rendering context)
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

  it('renders a disabled-hint when the pay button is disabled', () => {
    fc.assert(
      fc.property(disabledStateArb, (state) => {
        const markup = renderWithState(state)

        // The hint element with data-testid="pay-disabled-hint" must be present
        expect(markup).toContain('data-testid="pay-disabled-hint"')

        // The hint must contain non-empty explanatory text
        const hintMatch = markup.match(/data-testid="pay-disabled-hint"[^>]*>([^<]+)</)
        expect(hintMatch).not.toBeNull()
        expect(hintMatch![1].trim().length).toBeGreaterThan(0)
      }),
      { numRuns: 100 },
    )
  })

  it('does NOT render a disabled-hint when the pay button is enabled', () => {
    const markup = renderWithState({
      feeLoading: false,
      isScriptLoaded: true,
      fee: { amount: 153, currency: 'ZMW', residency_category: 'resident' },
    })

    expect(markup).not.toContain('data-testid="pay-disabled-hint"')
  })
})
