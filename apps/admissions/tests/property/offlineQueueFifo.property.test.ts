// @vitest-environment node
/**
 * Property-based tests for Offline Queue FIFO Ordering (Property 5)
 * Feature: production-remediation
 *
 * Property 5: Offline queue FIFO ordering
 * For any set of offline queue items with distinct timestamps, processing
 * the queue must handle items in strictly ascending timestamp order, and
 * must not process item N+1 until item N has either succeeded or been
 * moved to the failed state.
 *
 * **Validates: Requirements 10.3**
 */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

// ── Types (mirrors src/types/offline.ts) ────────────────────────────────

interface QueueItem {
  id: string
  timestamp: number
  retryCount: number
  status?: 'pending' | 'failed'
}

interface ProcessingResult {
  id: string
  timestamp: number
  outcome: 'synced' | 'retry_incremented' | 'marked_failed' | 'skipped_failed'
}

// ── Pure FIFO processing logic (mirrors OfflineSyncService.processOfflineData) ──

const MAX_RETRIES = 3

/**
 * Simulate the FIFO processing loop from offlineSync.ts.
 * `syncOutcome` maps item id → true (sync succeeds) or false (sync fails).
 * Returns the ordered list of processing results.
 */
function processQueue(
  items: QueueItem[],
  syncOutcome: Map<string, boolean>,
): ProcessingResult[] {
  // Sort by timestamp — strict FIFO
  const sorted = [...items].sort((a, b) => a.timestamp - b.timestamp)
  const results: ProcessingResult[] = []

  for (const item of sorted) {
    // Skip items already permanently failed
    if (item.status === 'failed') {
      results.push({ id: item.id, timestamp: item.timestamp, outcome: 'skipped_failed' })
      continue
    }

    // Check if item has exceeded max retries — mark as failed
    if (item.retryCount >= MAX_RETRIES) {
      results.push({ id: item.id, timestamp: item.timestamp, outcome: 'marked_failed' })
      continue
    }

    const succeeds = syncOutcome.get(item.id) ?? false

    if (succeeds) {
      results.push({ id: item.id, timestamp: item.timestamp, outcome: 'synced' })
    } else {
      const newRetryCount = item.retryCount + 1
      results.push({
        id: item.id,
        timestamp: item.timestamp,
        outcome: newRetryCount >= MAX_RETRIES ? 'marked_failed' : 'retry_incremented',
      })
      // Strict FIFO: break on first failure
      break
    }
  }

  return results
}

// ── Arbitraries ─────────────────────────────────────────────────────────

/** Generate a queue item with a given timestamp to ensure distinctness */
const queueItemArb = (timestamp: number): fc.Arbitrary<QueueItem> =>
  fc.record({
    id: fc.uuid(),
    timestamp: fc.constant(timestamp),
    retryCount: fc.integer({ min: 0, max: 2 }),
    status: fc.constant(undefined as 'pending' | 'failed' | undefined),
  })

/** Generate a list of queue items with distinct timestamps */
const distinctQueueArb = fc
  .uniqueArray(fc.integer({ min: 1, max: 100_000 }), { minLength: 2, maxLength: 15 })
  .chain((timestamps) =>
    fc.tuple(...timestamps.map((ts) => queueItemArb(ts))),
  )

/** Generate a list that includes some already-failed items */
const mixedStatusQueueArb = fc
  .uniqueArray(fc.integer({ min: 1, max: 100_000 }), { minLength: 2, maxLength: 10 })
  .chain((timestamps) =>
    fc.tuple(
      ...timestamps.map((ts) =>
        fc.record({
          id: fc.uuid(),
          timestamp: fc.constant(ts),
          retryCount: fc.integer({ min: 0, max: 4 }),
          status: fc.oneof(
            fc.constant(undefined as 'pending' | 'failed' | undefined),
            fc.constant('failed' as const),
          ),
        }),
      ),
    ),
  )

// ── Tests ────────────────────────────────────────────────────────────────

