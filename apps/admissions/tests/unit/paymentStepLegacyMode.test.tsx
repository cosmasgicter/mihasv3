/**
 * Guard — the payment UI has no build-time mode switch (admissions-v2 task 8.2).
 *
 * This file used to assert that `VITE_PAYMENT_HARDENING_UI` was off by default,
 * i.e. that a student's mid-payment refresh recovered or did not depending on how
 * the bundle was built. The flag and the `isPaymentHardeningUiEnabled()` helper
 * are gone; the UI state matrix and the recovery store are the only behaviour.
 *
 * What remains worth asserting is that neither comes back.
 *
 * Validates: Requirements R12.4, R12.6
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import * as paymentStatus from '@/lib/paymentStatus'

const SRC = join(process.cwd(), 'src')

describe('PaymentStep — no build-time payment UI mode switch', () => {
  it('does not export a hardening-UI flag helper', () => {
    expect('isPaymentHardeningUiEnabled' in paymentStatus).toBe(false)
  })

  it('no source file reads VITE_PAYMENT_HARDENING_UI', () => {
    const files = [
      'lib/paymentStatus.ts',
      'pages/student/applicationWizard/steps/PaymentStep.tsx',
      'components/student/PaymentForm.tsx',
      'vite-env.d.ts',
    ]
    const offenders = files.filter((relative) => {
      const contents = readFileSync(join(SRC, relative), 'utf8')
      // A comment explaining the removal is fine; reading the value is not.
      return /import\.meta\.env[^\n]*VITE_PAYMENT_HARDENING_UI/.test(contents)
    })
    expect(offenders).toEqual([])
  })
})
