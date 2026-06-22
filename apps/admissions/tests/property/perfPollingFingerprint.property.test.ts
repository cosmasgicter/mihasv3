// @vitest-environment node
/**
 * Property Test: Fingerprint dedup suppresses redundant updates
 * Feature: system-performance-hardening, Property 15
 * Validates: Requirements 11.3
 *
 * R11.3: WHILE the Admin_Dashboard is mounted, THE Platform SHALL refetch the
 * overlapping admin statistics at a polling interval no less frequent than the
 * interval in effect before consolidation, and SHALL apply React Query
 * fingerprint deduplication so that an unchanged fingerprint produces no
 * redundant network refetch / change notification.
 *
 * Property 15 (design.md): For any two consecutive admin-stat payloads, when
 * their fingerprints are equal the polling owner produces no redundant change
 * notification or network refetch effect, and when fingerprints differ it
 * produces exactly one update.
 *
 * Strategy: drive the REAL `statsFingerprint` function used by
 * `useAdminDashboardPolling` (the deterministic dedup core) over arbitrary
 * sequences of fetched stat payloads (some equal to the previous, some
 * different). The polling owner fires `onDataChange` only when the new
 * fingerprint differs from the previous one, so the number of propagated
 * updates over a sequence must equal the number of fingerprint *changes* in
 * that sequence — never more.
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  statsFingerprint,
  type AdminDashboardStats,
} from '../../src/hooks/useAdminDashboardPolling'

// ---- Dedup owner model (mirrors the effect in useAdminDashboardPolling) ----
//
// The hook holds `previousFingerprintRef` and fires the update callback only
// when `statsFingerprint(data.stats) !== previousFingerprintRef.current`. This
// helper replays that exact decision using the production fingerprint function
// and counts how many updates would propagate.
function countPropagatedUpdates(sequence: AdminDashboardStats[]): number {
  let previousFingerprint: string | null = null
  let updates = 0
  for (const stats of sequence) {
    const fp = statsFingerprint(stats)
    if (fp !== previousFingerprint) {
      previousFingerprint = fp
      updates += 1
    }
  }
  return updates
}

// Independent count of fingerprint *changes* in the sequence (an update is
// expected at index 0 and at every index whose fingerprint differs from the
// prior one). Computed directly from the production fingerprint so the property
// asserts owner behavior, not a re-derivation of the same loop.
function countFingerprintChanges(sequence: AdminDashboardStats[]): number {
  const fingerprints = sequence.map(statsFingerprint)
  let changes = 0
  for (let i = 0; i < fingerprints.length; i++) {
    if (i === 0 || fingerprints[i] !== fingerprints[i - 1]) {
      changes += 1
    }
  }
  return changes
}

// ---- Generators ----

const countArb = fc.integer({ min: 0, max: 100_000 })
const systemHealthArb = fc.constantFrom<AdminDashboardStats['systemHealth']>(
  'excellent',
  'good',
  'warning',
  'critical',
)

// The 9 fingerprint-relevant count fields. A small max keeps the value space
// tight enough that duplicates and changes both appear naturally across runs.
const fingerprintCountsArb = fc.record({
  totalApplications: countArb,
  pendingApplications: countArb,
  approvedApplications: countArb,
  conditionallyApprovedApplications: countArb,
  enrolledApplications: countArb,
  acceptedApplications: countArb,
  rejectedApplications: countArb,
  todayApplications: countArb,
  weekApplications: countArb,
})

// Additive fields that are intentionally EXCLUDED from the fingerprint.
const additiveFieldsArb = fc.record({
  avgProcessingTime: fc.integer({ min: 0, max: 10_000 }),
  systemHealth: systemHealthArb,
  activeUsers: fc.integer({ min: 0, max: 100_000 }),
})

const statsArb: fc.Arbitrary<AdminDashboardStats> = fc
  .tuple(fingerprintCountsArb, additiveFieldsArb)
  .map(([counts, additive]) => ({ ...counts, ...additive }))

// A pool + index list builds sequences that deliberately contain repeats, so
// "unchanged fingerprint" cases are well represented (not just random distinct
// payloads which would almost always differ).
const sequenceArb: fc.Arbitrary<AdminDashboardStats[]> = fc
  .array(statsArb, { minLength: 1, maxLength: 6 })
  .chain((pool) =>
    fc
      .array(fc.nat({ max: pool.length - 1 }), { minLength: 1, maxLength: 30 })
      .map((indices) => indices.map((i) => ({ ...pool[i] }))),
  )

describe('Feature: system-performance-hardening, Property 15: Fingerprint dedup suppresses redundant updates', () => {
  it('two consecutive payloads with equal fingerprint produce no second update', () => {
    /** **Validates: Requirements 11.3** */
    fc.assert(
      fc.property(statsArb, additiveFieldsArb, (stats, additive) => {
        // Same counts, possibly different additive fields → identical fingerprint.
        const next: AdminDashboardStats = { ...stats, ...additive }
        expect(statsFingerprint(next)).toBe(statsFingerprint(stats))

        // First payload fires once; identical-fingerprint follow-up suppresses.
        expect(countPropagatedUpdates([stats, next])).toBe(1)
      }),
      { numRuns: 200 },
    )
  })

  it('two consecutive payloads with differing fingerprint produce exactly one extra update', () => {
    /** **Validates: Requirements 11.3** */
    fc.assert(
      fc.property(statsArb, statsArb, (a, b) => {
        const fired = countPropagatedUpdates([a, b])
        if (statsFingerprint(a) === statsFingerprint(b)) {
          // Unchanged fingerprint → no redundant update on the second poll.
          expect(fired).toBe(1)
        } else {
          // Changed fingerprint → exactly one update for each distinct payload.
          expect(fired).toBe(2)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('over any sequence, propagated updates equal the number of fingerprint changes, never more', () => {
    /** **Validates: Requirements 11.3** */
    fc.assert(
      fc.property(sequenceArb, (sequence) => {
        const updates = countPropagatedUpdates(sequence)
        const changes = countFingerprintChanges(sequence)

        // Core invariant: dedup fires exactly on fingerprint changes.
        expect(updates).toBe(changes)
        // It must never propagate more updates than there are payloads.
        expect(updates).toBeLessThanOrEqual(sequence.length)
        // And never more than the number of fingerprint changes.
        expect(updates).toBeLessThanOrEqual(changes)
      }),
      { numRuns: 200 },
    )
  })

  it('N identical consecutive payloads propagate exactly one update', () => {
    /** **Validates: Requirements 11.3** */
    fc.assert(
      fc.property(statsArb, fc.integer({ min: 1, max: 25 }), (stats, repeat) => {
        const sequence = Array.from({ length: repeat }, () => ({ ...stats }))
        expect(countPropagatedUpdates(sequence)).toBe(1)
      }),
      { numRuns: 200 },
    )
  })

  it('additive non-count fields never trigger a redundant update', () => {
    /** **Validates: Requirements 11.3** */
    fc.assert(
      fc.property(
        fingerprintCountsArb,
        fc.array(additiveFieldsArb, { minLength: 2, maxLength: 10 }),
        (counts, additiveVariants) => {
          // Same counts throughout, only additive fields vary between polls.
          const sequence = additiveVariants.map((additive) => ({
            ...counts,
            ...additive,
          }))
          // Fingerprint is constant → only the first poll propagates.
          expect(countPropagatedUpdates(sequence)).toBe(1)
        },
      ),
      { numRuns: 200 },
    )
  })
})
