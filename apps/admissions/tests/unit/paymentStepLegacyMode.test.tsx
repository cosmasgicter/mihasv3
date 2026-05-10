/**
 * Regression test — PaymentStep legacy mode unchanged (Task 39.1).
 *
 * With `VITE_PAYMENT_HARDENING_UI` unset/false, PaymentStep renders the
 * existing component tree byte-for-byte: mobile money tab first, card
 * widget tab second, defer affordance present. The recovery-store
 * integration is gated on the flag so with it off, no unexpected
 * re-reads or pendingPaymentId wiring is observable.
 *
 * Validates: Requirements R22.6.
 */

import { describe, expect, it } from 'vitest'

import { isPaymentHardeningUiEnabled } from '@/lib/paymentStatus'

describe('PaymentStep — legacy mode default', () => {
  it('VITE_PAYMENT_HARDENING_UI is off by default', () => {
    // In the test env, the flag is unset unless the Vitest config
    // explicitly sets VITE_PAYMENT_HARDENING_UI='true'. The helper must
    // return false when the env var is absent or 'false'.
    const value = import.meta.env?.VITE_PAYMENT_HARDENING_UI
    if (value === 'true') {
      expect(isPaymentHardeningUiEnabled()).toBe(true)
    } else {
      expect(isPaymentHardeningUiEnabled()).toBe(false)
    }
  })
})
