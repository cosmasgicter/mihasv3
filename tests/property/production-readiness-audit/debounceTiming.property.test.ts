// @vitest-environment node
/**
 * Property 20: Debounce Timing Compliance
 *
 * Feature: production-readiness-audit
 * **Validates: Requirements 9.5, 12.7**
 *
 * For any search input or realtime event, the debounce delay SHALL be at least
 * 300ms for search and 500ms for cache invalidation.
 *
 * The debounce system:
 * - Search inputs use a minimum 300ms debounce (useDebounce / useDebouncedCallback)
 * - Cache invalidation uses a minimum 500ms debounce between invalidations
 * - Events within the debounce window are suppressed
 * - Only the last event in a burst fires
 * - Events after the debounce window pass through
 * - Multiple rapid events result in a single execution
 *
 * This test models debounce behaviour as pure functions — no React hooks or DOM.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Constants matching production requirements
// ---------------------------------------------------------------------------

const SEARCH_DEBOUNCE_MIN = 300;             // ms — Requirement 9.5
const CACHE_INVALIDATION_DEBOUNCE_MIN = 500; // ms — Requirement 12.7

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DebounceCategory = 'search' | 'cache_invalidation';

interface InputEvent {
  value: string;
  timestamp: number; // ms since epoch
}

interface DebounceState {
  pendingValue: string | null;
  pendingTimestamp: number | null;
  lastFiredAt: number | null;
}

interface FireResult {
  fired: boolean;
  firedValue: string | null;
  firedAt: number | null;
}

// ---------------------------------------------------------------------------
// Minimum delay per category
// ---------------------------------------------------------------------------

function getMinDelay(category: DebounceCategory): number {
  return category === 'search' ? SEARCH_DEBOUNCE_MIN : CACHE_INVALIDATION_DEBOUNCE_MIN;
}

// ---------------------------------------------------------------------------
// Pure debounce model — trailing-edge debounce (mirrors useDebounce behaviour)
//
// When an input arrives it resets the pending timer. The callback only fires
// once `minDelay` ms have elapsed with no new input. This means:
//   - Rapid inputs within the window are suppressed (only the last survives)
//   - The fired value is always the most recent input
//   - The delay between the last input and the fire is exactly minDelay
// ---------------------------------------------------------------------------

/**
 * Given a chronologically-sorted list of input events and a debounce delay,
 * return the list of "fire" results — one per event indicating whether the
 * debounce timer would have fired before the next event arrived.
 *
 * A fire happens when the gap between the current event and the next event
 * (or end-of-stream) is >= minDelay.
 */
