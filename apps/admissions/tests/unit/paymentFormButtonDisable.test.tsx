/**
 * Unit test — PaymentForm disables initiate buttons while inflight /
 * while a pending payment exists (Task 36.4).
 *
 * The props `inflight` and `pendingPaymentId` gate `canPay` so the
 * Mobile Money and Card submit buttons cannot be clicked during a
 * request or while the student has an outstanding pending Payment.
 *
 * Validates: Requirements R14.1.
 */

import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PaymentForm } from '@/components/student/PaymentForm'

// ---------------------------------------------------------------------------
// Mock the Lenco widget hook so the card button's own loading gate is
// neutralised. We only care about the `canPay` external gate here.
// ---------------------------------------------------------------------------

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

const baseProps = {
  applicationId: '11111111-1111-1111-1111-111111111111',
  amount: 153,
  currency: 'ZMW',
  phone: '+260977000000',
  fullName: 'Test Student',
  email: 'student@example.com',
  polledStatus: null as null | 'pending' | 'successful' | 'failed',
}

function findInitiateButton(root: HTMLElement, kind: 'momo' | 'card') {
  return root.querySelector<HTMLButtonElement>(
    `[data-testid="pay-${kind}-button"]`,
  )
}

describe('PaymentForm — button disable gates (R14.1)', () => {
  it('enables both initiate buttons when idle (no external inflight, no pending)', () => {
    const { container } = render(<PaymentForm {...baseProps} />)
    const momo = findInitiateButton(container, 'momo')
    // The form defaults to mobile-money view; the card button only
    // appears when the user switches tabs. We assert the visible one.
    expect(momo).not.toBeNull()
    expect(momo!.disabled).toBe(false)
  })

  it('disables mobile-money button when `inflight=true`', () => {
    const { container } = render(<PaymentForm {...baseProps} inflight />)
    const momo = findInitiateButton(container, 'momo')
    expect(momo).not.toBeNull()
    expect(momo!.disabled).toBe(true)
  })

  it('disables mobile-money button when `pendingPaymentId` is set', () => {
    const { container } = render(
      <PaymentForm {...baseProps} pendingPaymentId="pay-123" />,
    )
    const momo = findInitiateButton(container, 'momo')
    expect(momo).not.toBeNull()
    expect(momo!.disabled).toBe(true)
  })

  it('disables mobile-money button when both gates are active', () => {
    const { container } = render(
      <PaymentForm {...baseProps} inflight pendingPaymentId="pay-123" />,
    )
    const momo = findInitiateButton(container, 'momo')
    expect(momo).not.toBeNull()
    expect(momo!.disabled).toBe(true)
  })
})
