/**
 * A verify call that answers "deferred" settles the open payment (SJR task 3.24,
 * R6-d): the poll stops, the recovery entry goes, and the parent is told.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const verifyPayment = vi.fn()
vi.mock('@/services/payments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/payments')>()
  return { ...actual, verifyPayment: (...args: unknown[]) => verifyPayment(...args) }
})
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

import { PaymentForm } from '@/components/student/PaymentForm'
import { usePaymentRecoveryStore } from '@/stores/paymentRecoveryStore'

const APP_ID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  verifyPayment.mockReset()
  usePaymentRecoveryStore.getState().clear(APP_ID)
})

describe('PaymentForm syncPendingPayment (clause 2.35)', () => {
  it('reports a deferred verify result, clears the recovery entry and stops waiting', async () => {
    usePaymentRecoveryStore.getState().record({
      application_id: APP_ID,
      payment_id: 'pay-1',
      reference: 'ref-1',
      method: 'mobile_money',
      initiated_at: Date.now(),
    })
    verifyPayment.mockResolvedValue({ status: 'deferred' })
    const onPaymentStatusChange = vi.fn()
    render(
      <PaymentForm
        applicationId={APP_ID}
        baseAmount="153.00"
        providerFee="1.53"
        totalAmount="154.53"
        currency="ZMW"
        phone="+260977000000"
        fullName="Test Student"
        email="student@example.com"
        polledStatus={null}
        pendingPaymentId="pay-1"
        onPaymentStatusChange={onPaymentStatusChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /check payment now/i }))
    await waitFor(() => expect(onPaymentStatusChange).toHaveBeenCalledWith('deferred'))
    expect(verifyPayment).toHaveBeenCalledWith('pay-1')
    expect(usePaymentRecoveryStore.getState().get(APP_ID)).toBeNull()
    expect(onPaymentStatusChange).not.toHaveBeenCalledWith('pending')
  })
})
