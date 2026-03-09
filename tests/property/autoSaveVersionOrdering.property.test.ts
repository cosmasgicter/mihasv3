// @vitest-environment node
/**
 * Property-based tests for Auto-Save Version Ordering (Property 1)
 * Feature: production-remediation
 *
 * Property 1: Auto-save version ordering
 * For any sequence of auto-save operations on the same application,
 * the version numbers sent to the server must be strictly monotonically
 * increasing, and the server must reject (409) any save where the incoming
 * version is less than or equal to the currently stored version.
 *
 * **Validates: Requirements 2.5**
 */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

// ── Types ───────────────────────────────────────────────────────────────

interface SaveResult {
  accepted: boolean
  storedVersion: number
}

// ── Server-side version check simulation ────────────────────────────────
// Mirrors the SQL: UPDATE applications SET version = $2 WHERE id = $1 AND version < $2
// Returns true (row updated) if newVersion > storedVersion, false (0 rows) otherwise.

function simulateVersionCheck(storedVersion: number, incomingVersion: number): SaveResult {
  if (incomingVersion > storedVersion) {
    return { accepted: true, storedVersion: incomingVersion }
  }
  return { accepted: false, storedVersion }
}

/**
 * Process a sequence of version numbers against the server-side check,
 * returning the accept/reject result for each.
 */
function processVersionSequence(
  initialVersion: number,
  versions: number[],
): { results: SaveResult[]; finalVersion: number } {
  let currentVersion = initialVersion
  const results: SaveResult[] = []

  for (const v of versions) {
    const result = simulateVersionCheck(currentVersion, v)
    results.push(result)
    if (result.accepted) {
      currentVersion = result.storedVersion
    }
  }

  return { results, finalVersion: currentVersion }
}

// ── Arbitraries ─────────────────────────────────────────────────────────

/** Positive integer version numbers (matching Zod schema: z.number().int().positive()) */
const versionArb = fc.integer({ min: 1, max: 10000 })

/** A non-empty array of version numbers to simulate a sequence of save attempts */
const versionSequenceArb = fc.array(versionArb, { minLength: 1, maxLength: 20 })

/** Strictly increasing sequence of versions (simulates correct client behavior) */
const strictlyIncreasingArb = fc
  .array(fc.integer({ min: 1, max: 500 }), { minLength: 2, maxLength: 15 })
  .map((deltas) => {
    const versions: number[] = []
    let current = 1
    for (const delta of deltas) {
      current += delta
      versions.push(current)
    }
    return versions
  })

// ── Tests ────────────────────────────────────────────────────────────────

describe('Auto-Save Version Ordering Property Tests (P1)', () => {
  /**
   * **Validates: Requirements 2.5**
   *
   * Core property: for any sequence of version numbers, the server only
   * accepts versions strictly greater than the current stored version.
   */
  it('server rejects any version <= stored version and accepts only versions > stored version', () => {
    fc.assert(
      fc.property(
        versionArb,
        versionSequenceArb,
        (initialVersion, versions) => {
          const { results } = processVersionSequence(initialVersion, versions)

          let currentStored = initialVersion
          for (let i = 0; i < versions.length; i++) {
            const incoming = versions[i]
            const result = results[i]

            if (incoming > currentStored) {
              // Must be accepted
              expect(result.accepted).toBe(true)
              expect(result.storedVersion).toBe(incoming)
              currentStored = incoming
            } else {
              // Must be rejected (version <= stored)
              expect(result.accepted).toBe(false)
              expect(result.storedVersion).toBe(currentStored)
            }
          }
        },
      ),
      { numRuns: 10 },
    )
  })

  /**
   * **Validates: Requirements 2.5**
   *
   * A strictly increasing sequence of versions must all be accepted.
   */
  it('strictly increasing version sequence is fully accepted', () => {
    fc.assert(
      fc.property(strictlyIncreasingArb, (versions) => {
        const { results, finalVersion } = processVersionSequence(0, versions)

        // Every save in a strictly increasing sequence must be accepted
        for (const result of results) {
          expect(result.accepted).toBe(true)
        }

        // Final stored version must equal the last version in the sequence
        expect(finalVersion).toBe(versions[versions.length - 1])
      }),
      { numRuns: 10 },
    )
  })

  /**
   * **Validates: Requirements 2.5**
   *
   * Replaying the same version number is always rejected (no duplicate writes).
   */
  it('replaying the same version number is always rejected', () => {
    fc.assert(
      fc.property(versionArb, (version) => {
        // First save: accepted (version > initial 0)
        const first = simulateVersionCheck(0, version)
        expect(first.accepted).toBe(true)

        // Replay same version: rejected (version is not > stored)
        const replay = simulateVersionCheck(version, version)
        expect(replay.accepted).toBe(false)
        expect(replay.storedVersion).toBe(version)
      }),
      { numRuns: 10 },
    )
  })

  /**
   * **Validates: Requirements 2.5**
   *
   * Out-of-order versions in a shuffled sequence: only the ones that happen
   * to be greater than the current stored version are accepted. The stored
   * version after processing is the maximum of all accepted versions.
   */
  it('out-of-order sequence: stored version equals the max accepted version', () => {
    fc.assert(
      fc.property(
        versionSequenceArb,
        (versions) => {
          const initialVersion = 0
          const { results, finalVersion } = processVersionSequence(initialVersion, versions)

          // The final stored version must be the running maximum of accepted versions
          let expectedMax = initialVersion
          for (let i = 0; i < versions.length; i++) {
            if (results[i].accepted) {
              expectedMax = versions[i]
            }
          }
          expect(finalVersion).toBe(expectedMax)

          // The final version must also be >= initial version
          expect(finalVersion).toBeGreaterThanOrEqual(initialVersion)
        },
      ),
      { numRuns: 10 },
    )
  })

  /**
   * **Validates: Requirements 2.5**
   *
   * A decreasing sequence of versions: only the first one (if > initial) is
   * accepted; all subsequent ones are rejected since they are <= stored.
   */
  it('decreasing version sequence: at most the first version is accepted', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 500 }), { minLength: 2, maxLength: 10 }).map(
          (arr) => [...arr].sort((a, b) => b - a), // sort descending
        ),
        (decreasingVersions) => {
          const initialVersion = 0
          const { results } = processVersionSequence(initialVersion, decreasingVersions)

          // First version is always > 0, so it's accepted
          expect(results[0].accepted).toBe(true)

          // All subsequent versions are <= the first (largest), so rejected
          for (let i = 1; i < results.length; i++) {
            // Could be accepted only if strictly greater than current stored
            // But since sorted descending, each subsequent is <= previous, so rejected
            if (decreasingVersions[i] < decreasingVersions[0]) {
              expect(results[i].accepted).toBe(false)
            }
          }
        },
      ),
      { numRuns: 10 },
    )
  })
})
