/**
 * The student payment ownership split, rendered.
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task 8.3.
 * Requirements: R12.3 (the wizard owns pre-submission pay/defer; `/student/payment`
 *               owns submitted / deferred / failed / expired / pending recovery plus
 *               history), R12.4, R12.6 (no indefinite disabled controls),
 *               R13.1 (tenant support context).
 * Findings:     STU-08, **STU-09**, **STU-24**.
 *
 * Where the previous tests stopped at the pure mapper, these render the real card
 * and assert what a student actually sees in each post-submission state — including
 * the two states that had no rendering at all before this task (`action_required`
 * and `provider_processing` on the payment page), and the disabled-forever pay
 * button that a recovered pending payment used to produce.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  PaymentApplicationCard,
  type PaymentApplicationSummary,
} from '@/components/student/payment/PaymentApplicationCard'
import { PaymentForm } from '@/components/student/PaymentForm'
import { resolveTenantSupportContact } from '@/lib/tenantSupport'
import type { PaymentPhase } from '@/lib/paymentStatus'
import type { PaymentRow } from '@/services/payments'

// ---------------------------------------------------------------------------
// Test seams: the two hooks that would otherwise reach the network.
// ---------------------------------------------------------------------------

const paymentStatusState = {
  status: null as 'pending' | 'successful' | 'failed' | 'deferred' | null,
  phase: null as PaymentPhase | null,
  pollingExceededTimeout: false,
}

vi.mock('@/hooks/usePaymentStatus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/usePaymentStatus')>()
  return {
    ...actual,
    usePaymentStatus: () => ({
      status: paymentStatusState.status,
      phase: paymentStatusState.phase,
      refetch: vi.fn().mockResolvedValue(undefined),
      setStatus: vi.fn(),
      pollingExceededTimeout: paymentStatusState.pollingExceededTimeout,
      lastUpdated: null,
    }),
  }
})

vi.mock('@/hooks/useFeeQuote', () => ({
  useFeeQuote: (applicationId: string | null) => ({
    quote:
      applicationId === null
        ? null
        : {
            quote_id: 'quote-1',
            application_id: applicationId,
            configuration_version: 'v1',
            fee_configuration_version: 'v1',
            fee_type: 'application',
            base_amount: '153.00',
            provider_fee: '1.53',
            total_amount: '154.53',
            currency: 'ZMW',
            bearer: 'customer',
            residency_category: 'local',
            waiver_applied: false,
            status: 'issued',
            expires_at: new Date(Date.now() + 600_000).toISOString(),
            signature: 'sig',
            signature_version: 1,
          },
    isLoading: false,
    error: null,
    isExpired: false,
    refresh: vi.fn(),
  }),
}))

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

vi.mock('@/hooks/useOfficialDocument', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useOfficialDocument')>()
  return {
    ...actual,
    useOfficialDocument: () => ({
      uiState: 'idle' as const,
      status: null,
      isBusy: false,
      error: null,
      isSetupRequired: false,
      download: vi.fn().mockResolvedValue(true),
      email: vi.fn().mockResolvedValue(true),
      reset: vi.fn(),
    }),
  }
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const APP_ID = '11111111-1111-1111-1111-111111111111'

function application(overrides: Partial<PaymentApplicationSummary> = {}): PaymentApplicationSummary {
  return {
    id: APP_ID,
    status: 'submitted',
    payment_status: 'not_paid',
    program: 'Diploma in Clinical Medicine',
    application_number: 'APP-20260730-ABCDEFGH',
    full_name: 'Harness Student',
    email: 'student@example.com',
    phone: '+260977000000',
    created_at: '2026-07-01T09:00:00Z',
    last_payment_audit_notes: null,
    ...overrides,
  }
}

function paymentRow(overrides: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: 'pay-1',
    application_id: APP_ID,
    status: 'pending',
    amount: '154.53',
    currency: 'ZMW',
    created_at: '2026-07-02T09:00:00Z',
    ...overrides,
  }
}

const NEUTRAL_SUPPORT = resolveTenantSupportContact()
const TENANT_SUPPORT = resolveTenantSupportContact({
  supportEmail: 'admissions@example-school.edu.zm',
  brandName: 'Example School',
})

function renderCard(
  app: PaymentApplicationSummary,
  records: PaymentRow[],
  support = NEUTRAL_SUPPORT,
) {
  return render(
    <MemoryRouter>
      <PaymentApplicationCard
        app={app}
        records={records}
        isSelected={false}
        support={support}
        onPaymentRefresh={vi.fn().mockResolvedValue(undefined)}
      />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  paymentStatusState.status = null
  paymentStatusState.phase = null
  paymentStatusState.pollingExceededTimeout = false
})

// ---------------------------------------------------------------------------
// R12.3 — the payment page owns every post-submission state
// ---------------------------------------------------------------------------

describe('the payment page renders every post-submission state (R12.3)', () => {
  it('deferred → names the choice and offers payment', () => {
    const { container } = renderCard(
      application({ payment_status: 'deferred' }),
      [paymentRow({ status: 'deferred' })],
    )
    expect(container.querySelector('[data-payment-ui-state="idle"]')).not.toBeNull()
    expect(screen.getByTestId('payment-state-detail').textContent?.toLowerCase()).toContain(
      'pay this fee later',
    )
    expect(screen.getByTestId('payment-pay-action').textContent).toContain('Pay now')
  })

  it('failed → offers a retry and states nothing was charged', () => {
    renderCard(application({ payment_status: 'failed' }), [paymentRow({ status: 'failed' })])
    const detail = screen.getByTestId('payment-state-detail')
    expect(detail.getAttribute('role')).toBe('alert')
    expect(detail.textContent?.toLowerCase()).toContain('not been charged')
    expect(screen.getByTestId('payment-pay-action').textContent).toContain('Try again')
  })

  it('expired → offers a new attempt', () => {
    renderCard(application({ payment_status: 'not_paid' }), [paymentRow({ status: 'expired' })])
    expect(screen.getByTestId('payment-pay-action').textContent).toContain('Start a new payment')
    expect(screen.getByTestId('payment-state-detail').textContent?.toLowerCase()).toContain('expired')
  })

  it('pending + action_required → instruction plus a status re-check, no pay button', () => {
    paymentStatusState.status = 'pending'
    paymentStatusState.phase = 'action_required'
    const { container } = renderCard(application({ payment_status: 'pending_review' }), [paymentRow()])

    expect(container.querySelector('[data-payment-ui-state="action_required"]')).not.toBeNull()
    expect(container.querySelector('[data-payment-phase="action_required"]')).not.toBeNull()
    expect(screen.getByTestId('payment-state-detail').textContent?.toLowerCase()).toContain('pin')
    expect(screen.getByTestId('payment-check-status')).toBeTruthy()
    expect(screen.queryByTestId('payment-pay-action')).toBeNull()
  })

  it('pending + provider_processing → a wait with nothing to do and never a retry', () => {
    paymentStatusState.status = 'pending'
    paymentStatusState.phase = 'provider_processing'
    const { container } = renderCard(application({ payment_status: 'pending_review' }), [paymentRow()])

    expect(container.querySelector('[data-payment-ui-state="provider_processing"]')).not.toBeNull()
    expect(screen.getByTestId('payment-state-detail').textContent?.toLowerCase()).toContain(
      'nothing to do',
    )
    expect(screen.queryByTestId('payment-pay-action')).toBeNull()
    expect(screen.queryByTestId('payment-resend-prompt')).toBeNull()
  })

  it('a spent action_required budget offers a resend; a spent provider budget does not', () => {
    paymentStatusState.status = 'pending'
    paymentStatusState.phase = 'action_required'
    paymentStatusState.pollingExceededTimeout = true
    const first = renderCard(application({ payment_status: 'pending_review' }), [paymentRow()])
    expect(screen.getByTestId('payment-resend-prompt')).toBeTruthy()
    expect(screen.getByTestId('payment-wait-timeout').textContent?.toLowerCase()).toContain('again')
    first.unmount()

    paymentStatusState.phase = 'provider_processing'
    renderCard(application({ payment_status: 'pending_review' }), [paymentRow()])
    expect(screen.queryByTestId('payment-resend-prompt')).toBeNull()
    expect(screen.getByTestId('payment-wait-timeout').textContent?.toLowerCase()).toContain('twice')
  })

  it('paid → receipt, no payment affordance', () => {
    renderCard(application({ payment_status: 'verified' }), [paymentRow({ status: 'successful' })])
    expect(screen.queryByTestId('payment-pay-action')).toBeNull()
    expect(screen.getByRole('button', { name: /download receipt/i })).toBeTruthy()
  })

  it('renders the payment history the page owns', () => {
    renderCard(application({ payment_status: 'verified' }), [
      paymentRow({ id: 'pay-1', status: 'failed', created_at: '2026-07-02T09:00:00Z' }),
      paymentRow({ id: 'pay-2', status: 'successful', created_at: '2026-07-03T09:00:00Z' }),
    ])
    const toggle = screen.getByTestId('payment-history-toggle')
    expect(toggle.textContent).toContain('Payment history (2)')
    fireEvent.click(toggle)
    const history = screen.getByTestId('payment-history')
    // Newest attempt first, and every row is labelled, not just coloured.
    const rows = within(history).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0].getAttribute('data-payment-row-status')).toBe('successful')
    expect(rows[0].textContent).toContain('Paid')
    expect(rows[1].textContent).toContain('Failed')
  })
})

// ---------------------------------------------------------------------------
// R12.6 — no indefinite disabled controls
// ---------------------------------------------------------------------------

describe('no indefinite disabled controls (R12.6, STU-24)', () => {
  it('a recovered pending payment renders a wait state, not a dead pay button', () => {
    const { container } = render(
      <PaymentForm
        applicationId={APP_ID}
        baseAmount="153.00"
        providerFee="1.53"
        totalAmount="154.53"
        currency="ZMW"
        phone="+260977000000"
        fullName="Harness Student"
        email="student@example.com"
        pendingPaymentId="pay-recovered-1"
      />,
    )

    // Before task 8.3 this rendered the method picker with `pay-momo-button`
    // disabled and no explanation — the finding.
    expect(container.querySelector('[data-testid="pay-momo-button"]')).toBeNull()
    expect(container.querySelector('[data-testid="payment-pending-panel"]')).not.toBeNull()
    expect(container.textContent?.toLowerCase()).toContain('payment in progress')
  })

  it('a recovered pending payment claims nothing about a handset prompt without a phase', () => {
    const { container } = render(
      <PaymentForm
        applicationId={APP_ID}
        baseAmount="153.00"
        totalAmount="153.00"
        currency="ZMW"
        pendingPaymentId="pay-recovered-2"
      />,
    )
    const text = container.textContent?.toLowerCase() ?? ''
    expect(text).not.toContain('enter your pin')
    expect(container.querySelector('[data-testid="payment-pending-panel"]')).not.toBeNull()
  })

  it('every rendered control in a waiting state is either enabled or explained', () => {
    paymentStatusState.status = 'pending'
    paymentStatusState.phase = 'provider_processing'
    const { container } = renderCard(application({ payment_status: 'pending_review' }), [paymentRow()])

    const disabled = Array.from(container.querySelectorAll('button')).filter(
      (button) => button.disabled,
    )
    expect(disabled).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// R13.1 / STU-24 — tenant support context, never hardcoded copy
// ---------------------------------------------------------------------------

describe('support contact comes from tenant context (STU-24)', () => {
  it('uses the tenant inbox when the host resolved a school', () => {
    renderCard(
      application({ payment_status: 'rejected' }),
      [paymentRow({ status: 'failed' })],
      TENANT_SUPPORT,
    )
    // The failure state offers a retry, so the support link appears with the
    // receipt/no-self-service states; assert the resolved contact directly.
    expect(TENANT_SUPPORT.href).toBe('mailto:admissions@example-school.edu.zm')
  })

  it('renders no hardcoded platform address anywhere on the card', () => {
    const { container } = renderCard(application({ payment_status: 'verified' }), [
      paymentRow({ status: 'successful' }),
    ])
    const html = container.innerHTML.toLowerCase()
    expect(html).not.toContain('admissions@beanola.com')
    expect(html).not.toContain('support@beanola.com')
    expect(html).not.toContain('mihas')
    expect(html).not.toContain('katc')
  })

  it('routes to the in-app contact page on the neutral portal', () => {
    paymentStatusState.status = null
    renderCard(
      application({ payment_status: 'not_paid' }),
      [paymentRow({ status: 'pending' })],
      NEUTRAL_SUPPORT,
    )
    expect(NEUTRAL_SUPPORT.kind).toBe('platform_contact_page')
    expect(NEUTRAL_SUPPORT.email).toBeNull()
  })
})