function simulateTrailingDebounce(
  events: InputEvent[],
  minDelay: number,
): FireResult[] {
  if (events.length === 0) return [];

  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const results: FireResult[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    // If there's no next event, the pending timer fires after minDelay
    if (!next) {
      results.push({
        fired: true,
        firedValue: current.value,
        firedAt: current.timestamp + minDelay,
      });
    } else {
      const gap = next.timestamp - current.timestamp;
      if (gap >= minDelay) {
        // Timer fires before next event arrives
        results.push({
          fired: true,
          firedValue: current.value,
          firedAt: current.timestamp + minDelay,
        });
      } else {
        // Next event arrives before timer — this event is suppressed
        results.push({
          fired: false,
          firedValue: null,
          firedAt: null,
        });
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Cache invalidation debounce model — leading-edge with cooldown
//
// The first event fires immediately, then subsequent events within the
// cooldown window are suppressed. This mirrors the realtime hook pattern
// where the first change triggers invalidation and further changes within
// 500ms are coalesced.
// ---------------------------------------------------------------------------

interface CacheInvalidationResult {
  processed: boolean;
  invalidatedAt: number | null;
  suppressedCount: number;
}

function simulateCacheInvalidationDebounce(
  events: InputEvent[],
  minDelay: number,
): CacheInvalidationResult[] {
  if (events.length === 0) return [];

  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const results: CacheInvalidationResult[] = [];
  let lastFiredAt: number | null = null;

  for (const event of sorted) {
    if (lastFiredAt === null || (event.timestamp - lastFiredAt) >= minDelay) {
      results.push({ processed: true, invalidatedAt: event.timestamp, suppressedCount: 0 });
      lastFiredAt = event.timestamp;
    } else {
      results.push({ processed: false, invalidatedAt: null, suppressedCount: 1 });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const debounceCategoryArb: fc.Arbitrary<DebounceCategory> = fc.constantFrom('search', 'cache_invalidation');

const searchTermArb = fc.string({ minLength: 1, maxLength: 50 });

const timestampArb = fc.integer({ min: 1000, max: 200000 });

const inputEventArb: fc.Arbitrary<InputEvent> = fc.record({
  value: searchTermArb,
  timestamp: timestampArb,
});

/** Burst of events within a tight window (simulates rapid typing) */
const burstEventsArb = (baseTime: number, count: number, maxGap: number) =>
  fc.array(
    fc.integer({ min: 0, max: maxGap }).map((offset) => ({
      value: `input_${offset}`,
      timestamp: baseTime + offset,
    })),
    { minLength: count, maxLength: count },
  );

/** Generate a batch of 2–10 input events */
const eventBatchArb = fc.array(inputEventArb, { minLength: 2, maxLength: 10 });

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 20: Debounce Timing Compliance', () => {
  describe('search debounce (300ms minimum)', () => {
    it('search debounce delay is at least 300ms', () => {
      fc.assert(
        fc.property(inputEventArb, (event) => {
          const results = simulateTrailingDebounce([event], SEARCH_DEBOUNCE_MIN);
          expect(results).toHaveLength(1);
          expect(results[0].fired).toBe(true);
          // Fire time must be at least 300ms after the input
          expect(results[0].firedAt! - event.timestamp).toBeGreaterThanOrEqual(SEARCH_DEBOUNCE_MIN);
        }),
        { numRuns: 10 },
      );
    });

    it('events within 300ms of each other suppress earlier events', () => {
      fc.assert(
        fc.property(
          timestampArb,
          fc.integer({ min: 1, max: SEARCH_DEBOUNCE_MIN - 1 }),
          searchTermArb,
          searchTermArb,
          (baseTime, gap, val1, val2) => {
            const events: InputEvent[] = [
              { value: val1, timestamp: baseTime },
              { value: val2, timestamp: baseTime + gap },
            ];
            const results = simulateTrailingDebounce(events, SEARCH_DEBOUNCE_MIN);

            // First event should be suppressed (gap < 300ms)
            expect(results[0].fired).toBe(false);
            // Second event (last in burst) should fire
            expect(results[1].fired).toBe(true);
            expect(results[1].firedValue).toBe(val2);
          },
        ),
        { numRuns: 10 },
      );
    });

    it('only the last event in a rapid burst fires', () => {
      fc.assert(
        fc.property(
          timestampArb,
          burstEventsArb(0, 5, SEARCH_DEBOUNCE_MIN - 1),
          (baseTime, burst) => {
            // Shift all events to start at baseTime
            const events = burst.map((e, i) => ({
              ...e,
              timestamp: baseTime + i * 50, // 50ms apart — well within 300ms window
            }));

            const results = simulateTrailingDebounce(events, SEARCH_DEBOUNCE_MIN);
            const firedResults = results.filter((r) => r.fired);

            // Only the last event should fire
            expect(firedResults).toHaveLength(1);
            expect(firedResults[0].firedValue).toBe(events[events.length - 1].value);
          },
        ),
        { numRuns: 10 },
      );
    });

    it('events after the debounce window pass through independently', () => {
      fc.assert(
        fc.property(
          timestampArb,
          fc.integer({ min: SEARCH_DEBOUNCE_MIN, max: 5000 }),
          searchTermArb,
          searchTermArb,
          (baseTime, gap, val1, val2) => {
            const events: InputEvent[] = [
              { value: val1, timestamp: baseTime },
              { value: val2, timestamp: baseTime + gap },
            ];
            const results = simulateTrailingDebounce(events, SEARCH_DEBOUNCE_MIN);

            // Both events should fire (gap >= 300ms)
            expect(results[0].fired).toBe(true);
            expect(results[0].firedValue).toBe(val1);
            expect(results[1].fired).toBe(true);
            expect(results[1].firedValue).toBe(val2);
          },
        ),
        { numRuns: 10 },
      );
    });

    it('fired value is always the exact input value (no mutation)', () => {
      fc.assert(
        fc.property(eventBatchArb, (events) => {
          const results = simulateTrailingDebounce(events, SEARCH_DEBOUNCE_MIN);
          const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

          for (let i = 0; i < results.length; i++) {
            if (results[i].fired) {
              expect(results[i].firedValue).toBe(sorted[i].value);
            }
          }
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('cache invalidation debounce (500ms minimum)', () => {
    it('cache invalidation debounce delay is at least 500ms', () => {
      fc.assert(
        fc.property(
          timestampArb,
          fc.integer({ min: 1, max: CACHE_INVALIDATION_DEBOUNCE_MIN - 1 }),
          (baseTime, gap) => {
            const events: InputEvent[] = [
              { value: 'change1', timestamp: baseTime },
              { value: 'change2', timestamp: baseTime + gap },
            ];
            const results = simulateCacheInvalidationDebounce(events, CACHE_INVALIDATION_DEBOUNCE_MIN);

            // First event processes, second is suppressed (gap < 500ms)
            expect(results[0].processed).toBe(true);
            expect(results[1].processed).toBe(false);
          },
        ),
        { numRuns: 10 },
      );
    });

    it('the first cache invalidation event always fires immediately', () => {
      fc.assert(
        fc.property(inputEventArb, (event) => {
          const results = simulateCacheInvalidationDebounce([event], CACHE_INVALIDATION_DEBOUNCE_MIN);
          expect(results).toHaveLength(1);
          expect(results[0].processed).toBe(true);
          expect(results[0].invalidatedAt).toBe(event.timestamp);
        }),
        { numRuns: 10 },
      );
    });

    it('events at or after 500ms from the last invalidation are processed', () => {
      fc.assert(
        fc.property(
          timestampArb,
          fc.integer({ min: CACHE_INVALIDATION_DEBOUNCE_MIN, max: 5000 }),
          (baseTime, gap) => {
            const events: InputEvent[] = [
              { value: 'change1', timestamp: baseTime },
              { value: 'change2', timestamp: baseTime + gap },
            ];
            const results = simulateCacheInvalidationDebounce(events, CACHE_INVALIDATION_DEBOUNCE_MIN);

            // Both should process (gap >= 500ms)
            expect(results[0].processed).toBe(true);
            expect(results[1].processed).toBe(true);
          },
        ),
        { numRuns: 10 },
      );
    });

    it('multiple rapid cache events result in a single invalidation', () => {
      fc.assert(
        fc.property(timestampArb, (baseTime) => {
          // 5 events all within 100ms of each other
          const events: InputEvent[] = Array.from({ length: 5 }, (_, i) => ({
            value: `change_${i}`,
            timestamp: baseTime + i * 50,
          }));

          const results = simulateCacheInvalidationDebounce(events, CACHE_INVALIDATION_DEBOUNCE_MIN);
          const processedCount = results.filter((r) => r.processed).length;

          // Only the first should process; rest are within 500ms window
          expect(processedCount).toBe(1);
          expect(results[0].processed).toBe(true);
        }),
        { numRuns: 10 },
      );
    });

    it('consecutive processed cache invalidations are at least 500ms apart', () => {
      fc.assert(
        fc.property(eventBatchArb, (events) => {
          const results = simulateCacheInvalidationDebounce(events, CACHE_INVALIDATION_DEBOUNCE_MIN);
          const processedTimestamps = results
            .filter((r) => r.processed)
            .map((r) => r.invalidatedAt!);

          for (let i = 1; i < processedTimestamps.length; i++) {
            expect(processedTimestamps[i] - processedTimestamps[i - 1])
              .toBeGreaterThanOrEqual(CACHE_INVALIDATION_DEBOUNCE_MIN);
          }
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('cross-category delay compliance', () => {
    it('search debounce is always >= 300ms regardless of input', () => {
      fc.assert(
        fc.property(eventBatchArb, (events) => {
          const delay = getMinDelay('search');
          expect(delay).toBeGreaterThanOrEqual(SEARCH_DEBOUNCE_MIN);

          const results = simulateTrailingDebounce(events, delay);
          const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

          for (let i = 0; i < results.length; i++) {
            if (results[i].fired) {
              // Fire time is always at least minDelay after the input
              expect(results[i].firedAt! - sorted[i].timestamp).toBeGreaterThanOrEqual(delay);
            }
          }
        }),
        { numRuns: 10 },
      );
    });

    it('cache invalidation debounce is always >= 500ms regardless of event pattern', () => {
      fc.assert(
        fc.property(eventBatchArb, (events) => {
          const delay = getMinDelay('cache_invalidation');
          expect(delay).toBeGreaterThanOrEqual(CACHE_INVALIDATION_DEBOUNCE_MIN);

          const results = simulateCacheInvalidationDebounce(events, delay);
          const processedTimestamps = results
            .filter((r) => r.processed)
            .map((r) => r.invalidatedAt!);

          for (let i = 1; i < processedTimestamps.length; i++) {
            expect(processedTimestamps[i] - processedTimestamps[i - 1])
              .toBeGreaterThanOrEqual(delay);
          }
        }),
        { numRuns: 10 },
      );
    });

    it('cache invalidation minimum delay (500ms) is strictly greater than search minimum (300ms)', () => {
      fc.assert(
        fc.property(debounceCategoryArb, (category) => {
          const delay = getMinDelay(category);
          if (category === 'cache_invalidation') {
            expect(delay).toBeGreaterThan(SEARCH_DEBOUNCE_MIN);
          } else {
            expect(delay).toBe(SEARCH_DEBOUNCE_MIN);
          }
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('suppressed events produce no side effects', () => {
    it('suppressed search events have null fired values', () => {
      fc.assert(
        fc.property(eventBatchArb, (events) => {
          const results = simulateTrailingDebounce(events, SEARCH_DEBOUNCE_MIN);

          for (const result of results) {
            if (!result.fired) {
              expect(result.firedValue).toBeNull();
              expect(result.firedAt).toBeNull();
            }
          }
        }),
        { numRuns: 10 },
      );
    });

    it('suppressed cache invalidation events have null invalidation timestamps', () => {
      fc.assert(
        fc.property(eventBatchArb, (events) => {
          const results = simulateCacheInvalidationDebounce(events, CACHE_INVALIDATION_DEBOUNCE_MIN);

          for (const result of results) {
            if (!result.processed) {
              expect(result.invalidatedAt).toBeNull();
            }
          }
        }),
        { numRuns: 10 },
      );
    });

    it('total fired + suppressed always equals total input events', () => {
      fc.assert(
        fc.property(eventBatchArb, debounceCategoryArb, (events, category) => {
          if (category === 'search') {
            const results = simulateTrailingDebounce(events, getMinDelay(category));
            expect(results).toHaveLength(events.length);
          } else {
            const results = simulateCacheInvalidationDebounce(events, getMinDelay(category));
            expect(results).toHaveLength(events.length);
          }
        }),
        { numRuns: 10 },
      );
    });
  });
});
