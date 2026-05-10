/**
 * Regression test — `normalizePaymentStatus` still maps legacy `verified`
 * and `paid` to the canonical `verified` UI state, and `force_approved`
 * is also treated as verified so student reads are unchanged by the
 * payment-hardening Phase 2 rollout.
 *
 * Validates: Requirements R22.6 (backward-compat for student-facing
 * payment status reads) and ADR-002 (force_approved is a distinct
 * ledger status but UX-collapsed to verified via normalizePaymentStatus).
 */

import { describe, expect, it } from 'vitest'

import {
  isPaymentVerified,
  normalizePaymentStatus,
} from '@/lib/paymentStatus'

describe('normalizePaymentStatus — legacy status compatibility', () => {
  it('maps legacy `verified` to verified', () => {
    expect(normalizePaymentStatus('verified')).toBe('verified')
  })

  it('maps legacy `paid` to verified', () => {
    expect(normalizePaymentStatus('paid')).toBe('verified')
  })

  it('maps canonical `successful` to verified', () => {
    expect(normalizePaymentStatus('successful')).toBe('verified')
  })

  it('maps `force_approved` to verified (ADR-002)', () => {
    expect(normalizePaymentStatus('force_approved')).toBe('verified')
  })

  it('maps `pending` to pending_review', () => {
    expect(normalizePaymentStatus('pending')).toBe('pending_review')
  })

  it('maps `deferred` to deferred', () => {
    expect(normalizePaymentStatus('deferred')).toBe('deferred')
  })

  it('maps `failed` / `rejected` to rejected', () => {
    expect(normalizePaymentStatus('failed')).toBe('rejected')
    expect(normalizePaymentStatus('rejected')).toBe('rejected')
  })

  it('maps `expired` to not_paid', () => {
    expect(normalizePaymentStatus('expired')).toBe('not_paid')
  })

  it('maps unknown / null / undefined to not_paid', () => {
    expect(normalizePaymentStatus(null)).toBe('not_paid')
    expect(normalizePaymentStatus(undefined)).toBe('not_paid')
    expect(normalizePaymentStatus('random_thing' as string)).toBe('not_paid')
  })
})

describe('isPaymentVerified — force_approved is verified', () => {
  it('returns true for successful', () => {
    expect(isPaymentVerified('successful')).toBe(true)
  })

  it('returns true for verified', () => {
    expect(isPaymentVerified('verified')).toBe(true)
  })

  it('returns true for paid', () => {
    expect(isPaymentVerified('paid')).toBe(true)
  })

  it('returns true for force_approved', () => {
    expect(isPaymentVerified('force_approved')).toBe(true)
  })

  it('returns false for pending', () => {
    expect(isPaymentVerified('pending')).toBe(false)
  })

  it('returns false for deferred', () => {
    expect(isPaymentVerified('deferred')).toBe(false)
  })
})
