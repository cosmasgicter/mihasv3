/**
 * PaymentForm cannot start a second collection — and does not park a dead button.
 *
 * Originally task 36.4 of the payment-hardening spec (R14.1: `inflight` and
 * `pendingPaymentId` gate the initiate buttons so a student cannot fire a second
 * collection request).
 *
 * Updated by **admissions-v2 task 8.3** (R12.6, finding STU-24). The R14.1
 * guarantee is unchanged and is now stronger, but the *shape* of it changed for one
 * of the two gates:
 *
 * - `inflight` is a transient in-request gate. The button stays rendered and
 *   disabled with a spinner: the condition for it becoming enabled is visible and
 *   measured in milliseconds.
 * - `pendingPaymentId` means a payment is already open — recovered from the store
 *   after a refresh, or from the server on `/student/payment`. That used to render
 *   the method picker with the initiate button disabled *indefinitely*, with no
 *   stated condition for it becoming usable and no path forward. That is an
 *   indefinite disabled control, and R12.6 forbids it. The form now renders the wait
 *   state instead, which names what is being waited on and offers a status
 *   re-check — so there is no initiate control to disable at all.
 *
 * Validates: Requirements R14.1, R12.6.
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
  // Task 8.1: amounts are server-authored decimal strings from the fee quote.
  baseAmount: '153.00',
  providerFee: '1.53',
  totalAmount: '154.53',
  currency: 'ZMW',
  phone: '+260977000000',
  fullName: 'Test Student',
  email: 'student@example.com',
  polledStatus: null as null | 'pending' | 'successful' | 'failed',
}

function findInitiateButton(root: HTMLElement, kind: 'momo' | 'card') {
  return root.querySelector<HTMLButtonElement>(`[data-testid="pay-${kind}-button"]`)
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
})

describe('PaymentForm — an already-open payment is a state, not a dead button (R12.6)', () => {
  it('renders the wait state instead of a disabled initiate button', () => {
    const { container } = render(<PaymentForm {...baseProps} pendingPaymentId="pay-123" />)

    // No initiate control exists to be indefinitely disabled…
    expect(findInitiateButton(container, 'momo')).toBeNull()
    expect(findInitiateButton(container, 'card')).toBeNull()
    // …and the student is told what is happening, with a way to re-check.
    const panel = container.querySelector('[data-testid="payment-pending-panel"]')
    expect(panel).not.toBeNull()
    expect(container.textContent?.toLowerCase()).toContain('check payment now')
  })

  it('still starts no second collection when both gates are active', () => {
    const { container } = render(
      <PaymentForm {...baseProps} inflight pendingPaymentId="pay-123" />,
    )
    expect(findInitiateButton(container, 'momo')).toBeNull()
    expect(container.querySelector('[data-testid="payment-pending-panel"]')).not.toBeNull()
  })

  it('yields to a settled outcome rather than showing a stale wait', () => {
    const settled = render(
      <PaymentForm {...baseProps} pendingPaymentId="pay-123" polledStatus="successful" />,
    )
    expect(settled.container.querySelector('[data-testid="payment-pending-panel"]')).toBeNull()
    expect(settled.container.textContent?.toLowerCase()).toContain('payment confirmed')
    settled.unmount()

    const failed = render(
      <PaymentForm {...baseProps} pendingPaymentId="pay-123" polledStatus="failed" />,
    )
    expect(failed.container.querySelector('[data-testid="payment-pending-panel"]')).toBeNull()
    expect(failed.container.textContent?.toLowerCase()).toContain('payment unsuccessful')
  })
})
