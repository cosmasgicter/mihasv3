/**
 * The client renders server money and computes none of it.
 *
 * Admissions-v2 task 8.1 — requirements **R12.1** (server-authored expiring quote;
 * the frontend performs no amount arithmetic), **R12.2** (a missing fee
 * configuration fails closed, with no substituted amount), **R12.6** (server
 * amounts, quote expiry, and a recovery action are shown). Findings **STU-08**
 * (hardcoded 1% fee + K150/USD 20 empty state) and **DATA-05**.
 *
 * The interesting cases are the awkward ones: a quote whose provider fee is not
 * 1% of the base, a zero provider fee, and a total that is deliberately not
 * base + 1% — if the UI were still computing, these would render the wrong number.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PaymentForm } from '@/components/student/PaymentForm'
import { FeeQuoteRefusal } from '@/components/student/FeeQuoteRefusal'
import { formatServerAmount, isNonZeroServerAmount, formatExpiryTime } from '@/lib/serverAmount'
import { PAYMENT_ERROR_COPY, PAYMENT_STABLE_CODES } from '@/lib/paymentErrorCodes'
import { PAYMENT_NEXT_ACTION_COPY, recoveryActionForStableCode } from '@/lib/paymentNextActions'

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

const APPLICATION_ID = '11111111-1111-1111-1111-111111111111'

describe('formatServerAmount — display only, no arithmetic', () => {
  it('passes the server digits through untouched', () => {
    expect(formatServerAmount('153.00', 'ZMW')).toBe('K153.00')
    expect(formatServerAmount('20.00', 'USD')).toBe('$20.00')
    expect(formatServerAmount('1234.56', 'GBP')).toBe('GBP 1234.56')
  })

  it('does not round, pad, or recompute an odd but valid server value', () => {
    // A server that quotes three decimals or a bare integer is still rendered
    // verbatim: the client is not allowed to "fix" money.
    expect(formatServerAmount('153.4', 'ZMW')).toBe('K153.4')
    expect(formatServerAmount('153', 'ZMW')).toBe('K153')
  })

  it('renders nothing for a missing amount instead of inventing one', () => {
    expect(formatServerAmount(null, 'ZMW')).toBe('')
    expect(formatServerAmount(undefined, 'ZMW')).toBe('')
    expect(formatServerAmount('', 'ZMW')).toBe('')
  })

  it('treats zero-valued strings as zero without parsing to a number', () => {
    expect(isNonZeroServerAmount('0.00')).toBe(false)
    expect(isNonZeroServerAmount('0')).toBe(false)
    expect(isNonZeroServerAmount('0.01')).toBe(true)
    expect(isNonZeroServerAmount(null)).toBe(false)
  })

  it('returns an empty expiry label rather than inventing a deadline', () => {
    expect(formatExpiryTime(null)).toBe('')
    expect(formatExpiryTime('not-a-date')).toBe('')
    expect(formatExpiryTime(new Date('2026-07-30T09:15:00Z').toISOString())).not.toBe('')
  })
})

describe('PaymentForm — charges exactly what the server quoted', () => {
  it('shows the server total, not base plus an assumed percentage', () => {
    render(
      <PaymentForm
        applicationId={APPLICATION_ID}
        baseAmount="300.00"
        providerFee="7.50"
        totalAmount="307.50"
        currency="ZMW"
      />,
    )

    const button = screen.getByTestId('pay-momo-button')
    expect(button.textContent).toContain('K307.50')
    // The old client maths would have produced 303.00 from a 1% assumption.
    expect(button.textContent).not.toContain('K303.00')
  })

  it('shows the base amount when the institution absorbs the provider fee', () => {
    render(
      <PaymentForm
        applicationId={APPLICATION_ID}
        baseAmount="300.00"
        providerFee="0.00"
        totalAmount="300.00"
        currency="ZMW"
      />,
    )

    expect(screen.getByTestId('pay-momo-button').textContent).toContain('K300.00')
  })

  it('falls back to the base amount, never to a computed total, when no breakdown is given', () => {
    render(
      <PaymentForm applicationId={APPLICATION_ID} baseAmount="250.00" currency="ZMW" />,
    )

    const label = screen.getByTestId('pay-momo-button').textContent ?? ''
    expect(label).toContain('K250.00')
    expect(label).not.toContain('K252.50')
  })

  it('disables payment when the server amount is zero', () => {
    render(
      <PaymentForm
        applicationId={APPLICATION_ID}
        baseAmount="0.00"
        totalAmount="0.00"
        currency="ZMW"
      />,
    )

    expect(screen.getByTestId<HTMLButtonElement>('pay-momo-button').disabled).toBe(true)
  })

  it('offers no client-side network badge for a mobile money number', () => {
    const { container } = render(
      <PaymentForm
        applicationId={APPLICATION_ID}
        baseAmount="300.00"
        totalAmount="303.00"
        currency="ZMW"
        phone="+260977000000"
      />,
    )

    // The supported-networks legend stays (it is information, not a decision);
    // what is gone is the per-number "this is Airtel/MTN" claim the client used to
    // derive from a prefix, and the Zamtel-to-Airtel default behind it.
    const badges = container.querySelectorAll('.absolute.right-3.top-1\\/2')
    expect(badges.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Quote refusals carry a named recovery action (R12.6)
// ---------------------------------------------------------------------------

describe('quote stable codes — each refusal names what to do next', () => {
  it('routes the four re-priceable quote codes to a fee refresh', () => {
    for (const code of [
      'QUOTE_EXPIRED',
      'QUOTE_INVALID',
      'QUOTE_NOT_FOUND',
      'QUOTE_CONFIGURATION_CHANGED',
    ] as const) {
      expect(recoveryActionForStableCode(code)).toBe('refresh_quote')
    }
  })

  it('sends a spent quote to the payment status, not to another attempt', () => {
    // A redeemed quote already funded a Payment. Offering "pay again" here is how a
    // student ends up paying twice.
    expect(recoveryActionForStableCode('QUOTE_ALREADY_REDEEMED')).toBe('check_status')
  })

  it('does not ask the student to retry a school fee-configuration problem', () => {
    expect(recoveryActionForStableCode('FEE_NOT_CONFIGURED')).toBe('contact_support')
    expect(recoveryActionForStableCode('FEE_AMBIGUOUS')).toBe('contact_support')
  })

  it('has a decided answer for every stable code, including "nothing to do"', () => {
    for (const code of PAYMENT_STABLE_CODES) {
      const action = recoveryActionForStableCode(code)
      if (action !== null) {
        expect(PAYMENT_NEXT_ACTION_COPY[action], `no copy for ${action}`).toBeDefined()
      }
    }
    expect(recoveryActionForStableCode(null)).toBeNull()
  })
})

describe('FeeQuoteRefusal — the student is told the reason and the recovery', () => {
  it('offers the labelled refresh affordance for an expired quote', () => {
    render(
      <FeeQuoteRefusal
        error={{
          code: 'QUOTE_EXPIRED',
          message: PAYMENT_ERROR_COPY.QUOTE_EXPIRED.body,
          recovery: 'refresh_quote',
          recoveryLabel: PAYMENT_NEXT_ACTION_COPY.refresh_quote.label,
        }}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByTestId('fee-quote-error').textContent).toBe(
      PAYMENT_ERROR_COPY.QUOTE_EXPIRED.body,
    )
    expect(screen.getByTestId('fee-quote-retry').textContent).toBe('Refresh fee')
  })

  it('shows guidance without a retry button when the school must fix the fee', () => {
    render(
      <FeeQuoteRefusal
        error={{
          code: 'FEE_NOT_CONFIGURED',
          message: PAYMENT_ERROR_COPY.FEE_NOT_CONFIGURED.body,
          recovery: 'contact_support',
          recoveryLabel: PAYMENT_NEXT_ACTION_COPY.contact_support.label,
        }}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('fee-quote-retry')).toBeNull()
    expect(screen.getByTestId('fee-quote-guidance').textContent).toBe(
      PAYMENT_NEXT_ACTION_COPY.contact_support.guidance,
    )
  })

  it('still offers a retry for an unnamed failure, and announces the refusal', () => {
    const { container } = render(
      <FeeQuoteRefusal
        error={{ code: null, message: 'Network request failed', recovery: null, recoveryLabel: null }}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByTestId('fee-quote-retry').textContent).toBe('Try again')
    // A refusal replaces the price the student was reading: it must be announced.
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
  })

  it('never renders an amount when the quote was refused', () => {
    const { container } = render(
      <FeeQuoteRefusal
        error={{
          code: 'QUOTE_EXPIRED',
          message: PAYMENT_ERROR_COPY.QUOTE_EXPIRED.body,
          recovery: 'refresh_quote',
          recoveryLabel: 'Refresh fee',
        }}
        onRefresh={vi.fn()}
      />,
    )

    // No K, no $, no digits-with-decimals: a refused quote has no price to show.
    expect(container.textContent ?? '').not.toMatch(/[K$]\s?\d|\d+\.\d{2}/)
  })
})
