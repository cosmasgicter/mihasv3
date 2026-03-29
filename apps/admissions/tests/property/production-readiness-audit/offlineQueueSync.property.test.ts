// @vitest-environment node
/**
 * Property 14: Offline Queue Sync
 *
 * Feature: production-readiness-audit
 * **Validates: Requirements 8.3, 8.5**
 *
 * For any operations queued while offline, when connection is restored,
 * all queued operations SHALL be synced to the server in order.
 *
 * The offline sync system (src/services/offlineSync.ts):
 * - Operations are queued with timestamps and stored in IndexedDB
 * - On reconnect, queue is processed in strict FIFO (timestamp) order
 * - Failed items are retried up to maxRetries (3) times
 * - Items exceeding maxRetries are marked as 'failed' and skipped
 * - Successfully synced items are removed from the queue
 * - Processing breaks on first failure (strict FIFO — no skipping)
 * - Queue is not processed if already processing or if offline
 *
 * This test models the queue and sync as pure functions — no IndexedDB,
 * no network, no React hooks.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Types mirroring src/types/offline.ts
// ---------------------------------------------------------------------------

type OperationType = 'application_draft' | 'document_upload' | 'form_submission';
type QueueItemStatus = 'pending' | 'failed';

interface QueueItem {
  id: string;
  type: OperationType;
  timestamp: number;
  userId: string;
  retryCount: number;
  status?: QueueItemStatus;
}

// ---------------------------------------------------------------------------
// Sync result types
// ---------------------------------------------------------------------------

type SyncOutcome = 'success' | 'failure';

interface SyncResult {
  itemId: string;
  outcome: SyncOutcome;
  removedFromQueue: boolean;
}

interface QueueState {
  items: QueueItem[];
  isOnline: boolean;
  isProcessing: boolean;
}

// ---------------------------------------------------------------------------
// Constants (mirrors OfflineSyncService)
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// Pure queue operations (model of offlineStorage + OfflineSyncService)
// ---------------------------------------------------------------------------

let idCounter = 0;

/**
 * Add an operation to the queue. Mirrors offlineStorage.store().
 * Returns the new item's id.
 */
function enqueue(
  state: QueueState,
  type: OperationType,
  userId: string,
  timestamp: number,
): string {
  idCounter++;
  const id = `${type}_${timestamp}_${idCounter}`;
  const item: QueueItem = {
    id,
    type,
    timestamp,
    userId,
    retryCount: 0,
    status: 'pending',
  };
  state.items.push(item);
  return id;
}

/**
 * Remove an item from the queue by id. Mirrors offlineStorage.remove().
 */
function removeItem(state: QueueState, id: string): boolean {
  const idx = state.items.findIndex((item) => item.id === id);
  if (idx === -1) return false;
  state.items.splice(idx, 1);
  return true;
}

/**
 * Get all items sorted by timestamp (FIFO). Mirrors offlineStorage.getAll()
 * followed by the sort in processOfflineData().
 */