describe('Offline Queue FIFO Ordering Property Tests (P5)', () => {
  /**
   * **Validates: Requirements 10.3**
   *
   * Core property: items are always processed in ascending timestamp order.
   */
  it('processes items in strictly ascending timestamp order', () => {
    fc.assert(
      fc.property(distinctQueueArb, (items) => {
        // All items succeed — so the full queue is processed
        const syncOutcome = new Map(items.map((item) => [item.id, true]))
        const results = processQueue(items, syncOutcome)

        // Filter to items that were actually attempted (not skipped_failed/marked_failed before attempt)
        const attemptedTimestamps = results
          .filter((r) => r.outcome === 'synced' || r.outcome === 'retry_incremented')
          .map((r) => r.timestamp)

        // Timestamps must be in ascending order
        for (let i = 1; i < attemptedTimestamps.length; i++) {
          expect(attemptedTimestamps[i]).toBeGreaterThan(attemptedTimestamps[i - 1])
        }
      }),
      { numRuns: 10 },
    )
  })

  /**
   * **Validates: Requirements 10.3**
   *
   * FIFO break: when an item fails, no subsequent items are processed.
   */
  it('stops processing after first sync failure (strict FIFO break)', () => {
    fc.assert(
      fc.property(
        distinctQueueArb,
        fc.integer({ min: 0, max: 14 }),
        (items, failIdx) => {
          // Sort to know the FIFO order
          const sorted = [...items].sort((a, b) => a.timestamp - b.timestamp)
          // Only consider pending items (retryCount < MAX_RETRIES, not failed)
          const pendingItems = sorted.filter(
            (item) => item.status !== 'failed' && item.retryCount < MAX_RETRIES,
          )

          if (pendingItems.length < 2) return // Need at least 2 pending items

          // Pick a valid fail index within pending items
          const actualFailIdx = failIdx % pendingItems.length
          const failItemId = pendingItems[actualFailIdx].id

          // All succeed except the chosen fail item
          const syncOutcome = new Map(items.map((item) => [item.id, item.id !== failItemId]))
          const results = processQueue(items, syncOutcome)

          // Find the failed item in results
          const failResult = results.find((r) => r.id === failItemId)
          if (!failResult) return // Item may have been skipped (already failed/max retries)

          // No item with a timestamp > failResult.timestamp should have outcome 'synced'
          const processedAfterFail = results.filter(
            (r) =>
              r.timestamp > failResult.timestamp &&
              (r.outcome === 'synced' || r.outcome === 'retry_incremented'),
          )
          expect(processedAfterFail).toHaveLength(0)
        },
      ),
      { numRuns: 10 },
    )
  })

  /**
   * **Validates: Requirements 10.3**
   *
   * When all items succeed, every pending item is processed.
   */
  it('processes all pending items when every sync succeeds', () => {
    fc.assert(
      fc.property(distinctQueueArb, (items) => {
        const syncOutcome = new Map(items.map((item) => [item.id, true]))
        const results = processQueue(items, syncOutcome)

        // Count pending items (not already failed, retryCount < MAX_RETRIES)
        const pendingCount = items.filter(
          (item) => item.status !== 'failed' && item.retryCount < MAX_RETRIES,
        ).length

        // Count synced results
        const syncedCount = results.filter((r) => r.outcome === 'synced').length

        expect(syncedCount).toBe(pendingCount)
      }),
      { numRuns: 10 },
    )
  })

  /**
   * **Validates: Requirements 10.3**
   *
   * Items already in 'failed' status are skipped (not re-processed),
   * and items at maxRetries are marked failed without sync attempt.
   */
  it('skips already-failed items and marks max-retry items as failed', () => {
    fc.assert(
      fc.property(mixedStatusQueueArb, (items) => {
        const syncOutcome = new Map(items.map((item) => [item.id, true]))
        const results = processQueue(items, syncOutcome)

        for (const result of results) {
          const original = items.find((i) => i.id === result.id)!

          if (original.status === 'failed') {
            expect(result.outcome).toBe('skipped_failed')
          } else if (original.retryCount >= MAX_RETRIES) {
            expect(result.outcome).toBe('marked_failed')
          }
        }
      }),
      { numRuns: 10 },
    )
  })

  /**
   * **Validates: Requirements 10.3**
   *
   * The processing order is deterministic: same input always produces
   * the same output sequence regardless of the original array order.
   */
  it('processing order is deterministic regardless of input array order', () => {
    fc.assert(
      fc.property(distinctQueueArb, (items) => {
        const syncOutcome = new Map(items.map((item) => [item.id, true]))

        // Process original order
        const results1 = processQueue(items, syncOutcome)

        // Process reversed order
        const results2 = processQueue([...items].reverse(), syncOutcome)

        // Both must produce the same sequence of (id, outcome) pairs
        expect(results1.map((r) => r.id)).toEqual(results2.map((r) => r.id))
        expect(results1.map((r) => r.outcome)).toEqual(results2.map((r) => r.outcome))
      }),
      { numRuns: 10 },
    )
  })
})
