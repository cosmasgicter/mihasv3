/**
 * Drift guard — frontend stable-code union matches backend catalogue.
 *
 * Task 22.4 of the payment-hardening spec. The backend catalogue mirror
 * fixture at `tests/unit/__fixtures__/paymentErrorCodesBackendMirror.ts`
 * is updated in lockstep with
 * `backend/apps/documents/payment_error_codes.py`.
 *
 * Validates: Requirements R15.1, R15.2, R15.5.
 */

import { describe, expect, it } from 'vitest'

import {
  isPaymentStableCode,
  PAYMENT_ERROR_COPY,
  PAYMENT_STABLE_CODES,
  type PaymentStableCode,
} from '@/lib/paymentErrorCodes'

import { BACKEND_PAYMENT_STABLE_CODES } from './__fixtures__/paymentErrorCodesBackendMirror'

describe('PaymentStableCode — drift guard', () => {
  const frontendCodes = new Set(PAYMENT_STABLE_CODES as readonly string[])
  const backendCodes = new Set(BACKEND_PAYMENT_STABLE_CODES)

  it('frontend union has no codes the backend catalogue lacks', () => {
    const onlyFrontend = [...frontendCodes].filter((c) => !backendCodes.has(c))
    expect(onlyFrontend).toEqual([])
  })

  it('backend catalogue has no codes the frontend union lacks', () => {
    const onlyBackend = [...backendCodes].filter((c) => !frontendCodes.has(c))
    expect(onlyBackend).toEqual([])
  })

  it('every stable code has user-facing copy', () => {
    for (const code of PAYMENT_STABLE_CODES) {
      const copy = PAYMENT_ERROR_COPY[code as PaymentStableCode]
      expect(copy, `missing PAYMENT_ERROR_COPY entry for ${code}`).toBeDefined()
      expect(copy.title.length, `empty title for ${code}`).toBeGreaterThan(0)
      expect(copy.body.length, `empty body for ${code}`).toBeGreaterThan(0)
    }
  })

  it('PAYMENT_STABLE_CODES has no duplicates', () => {
    expect(PAYMENT_STABLE_CODES.length).toBe(frontendCodes.size)
  })
})

describe('isPaymentStableCode — type guard', () => {
  it('returns true for every registered code', () => {
    for (const code of PAYMENT_STABLE_CODES) {
      expect(isPaymentStableCode(code)).toBe(true)
    }
  })

  it('returns false for arbitrary strings, numbers, and nullish values', () => {
    expect(isPaymentStableCode('NOT_A_REAL_CODE')).toBe(false)
    expect(isPaymentStableCode('')).toBe(false)
    expect(isPaymentStableCode(42)).toBe(false)
    expect(isPaymentStableCode(null)).toBe(false)
    expect(isPaymentStableCode(undefined)).toBe(false)
  })
})

describe('PAYMENT_ERROR_COPY — exhaustive coverage', () => {
  it('PAYMENT_ERROR_COPY keys equal PAYMENT_STABLE_CODES', () => {
    const copyKeys = Object.keys(PAYMENT_ERROR_COPY).sort()
    const codeList = [...PAYMENT_STABLE_CODES].sort()
    expect(copyKeys).toEqual(codeList)
  })
})