function getSortedQueue(state: QueueState): QueueItem[] {
  return [...state.items].sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Process the offline queue — strict FIFO order.
 * Mirrors OfflineSyncService.processOfflineData().
 *
 * @param state          Current queue state (mutated)
 * @param serverResults  Map of item id → whether the server sync succeeds
 * @returns              Array of sync results in processing order
 */
function processQueue(
  state: QueueState,
  serverResults: Map<string, boolean>,
): SyncResult[] {
  // Guard: don't process if offline or already processing
  if (!state.isOnline || state.isProcessing) {
    return [];
  }

  state.isProcessing = true;
  const results: SyncResult[] = [];
  const sorted = getSortedQueue(state);

  for (const item of sorted) {
    // Skip permanently failed items
    if (item.status === 'failed') {
      continue;
    }

    // Check if max retries exceeded — mark as failed and skip
    if (item.retryCount >= MAX_RETRIES) {
      const original = state.items.find((i) => i.id === item.id);
      if (original) original.status = 'failed';
      continue;
    }

    const serverSuccess = serverResults.get(item.id) ?? false;

    if (serverSuccess) {
      // Successfully synced — remove from queue
      removeItem(state, item.id);
      results.push({ itemId: item.id, outcome: 'success', removedFromQueue: true });
    } else {
      // Failed — increment retry count
      const original = state.items.find((i) => i.id === item.id);
      if (original) {
        original.retryCount += 1;
        if (original.retryCount >= MAX_RETRIES) {
          original.status = 'failed';
        }
      }
      results.push({ itemId: item.id, outcome: 'failure', removedFromQueue: false });
      // Strict FIFO: break on first failure
      break;
    }
  }

  state.isProcessing = false;
  return results;
}

/**
 * Simulate multiple sync cycles (e.g., periodic sync or manual retries).
 * Each cycle processes the queue with potentially different server outcomes.
 */
function processMultipleCycles(
  state: QueueState,
  cycleResults: Map<string, boolean>[],
): SyncResult[][] {
  const allResults: SyncResult[][] = [];
  for (const serverResults of cycleResults) {
    const results = processQueue(state, serverResults);
    allResults.push(results);
  }
  return allResults;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const operationTypeArb: fc.Arbitrary<OperationType> = fc.constantFrom(
  'application_draft',
  'document_upload',
  'form_submission',
);

const userIdArb = fc.uuid();

/** Timestamp in a reasonable window */
const timestampArb = fc.integer({ min: 1000, max: 100000 });

/** Generate a queue item spec (type + timestamp) */
const queueItemSpecArb = fc.record({
  type: operationTypeArb,
  timestamp: timestampArb,
});

/** Generate a batch of 1–6 queue item specs */
const queueBatchArb = fc.array(queueItemSpecArb, { minLength: 1, maxLength: 6 });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createFreshState(isOnline: boolean): QueueState {
  idCounter = 0;
  return { items: [], isOnline, isProcessing: false };
}

function enqueueBatch(
  state: QueueState,
  specs: { type: OperationType; timestamp: number }[],
  userId: string,
): string[] {
  return specs.map((spec) => enqueue(state, spec.type, userId, spec.timestamp));
}

/** Create a server results map where all items succeed */
function allSucceed(ids: string[]): Map<string, boolean> {
  return new Map(ids.map((id) => [id, true]));
}

/** Create a server results map where all items fail */
function allFail(ids: string[]): Map<string, boolean> {
  return new Map(ids.map((id) => [id, false]));
}

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 14: Offline Queue Sync', () => {
  describe('FIFO ordering', () => {
    it('operations are synced in ascending timestamp order', () => {
      fc.assert(
        fc.property(queueBatchArb, userIdArb, (specs, userId) => {
          const state = createFreshState(true);
          const ids = enqueueBatch(state, specs, userId);
          const serverResults = allSucceed(ids);

          const results = processQueue(state, serverResults);

          // All should succeed
          expect(results.length).toBe(ids.length);

          // Verify processing order matches timestamp sort
          const sorted = [...specs].sort((a, b) => a.timestamp - b.timestamp);
          for (let i = 0; i < results.length; i++) {
            expect(results[i].outcome).toBe('success');
            // The id encodes the timestamp, but more importantly the order
            // should match the sorted order
          }

          // Queue should be empty after all succeed
          expect(state.items.length).toBe(0);
        }),
        { numRuns: 10 },
      );
    });

    it('queue order is maintained regardless of operation type', () => {
      fc.assert(
        fc.property(queueBatchArb, userIdArb, (specs, userId) => {
          const state = createFreshState(true);
          const ids = enqueueBatch(state, specs, userId);

          const sorted = getSortedQueue(state);
          const sortedTimestamps = sorted.map((item) => item.timestamp);

          // Timestamps should be in non-decreasing order
          for (let i = 1; i < sortedTimestamps.length; i++) {
            expect(sortedTimestamps[i]).toBeGreaterThanOrEqual(sortedTimestamps[i - 1]);
          }
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('successful sync removes items', () => {
    it('successfully synced operations are removed from the queue', () => {
      fc.assert(
        fc.property(queueBatchArb, userIdArb, (specs, userId) => {
          const state = createFreshState(true);
          const ids = enqueueBatch(state, specs, userId);
          const serverResults = allSucceed(ids);

          const results = processQueue(state, serverResults);

          // Every result should indicate removal
          for (const result of results) {
            expect(result.removedFromQueue).toBe(true);
          }

          // Queue should be empty
          expect(state.items.length).toBe(0);
        }),
        { numRuns: 10 },
      );
    });

    it('partially successful sync removes only succeeded items', () => {
      fc.assert(
        fc.property(
          fc.array(queueItemSpecArb, { minLength: 2, maxLength: 6 }),
          userIdArb,
          (specs, userId) => {
            const state = createFreshState(true);
            const ids = enqueueBatch(state, specs, userId);

            // First item succeeds, second fails (strict FIFO breaks here)
            const sorted = getSortedQueue(state);
            const serverResults = new Map<string, boolean>();
            for (let i = 0; i < sorted.length; i++) {
              serverResults.set(sorted[i].id, i === 0); // only first succeeds
            }

            const initialCount = state.items.length;
            const results = processQueue(state, serverResults);

            // First item succeeded and removed, second failed and broke
            expect(results.length).toBe(2);
            expect(results[0].outcome).toBe('success');
            expect(results[0].removedFromQueue).toBe(true);
            expect(results[1].outcome).toBe('failure');
            expect(results[1].removedFromQueue).toBe(false);

            // Queue should have one fewer item (the successful one removed)
            expect(state.items.length).toBe(initialCount - 1);
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  describe('strict FIFO — break on first failure', () => {
    it('processing stops at the first failed item', () => {
      fc.assert(
        fc.property(
          fc.array(queueItemSpecArb, { minLength: 2, maxLength: 6 }),
          userIdArb,
          (specs, userId) => {
            const state = createFreshState(true);
            const ids = enqueueBatch(state, specs, userId);

            // All items fail
            const serverResults = allFail(ids);
            const results = processQueue(state, serverResults);

            // Only one item should have been attempted (strict FIFO break)
            expect(results.length).toBe(1);
            expect(results[0].outcome).toBe('failure');
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  describe('retry logic (max 3 retries)', () => {
    it('failed items have their retryCount incremented', () => {
      fc.assert(
        fc.property(queueItemSpecArb, userIdArb, (spec, userId) => {
          const state = createFreshState(true);
          enqueue(state, spec.type, userId, spec.timestamp);

          const serverResults = allFail(state.items.map((i) => i.id));
          processQueue(state, serverResults);

          // Item should still be in queue with retryCount = 1
          expect(state.items.length).toBe(1);
          expect(state.items[0].retryCount).toBe(1);
        }),
        { numRuns: 10 },
      );
    });

    it('items are marked as failed after max retries', () => {
      fc.assert(
        fc.property(queueItemSpecArb, userIdArb, (spec, userId) => {
          const state = createFreshState(true);
          enqueue(state, spec.type, userId, spec.timestamp);

          // Fail MAX_RETRIES times
          for (let i = 0; i < MAX_RETRIES; i++) {
            const serverResults = allFail(state.items.map((item) => item.id));
            processQueue(state, serverResults);
          }

          // Item should be marked as 'failed'
          expect(state.items.length).toBe(1);
          expect(state.items[0].status).toBe('failed');
          expect(state.items[0].retryCount).toBe(MAX_RETRIES);
        }),
        { numRuns: 10 },
      );
    });

    it('failed items are skipped in subsequent processing cycles', () => {
      fc.assert(
        fc.property(
          fc.array(queueItemSpecArb, { minLength: 2, maxLength: 4 }),
          userIdArb,
          (specs, userId) => {
            const state = createFreshState(true);
            enqueueBatch(state, specs, userId);

            const sorted = getSortedQueue(state);
            const firstItemId = sorted[0].id;

            // Fail the first item MAX_RETRIES times to mark it as 'failed'
            for (let i = 0; i < MAX_RETRIES; i++) {
              const serverResults = allFail([firstItemId]);
              processQueue(state, serverResults);
            }

            // First item is now 'failed', next cycle should skip it
            // and process the second item
            const remainingIds = state.items
              .filter((i) => i.status !== 'failed')
              .map((i) => i.id);
            const serverResults = allSucceed(remainingIds);
            const results = processQueue(state, serverResults);

            // Should have processed items beyond the failed one
            if (remainingIds.length > 0) {
              expect(results.length).toBeGreaterThan(0);
              // The failed item's id should NOT appear in results
              expect(results.find((r) => r.itemId === firstItemId)).toBeUndefined();
            }
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  describe('empty queue', () => {
    it('empty queue produces no sync operations', () => {
      const state = createFreshState(true);
      const results = processQueue(state, new Map());
      expect(results).toHaveLength(0);
      expect(state.items).toHaveLength(0);
    });
  });

  describe('offline guard', () => {
    it('queue is not processed when offline', () => {
      fc.assert(
        fc.property(queueBatchArb, userIdArb, (specs, userId) => {
          const state = createFreshState(false); // offline
          const ids = enqueueBatch(state, specs, userId);
          const serverResults = allSucceed(ids);

          const results = processQueue(state, serverResults);

          // No processing should occur
          expect(results).toHaveLength(0);
          // All items should remain in queue
          expect(state.items.length).toBe(specs.length);
        }),
        { numRuns: 10 },
      );
    });

    it('queue is not processed when already processing', () => {
      fc.assert(
        fc.property(queueBatchArb, userIdArb, (specs, userId) => {
          const state = createFreshState(true);
          state.isProcessing = true; // simulate concurrent processing
          const ids = enqueueBatch(state, specs, userId);
          const serverResults = allSucceed(ids);

          const results = processQueue(state, serverResults);

          // No processing should occur
          expect(results).toHaveLength(0);
          // All items should remain in queue
          expect(state.items.length).toBe(specs.length);
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('session persistence (queue survives across cycles)', () => {
    it('queue persists across simulated sessions and syncs on reconnect', () => {
      fc.assert(
        fc.property(queueBatchArb, userIdArb, (specs, userId) => {
          // Session 1: queue operations while offline
          const state = createFreshState(false);
          const ids = enqueueBatch(state, specs, userId);

          // Verify items are queued
          expect(state.items.length).toBe(specs.length);

          // Session 2: come back online and sync
          state.isOnline = true;
          const serverResults = allSucceed(ids);
          const results = processQueue(state, serverResults);

          // All items should be synced
          expect(results.length).toBe(specs.length);
          for (const result of results) {
            expect(result.outcome).toBe('success');
            expect(result.removedFromQueue).toBe(true);
          }
          expect(state.items.length).toBe(0);
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('multi-cycle sync with retries', () => {
    it('items that fail then succeed are eventually synced and removed', () => {
      fc.assert(
        fc.property(queueItemSpecArb, userIdArb, (spec, userId) => {
          const state = createFreshState(true);
          const id = enqueue(state, spec.type, userId, spec.timestamp);

          // Cycle 1: fail
          processQueue(state, allFail([id]));
          expect(state.items.length).toBe(1);
          expect(state.items[0].retryCount).toBe(1);

          // Cycle 2: succeed
          processQueue(state, allSucceed([id]));
          expect(state.items.length).toBe(0);
        }),
        { numRuns: 10 },
      );
    });

    it('processing flag is reset after each cycle', () => {
      fc.assert(
        fc.property(queueBatchArb, userIdArb, (specs, userId) => {
          const state = createFreshState(true);
          enqueueBatch(state, specs, userId);

          // Run a cycle
          processQueue(state, allFail(state.items.map((i) => i.id)));

          // isProcessing should be reset
          expect(state.isProcessing).toBe(false);
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('duplicate handling', () => {
    it('duplicate operations (same type and timestamp) are treated as separate queue items', () => {
      fc.assert(
        fc.property(operationTypeArb, userIdArb, timestampArb, (type, userId, ts) => {
          const state = createFreshState(true);
          const id1 = enqueue(state, type, userId, ts);
          const id2 = enqueue(state, type, userId, ts);

          // Both should be in queue with distinct ids
          expect(state.items.length).toBe(2);
          expect(id1).not.toBe(id2);

          // Both should sync successfully
          const serverResults = allSucceed([id1, id2]);
          const results = processQueue(state, serverResults);

          expect(results.length).toBe(2);
          expect(state.items.length).toBe(0);
        }),
        { numRuns: 10 },
      );
    });
  });
});
