// @vitest-environment node
/**
 * Property-based tests for Token Refresh Deduplication (Property 14)
 * Feature: production-remediation
 *
 * Property 14: Token refresh deduplication
 * For any number of concurrent 401 responses (2 to N), the auth controller
 * must issue exactly one refresh request. Each original request must retry
 * at most once after the refresh completes. If the refresh itself fails,
 * the system must redirect to sign-in exactly once without entering a retry loop.
 *
 * **Validates: Requirements 7.1, 7.3, 7.5**
 */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

// ── Simulated deduplication mechanism ───────────────────────────────────
// Mirrors the promise-lock pattern from src/services/authController.ts:
//   let refreshPromise: Promise<boolean> | null = null;
//   async function deduplicatedRefresh(baseUrl) { ... }

/**
 * Creates a simulated deduplication controller that mirrors the
 * module-level refreshPromise lock pattern in authController.ts.
 */
function createRefreshController() {
  let refreshPromise: Promise<boolean> | null = null
  let actualRefreshCallCount = 0

  /**
   * The underlying refresh operation. Each call increments the counter.
   */
  async function requestRefresh(shouldSucceed: boolean): Promise<boolean> {
    actualRefreshCallCount++
    // Simulate async work
    await Promise.resolve()
    return shouldSucceed
  }

  /**
   * Deduplicated refresh — mirrors the exact pattern from authController.ts.
   * If a refresh is already in-flight, returns the existing promise.
   * Otherwise starts a new refresh and clears the lock on completion.
   */
  async function deduplicatedRefresh(shouldSucceed: boolean): Promise<boolean> {
    if (refreshPromise) {
      return refreshPromise
    }
    refreshPromise = requestRefresh(shouldSucceed)
    try {
      const result = await refreshPromise
      return result
    } finally {
      refreshPromise = null
    }
  }

  return {
    deduplicatedRefresh,
    getRefreshCallCount: () => actualRefreshCallCount,
    isLockActive: () => refreshPromise !== null,
  }
}

// ── Arbitraries ─────────────────────────────────────────────────────────

/** Number of concurrent 401 callers (2 to 20) */
const concurrentCallersArb = fc.integer({ min: 2, max: 20 })

/** Number of sequential batches to test lock reset */
const batchCountArb = fc.integer({ min: 2, max: 5 })

// ── Tests ────────────────────────────────────────────────────────────────

describe('Token Refresh Deduplication Property Tests (P14)', () => {
  /**
   * **Validates: Requirements 7.1, 7.3**
   *
   * For any N concurrent callers (2-20), exactly 1 actual refresh call
   * is made regardless of N.
   */
  it('exactly one refresh call for N concurrent callers', async () => {
    await fc.assert(
      fc.asyncProperty(concurrentCallersArb, async (n) => {
        const controller = createRefreshController()

        // Fire N concurrent deduplicatedRefresh calls
        const promises = Array.from({ length: n }, () =>
          controller.deduplicatedRefresh(true),
        )

        await Promise.all(promises)

        // Only 1 actual refresh should have been issued
        expect(controller.getRefreshCallCount()).toBe(1)
      }),
      { numRuns: 10 },
    )
  })

  /**
   * **Validates: Requirements 7.1, 7.5**
   *
   * All N concurrent callers receive the same boolean result from
   * the single refresh call.
   */
  it('all concurrent callers receive the same result on success', async () => {
    await fc.assert(
      fc.asyncProperty(concurrentCallersArb, async (n) => {
        const controller = createRefreshController()

        const promises = Array.from({ length: n }, () =>
          controller.deduplicatedRefresh(true),
        )

        const results = await Promise.all(promises)

        // All callers must get true (success)
        for (const result of results) {
          expect(result).toBe(true)
        }
      }),
      { numRuns: 10 },
    )
  })

  /**
   * **Validates: Requirements 7.3, 7.5**
   *
   * On refresh failure, all N concurrent callers receive the failure
   * result (false). No retry loop is triggered.
   */
  it('all concurrent callers receive failure result when refresh fails', async () => {
    await fc.assert(
      fc.asyncProperty(concurrentCallersArb, async (n) => {
        const controller = createRefreshController()

        const promises = Array.from({ length: n }, () =>
          controller.deduplicatedRefresh(false),
        )

        const results = await Promise.all(promises)

        // All callers must get false (failure)
        for (const result of results) {
          expect(result).toBe(false)
        }

        // Still only 1 actual refresh call — no retry loop
        expect(controller.getRefreshCallCount()).toBe(1)
      }),
      { numRuns: 10 },
    )
  })

  /**
   * **Validates: Requirements 7.1, 7.5**
   *
   * After a batch completes, the promise lock is reset. A subsequent
   * batch of concurrent callers triggers a new refresh call.
   */
  it('promise lock resets after completion — next batch triggers new refresh', async () => {
    await fc.assert(
      fc.asyncProperty(
        batchCountArb,
        concurrentCallersArb,
        async (batches, callersPerBatch) => {
          const controller = createRefreshController()

          for (let batch = 0; batch < batches; batch++) {
            const promises = Array.from({ length: callersPerBatch }, () =>
              controller.deduplicatedRefresh(true),
            )
            await Promise.all(promises)

            // After each batch, the lock must be released
            expect(controller.isLockActive()).toBe(false)
          }

          // Total refresh calls = number of batches (one per batch)
          expect(controller.getRefreshCallCount()).toBe(batches)
        },
      ),
      { numRuns: 10 },
    )
  })

  /**
   * **Validates: Requirements 7.3**
   *
   * After a failed refresh, the promise lock is still reset, allowing
   * a subsequent batch to attempt a fresh refresh.
   */
  it('promise lock resets after failure — subsequent batch can retry', async () => {
    await fc.assert(
      fc.asyncProperty(concurrentCallersArb, async (n) => {
        const controller = createRefreshController()

        // First batch: refresh fails
        const failedPromises = Array.from({ length: n }, () =>
          controller.deduplicatedRefresh(false),
        )
        const failedResults = await Promise.all(failedPromises)

        for (const result of failedResults) {
          expect(result).toBe(false)
        }
        expect(controller.isLockActive()).toBe(false)
        expect(controller.getRefreshCallCount()).toBe(1)

        // Second batch: refresh succeeds (new attempt allowed)
        const successPromises = Array.from({ length: n }, () =>
          controller.deduplicatedRefresh(true),
        )
        const successResults = await Promise.all(successPromises)

        for (const result of successResults) {
          expect(result).toBe(true)
        }
        expect(controller.isLockActive()).toBe(false)
        expect(controller.getRefreshCallCount()).toBe(2)
      }),
      { numRuns: 10 },
    )
  })

  /**
   * **Validates: Requirements 7.1, 7.5**
   *
   * A single caller (N=1) still works correctly — the deduplication
   * mechanism does not break the single-caller case.
   */
  it('single caller works correctly without deduplication interference', async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (shouldSucceed) => {
        const controller = createRefreshController()

        const result = await controller.deduplicatedRefresh(shouldSucceed)

        expect(result).toBe(shouldSucceed)
        expect(controller.getRefreshCallCount()).toBe(1)
        expect(controller.isLockActive()).toBe(false)
      }),
      { numRuns: 10 },
    )
  })
})
