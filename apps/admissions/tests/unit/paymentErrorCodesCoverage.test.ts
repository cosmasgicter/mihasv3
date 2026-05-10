/**
 * Stable-code coverage snapshot (Task 31.3).
 *
 * Lock-in test: every backend code has a TypeScript union member and a
 * non-empty copy entry. Every next-action has a matching copy entry.
 * Snapshots both `PAYMENT_ERROR_COPY` and `PAYMENT_NEXT_ACTION_COPY` so
 * silent wording changes fail CI.
 *
 * Validates: Requirements R15.1, R15.5, R14.4.
 */

import { describe, expect, it } from 'vitest'

import {
  PAYMENT_ERROR_COPY,
  PAYMENT_STABLE_CODES,
  type PaymentStableCode,
} from '@/lib/paymentErrorCodes'
import {
  PAYMENT_NEXT_ACTION_COPY,
  PAYMENT_NEXT_ACTIONS,
  isPaymentNextAction,
  type PaymentNextAction,
} from '@/lib/paymentNextActions'

import { BACKEND_PAYMENT_STABLE_CODES } from './__fixtures__/paymentErrorCodesBackendMirror'

describe('PAYMENT_STABLE_CODES — coverage', () => {
  it('every backend code has a matching frontend union member', () => {
    const frontend = new Set<string>(PAYMENT_STABLE_CODES)
    for (const code of BACKEND_PAYMENT_STABLE_CODES) {
      expect(frontend.has(code), `missing frontend code ${code}`).toBe(true)
    }
  })

  it('every frontend code has a PAYMENT_ERROR_COPY entry with non-empty title + body', () => {
    for (const code of PAYMENT_STABLE_CODES) {
      const copy = PAYMENT_ERROR_COPY[code as PaymentStableCode]
      expect(copy, `missing copy for ${code}`).toBeDefined()
      expect(copy.title.trim().length).toBeGreaterThan(0)
      expect(copy.body.trim().length).toBeGreaterThan(0)
    }
  })

  it('PAYMENT_ERROR_COPY snapshot pins wording', () => {
    // Snapshot as sorted entries so ordering drift doesn't cause spurious diffs.
    const snapshot = [...PAYMENT_STABLE_CODES]
      .sort()
      .map((code) => ({
        code,
        title: PAYMENT_ERROR_COPY[code as PaymentStableCode].title,
        body: PAYMENT_ERROR_COPY[code as PaymentStableCode].body,
      }))
    expect(snapshot).toMatchSnapshot()
  })
})

describe('PAYMENT_NEXT_ACTIONS — coverage', () => {
  it('every next-action has a PAYMENT_NEXT_ACTION_COPY entry', () => {
    for (const action of PAYMENT_NEXT_ACTIONS) {
      const copy = PAYMENT_NEXT_ACTION_COPY[action as PaymentNextAction]
      expect(copy, `missing copy for ${action}`).toBeDefined()
      expect(copy.label.trim().length).toBeGreaterThan(0)
      expect(copy.guidance.trim().length).toBeGreaterThan(0)
    }
  })

  it('isPaymentNextAction identifies every member and rejects non-members', () => {
    for (const action of PAYMENT_NEXT_ACTIONS) {
      expect(isPaymentNextAction(action)).toBe(true)
    }
    expect(isPaymentNextAction('not_a_real_action')).toBe(false)
    expect(isPaymentNextAction(null)).toBe(false)
    expect(isPaymentNextAction(undefined)).toBe(false)
    expect(isPaymentNextAction(42)).toBe(false)
  })

  it('PAYMENT_NEXT_ACTION_COPY snapshot pins wording', () => {
    const snapshot = [...PAYMENT_NEXT_ACTIONS]
      .sort()
      .map((action) => ({
        action,
        label: PAYMENT_NEXT_ACTION_COPY[action as PaymentNextAction].label,
        guidance: PAYMENT_NEXT_ACTION_COPY[action as PaymentNextAction].guidance,
      }))
    expect(snapshot).toMatchSnapshot()
  })
})
