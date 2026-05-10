/**
 * Property-based tests — paymentRecoveryStore (Task 33.2).
 *
 * Covers:
 * - Round-trip: every recorded entry whose TTL hasn't passed is
 *   retrievable via `get()` and compares equal to the recorded value.
 * - TTL: once `Date.now()` advances past `ttl_expires_at`, `get()`
 *   returns null.
 * - Prune idempotence: `pruneExpired()` is idempotent.
 *
 * Validates: Requirements R14.2, R20.1.
 */

import fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createPaymentRecoveryStore,
  PAYMENT_RECOVERY_TTL_MS,
  type PaymentRecoveryEntry,
} from '@/stores/paymentRecoveryStore'

const entryArb = fc
  .record({
    application_id: fc.uuidV(4),
    payment_id: fc.uuidV(4),
    reference: fc.stringMatching(/^REF-[A-Z0-9]{4,20}$/),
    method: fc.constantFrom<'card' | 'mobile_money'>('card', 'mobile_money'),
    initiated_at: fc.integer({ min: 0, max: 2 ** 40 }),
  })
  .map(
    (r): PaymentRecoveryEntry => ({
      ...r,
      ttl_expires_at: r.initiated_at + PAYMENT_RECOVERY_TTL_MS,
    }),
  )

const entryArrayArb = fc.array(entryArb, { minLength: 0, maxLength: 20 })

describe('paymentRecoveryStore — round-trip + TTL (R14.2)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.useRealTimers()
  })

  it('recorded entries with future TTL round-trip through get()', () => {
    fc.assert(
      fc.property(entryArrayArb, (entries) => {
        localStorage.clear()
        const store = createPaymentRecoveryStore(`prop-rt-${Math.random()}`)

        // Freeze Date.now() well before any TTL so every entry is "fresh".
        const nowBase = 1_000_000
        vi.useFakeTimers()
        vi.setSystemTime(nowBase)

        // Record each entry; the store recomputes ttl_expires_at itself.
        for (const entry of entries) {
          store.getState().record({
            application_id: entry.application_id,
            payment_id: entry.payment_id,
            reference: entry.reference,
            method: entry.method,
            initiated_at: nowBase,
          })
        }

        // Deduplicate by application_id — later entries overwrite earlier.
        const seen = new Map<string, PaymentRecoveryEntry>()
        for (const entry of entries) {
          seen.set(entry.application_id, {
            ...entry,
            initiated_at: nowBase,
            ttl_expires_at: nowBase + PAYMENT_RECOVERY_TTL_MS,
          })
        }

        for (const [appId, expected] of seen) {
          const actual = store.getState().get(appId)
          expect(actual).not.toBeNull()
          expect(actual?.payment_id).toBe(expected.payment_id)
          expect(actual?.reference).toBe(expected.reference)
          expect(actual?.method).toBe(expected.method)
          expect(actual?.ttl_expires_at).toBe(expected.ttl_expires_at)
        }

        vi.useRealTimers()
      }),
      { numRuns: 50, seed: 0 },
    )
  })

  it('get() returns null once Date.now() advances past ttl_expires_at', () => {
    fc.assert(
      fc.property(entryArb, (entry) => {
        localStorage.clear()
        const store = createPaymentRecoveryStore(`prop-ttl-${Math.random()}`)

        const nowBase = 1_000_000
        vi.useFakeTimers()
        vi.setSystemTime(nowBase)

        store.getState().record({
          application_id: entry.application_id,
          payment_id: entry.payment_id,
          reference: entry.reference,
          method: entry.method,
          initiated_at: nowBase,
        })

        // Advance past the TTL — read must return null.
        vi.setSystemTime(nowBase + PAYMENT_RECOVERY_TTL_MS + 1)
        expect(store.getState().get(entry.application_id)).toBeNull()

        vi.useRealTimers()
      }),
      { numRuns: 50, seed: 0 },
    )
  })
})

describe('paymentRecoveryStore — pruneExpired idempotence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.useRealTimers()
  })

  it('pruneExpired is idempotent — entries after first call equal after second call', () => {
    fc.assert(
      fc.property(entryArrayArb, (entries) => {
        localStorage.clear()
        const store = createPaymentRecoveryStore(`prop-prune-${Math.random()}`)

        const nowBase = 5_000_000_000
        vi.useFakeTimers()
        vi.setSystemTime(nowBase)

        // Half the entries are expired by construction; half are fresh.
        for (let i = 0; i < entries.length; i += 1) {
          const entry = entries[i]
          const isExpired = i % 2 === 0
          store.getState().record({
            application_id: entry.application_id,
            payment_id: entry.payment_id,
            reference: entry.reference,
            method: entry.method,
            initiated_at: isExpired
              ? nowBase - PAYMENT_RECOVERY_TTL_MS - 1000
              : nowBase,
          })
        }

        store.getState().pruneExpired()
        const afterFirst = JSON.stringify(store.getState().entries)

        store.getState().pruneExpired()
        const afterSecond = JSON.stringify(store.getState().entries)

        expect(afterFirst).toBe(afterSecond)
        vi.useRealTimers()
      }),
      { numRuns: 50, seed: 0 },
    )
  })
})
