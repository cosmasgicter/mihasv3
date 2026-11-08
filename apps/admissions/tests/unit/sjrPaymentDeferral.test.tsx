/**
 * R6 exploration: deferral works under StrictMode and clears the recovery entry.
 *
 * Spec: student-journey-repair task 1.6, clauses 1.32 and 1.33 (design R6-c, R6-d).
 *
 * At HEAD `usePaymentStatus` sets `mountedRef.current = false` in a cleanup and
 * never sets it back to true, so under React 18 StrictMode (development) every
 * status update is dropped and a deferred student's Next stays disabled. And a
 * server-confirmed deferral leaves the local payment-recovery entry behind, so
 * the next visit offers a payment that no longer exists.
 *
 * Wrapped in `it.fails` (design "Marker scheme"); the R6 checkpoint, task 3.25,
 * removes the wrapper.
 */
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { useForm } from 'react-hook-form'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const APP_ID = '11111111-1111-4111-8111-111111111111'

vi.mock('@/services/client', () => ({
  apiClient: { request: vi.fn(async () => ({ results: [] })) },
}))

const deferPayment = vi.fn()
vi.mock('@/services/payments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/payments')>()
  return {
    ...actual,
    deferPayment: (...args: unknown[]) => deferPayment(...args),
    devBypassPayment: vi.fn(),
  }
})

vi.mock('@/hooks/useFeeQuote', () => ({
  useFeeQuote: () => ({
    quote: {
      base_amount: '153.00',
      provider_fee: '1.53',
      total_amount: '154.53',
      currency: 'ZMW',
      residency_category: 'local',
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    },
    isLoading: false,
    error: null,
    isExpired: false,
    refresh: vi.fn(),
  }),
}))

vi.mock('@/components/student/PaymentForm', () => ({
  PaymentForm: () => <div data-testid="payment-form-stub" />,
}))

import { usePaymentStatus } from '@/hooks/usePaymentStatus'
import { isPaymentResolvedForProgress } from '@/lib/paymentStatus'
import PaymentStep from '@/pages/student/applicationWizard/steps/PaymentStep'
import type { WizardFormData } from '@/pages/student/applicationWizard/types'
import { usePaymentRecoveryStore } from '@/stores/paymentRecoveryStore'

function recordEntry() {
  usePaymentRecoveryStore.getState().record({
    application_id: APP_ID,
    payment_id: 'pay-1',
    reference: 'ref-1',
    method: 'mobile_money',
    initiated_at: Date.now(),
  })
  expect(usePaymentRecoveryStore.getState().get(APP_ID)).not.toBeNull()
}

function Step(props: { polledStatus?: 'deferred' | null }) {
  const form = useForm<WizardFormData>({ defaultValues: {} as WizardFormData })
  return (
    <PaymentStep
      title="Payment"
      form={form}
      applicationId={APP_ID}
      applicationNumber={null}
      polledStatus={props.polledStatus ?? null}
      onPaymentStatusChange={() => undefined}
    />
  )
}

beforeEach(() => {
  deferPayment.mockReset()
  deferPayment.mockResolvedValue(undefined)
  usePaymentRecoveryStore.getState().clear(APP_ID)
})

describe('payment hooks (clauses 1.32, 1.33)', () => {
  it.fails('a deferral arriving after mount is adopted under StrictMode', async () => {
    // The first effect pass (before StrictMode's simulated unmount) can still set
    // state, so the defect shows on an update that arrives later: the student
    // defers, the application's payment status changes, and the hook is told.
    const { result, rerender } = renderHook(
      ({ applicationPaymentStatus }: { applicationPaymentStatus: string | null }) =>
        usePaymentStatus(APP_ID, applicationPaymentStatus),
      { wrapper: StrictMode, initialProps: { applicationPaymentStatus: null as string | null } },
    )
    expect(result.current.status).toBeNull()

    rerender({ applicationPaymentStatus: 'deferred' })

    await waitFor(() => expect(result.current.status).toBe('deferred'))
    // The wizard's Next gate reads this through the progress helper.
    expect(isPaymentResolvedForProgress(result.current.status)).toBe(true)
  })

  it.fails('clears the recovery entry once the server confirms a deferral', async () => {
    recordEntry()
    render(<Step />)

    fireEvent.click(screen.getByTestId('pay-later-button'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /yes, pay later/i }))
    })

    await waitFor(() => expect(deferPayment).toHaveBeenCalledWith(APP_ID))
    expect(usePaymentRecoveryStore.getState().get(APP_ID)).toBeNull()
  })

  it.fails('clears the recovery entry when another tab confirmed the deferral', async () => {
    recordEntry()

    render(<Step polledStatus="deferred" />)

    await waitFor(() => expect(usePaymentRecoveryStore.getState().get(APP_ID)).toBeNull())
  })
})
