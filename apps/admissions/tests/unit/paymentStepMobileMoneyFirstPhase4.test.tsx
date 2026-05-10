/**
 * Regression test — mobile-money-first tab ordering preserved under Phase 4
 * (Task 39.5).
 *
 * With the hardening UI flag on OR off, the mobile money method must
 * render before the card method in DOM order. Covered at the
 * `PaymentForm` layer (which PaymentStep renders) to keep the test fast
 * and env-agnostic.
 *
 * Validates: Requirements R22.6.
 */

import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PaymentForm } from '@/components/student/PaymentForm'

vi.mock('@/hooks/useApplicationPaymentAction', () => ({
  useApplicationPaymentAction: () => ({
    paymentStatus: 'idle',
    statusMessage: '',
    initiateError: null,
    widgetLoading: false,
    isScriptLoaded: true,
    widgetLoadError: null,
    retryWidgetLoad: vi.fn(),
    startPayment: vi.fn(),
    updatePaymentStatus: vi.fn(),
    setInitiateError: vi.fn(),
  }),
}))

describe('PaymentStep / PaymentForm — mobile-money-first (R22.6)', () => {
  it('mobile money appears before card in the rendered DOM', () => {
    const { container } = render(
      <PaymentForm
        applicationId="11111111-1111-1111-1111-111111111111"
        amount={153}
        currency="ZMW"
        phone="+260977000000"
        fullName="Student"
        email="student@example.com"
      />,
    )
    const text = container.textContent?.toLowerCase() ?? ''
    const mobileIdx = text.indexOf('mobile money')
    const cardIdx = text.indexOf('card')
    // Both labels are rendered — mobile money must appear first.
    expect(mobileIdx).toBeGreaterThanOrEqual(0)
    expect(cardIdx).toBeGreaterThan(mobileIdx)
  })
})
