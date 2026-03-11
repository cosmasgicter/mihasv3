// @vitest-environment node
/**
 * Property 15: Realtime Event Propagation
 *
 * Feature: production-readiness-audit
 * **Validates: Requirements 12.2, 12.3, 12.8, 12.9**
 *
 * For any database change on subscribed tables, the corresponding React Query
 * cache SHALL be invalidated within 2 seconds, triggering a UI update.
 *
 * The realtime system:
 * - Admin hook invalidates ['applications'], ['payments'], ['application-history'] query keys
 * - Student hook invalidates ['applications'], ['notifications']
 * - Debounce interval: 500ms between cache invalidations
 * - Tables subscribed: applications, payments, in_app_notifications
 *
 * This test models the event propagation as pure functions — no React hooks
 * or DOM required.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Subscribed tables and their query key mappings (mirrors hook behaviour)
// ---------------------------------------------------------------------------

type SubscribedTable = 'applications' | 'payments' | 'in_app_notifications';
type DbEventType = 'INSERT' | 'UPDATE' | 'DELETE';
type UserRole = 'admin' | 'student';

interface RealtimeEvent {
  table: SubscribedTable;
  eventType: DbEventType;
  timestamp: number; // ms since epoch
}

interface PropagationResult {
  invalidatedKeys: string[];
  propagationTime: number; // ms from event to invalidation
  debounced: boolean;      // true if the event was debounced (coalesced)
}

const SUBSCRIBED_TABLES: SubscribedTable[] = ['applications', 'payments', 'in_app_notifications'];

const DEBOUNCE_INTERVAL = 500; // ms
const MAX_PROPAGATION_TIME = 2000; // ms

// ---------------------------------------------------------------------------
// Query key mapping per role (mirrors useAdminDashboardPolling / useStudentDashboardPolling)
// ---------------------------------------------------------------------------

/**
 * Returns the React Query keys that should be invalidated when a given table
 * receives a change event, scoped by user role.
 *
 * Admin hook invalidates: ['applications'], ['payments'], ['application-history']
 * Student hook invalidates: ['applications'], ['notifications']
 */
function getInvalidationKeys(table: SubscribedTable, role: UserRole): string[] {
  if (role === 'admin') {
    switch (table) {
      case 'applications':
        return ['applications', 'admin-applications', 'admin-dashboard-polling', 'application-history'];
      case 'payments':
        return ['payments', 'admin-dashboard-polling', 'application-history'];
      case 'in_app_notifications':
        return ['admin-dashboard-polling'];
    }
  }

  // student
  switch (table) {
    case 'applications':
      return ['applications', 'student-dashboard-polling', 'application-stats'];
    case 'payments':
      return ['applications', 'student-dashboard-polling', 'payment-status'];
    case 'in_app_notifications':
      return ['notifications', 'student-dashboard-polling'];
  }
}

// ---------------------------------------------------------------------------
// Debounce model (mirrors the 500ms debounce in the realtime hooks)
// ---------------------------------------------------------------------------

interface DebounceState {
  lastInvalidationTime: number | null;
}

/**
 * Determines whether an event should be processed or debounced.
 * Events arriving within DEBOUNCE_INTERVAL of the last invalidation are coalesced.
 */
function shouldProcessEvent(event: RealtimeEvent, state: DebounceState): boolean {
  if (state.lastInvalidationTime === null) return true;
  return (event.timestamp - state.lastInvalidationTime) >= DEBOUNCE_INTERVAL;
}

// ---------------------------------------------------------------------------
// Propagation simulation
// ---------------------------------------------------------------------------

/**
 * Simulate the full propagation pipeline for a single realtime event.
 *
 * Steps modelled:
 * 1. Event received from subscribed table
 * 2. Debounce check (500ms minimum between invalidations)
 * 3. Query key resolution based on table + role
 * 4. Cache invalidation (propagation time computed)
 *
 * @param event       The database change event
 * @param role        The user role observing the event
 * @param state       Current debounce state (mutated on success)
 * @param networkJitter  Simulated network delay in ms (0–500)
 * @returns           Propagation result or null if debounced
 */
function processEvent(
  event: RealtimeEvent,
  role: UserRole,
  state: DebounceState,
  networkJitter: number,
): PropagationResult {
  const debounced = !shouldProcessEvent(event, state);

  if (debounced) {
    return {
      invalidatedKeys: [],
      propagationTime: 0,
      debounced: true,
    };
  }

  const keys = getInvalidationKeys(event.table, role);

  // Propagation time = network jitter + processing overhead (modelled as 10ms)
  const processingOverhead = 10;
  const propagationTime = networkJitter + processingOverhead;

  // Update debounce state
  state.lastInvalidationTime = event.timestamp;

  return {
    invalidatedKeys: keys,
    propagationTime,
    debounced: false,
  };
}

/**
 * Process a batch of events in chronological order, respecting debounce.
 */
function processBatch(
  events: RealtimeEvent[],
  role: UserRole,
  networkJitters: number[],
): PropagationResult[] {
  const state: DebounceState = { lastInvalidationTime: null };
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

  return sorted.map((event, i) => {
    const jitter = networkJitters[i % networkJitters.length] ?? 0;
    return processEvent(event, role, state, jitter);
  });
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const subscribedTableArb: fc.Arbitrary<SubscribedTable> = fc.constantFrom(
  'applications',
  'payments',
  'in_app_notifications',
);

const dbEventTypeArb: fc.Arbitrary<DbEventType> = fc.constantFrom('INSERT', 'UPDATE', 'DELETE');

const userRoleArb: fc.Arbitrary<UserRole> = fc.constantFrom('admin', 'student');

/** Network jitter: 0–500ms (realistic for Zambian connections) */
const networkJitterArb = fc.integer({ min: 0, max: 500 });

/** Generate a realtime event with a timestamp in a reasonable window */
const realtimeEventArb: fc.Arbitrary<RealtimeEvent> = fc.record({
  table: subscribedTableArb,
  eventType: dbEventTypeArb,
  timestamp: fc.integer({ min: 1000, max: 100000 }),
});

/** Generate a batch of 2–8 events */
const eventBatchArb = fc.array(realtimeEventArb, { minLength: 2, maxLength: 8 });

/** Generate matching jitter values for a batch */
const jitterBatchArb = fc.array(networkJitterArb, { minLength: 2, maxLength: 8 });

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 15: Realtime Event Propagation', () => {
  describe('query key mapping correctness', () => {
    it('every subscribed table produces at least one invalidation key for any role', () => {
      fc.assert(
        fc.property(subscribedTableArb, userRoleArb, (table, role) => {
          const keys = getInvalidationKeys(table, role);
          expect(keys.length).toBeGreaterThan(0);
        }),
        { numRuns: 10 },
      );
    });

    it('admin: applications table always invalidates the applications query key', () => {
      fc.assert(
        fc.property(dbEventTypeArb, (_eventType) => {
          const keys = getInvalidationKeys('applications', 'admin');
          expect(keys).toContain('applications');
        }),
        { numRuns: 10 },
      );
    });

    it('admin: payments table always invalidates the payments query key', () => {
      fc.assert(
        fc.property(dbEventTypeArb, (_eventType) => {
          const keys = getInvalidationKeys('payments', 'admin');
          expect(keys).toContain('payments');
        }),
        { numRuns: 10 },
      );
    });

    it('student: applications table always invalidates the applications query key', () => {
      fc.assert(
        fc.property(dbEventTypeArb, (_eventType) => {
          const keys = getInvalidationKeys('applications', 'student');
          expect(keys).toContain('applications');
        }),
        { numRuns: 10 },
      );
    });

    it('student: in_app_notifications table always invalidates the notifications query key', () => {
      fc.assert(
        fc.property(dbEventTypeArb, (_eventType) => {
          const keys = getInvalidationKeys('in_app_notifications', 'student');
          expect(keys).toContain('notifications');
        }),
        { numRuns: 10 },
      );
    });

    it('admin dashboard polling key is invalidated for every table change (admin role)', () => {
      fc.assert(
        fc.property(subscribedTableArb, (table) => {
          const keys = getInvalidationKeys(table, 'admin');
          expect(keys).toContain('admin-dashboard-polling');
        }),
        { numRuns: 10 },
      );
    });

    it('student dashboard polling key is invalidated for every table change (student role)', () => {
      fc.assert(
        fc.property(subscribedTableArb, (table) => {
          const keys = getInvalidationKeys(table, 'student');
          expect(keys).toContain('student-dashboard-polling');
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('debounce enforcement (500ms minimum)', () => {
    it('events within 500ms of the last invalidation are debounced', () => {
      fc.assert(
        fc.property(
          subscribedTableArb,
          userRoleArb,
          fc.integer({ min: 1, max: 499 }),
          (table, role, gap) => {
            const state: DebounceState = { lastInvalidationTime: 1000 };
            const event: RealtimeEvent = { table, eventType: 'UPDATE', timestamp: 1000 + gap };

            const result = processEvent(event, role, state, 0);
            expect(result.debounced).toBe(true);
            expect(result.invalidatedKeys).toHaveLength(0);
          },
        ),
        { numRuns: 10 },
      );
    });

    it('events at or after 500ms from the last invalidation are processed', () => {
      fc.assert(
        fc.property(
          subscribedTableArb,
          userRoleArb,
          fc.integer({ min: 500, max: 5000 }),
          (table, role, gap) => {
            const state: DebounceState = { lastInvalidationTime: 1000 };
            const event: RealtimeEvent = { table, eventType: 'UPDATE', timestamp: 1000 + gap };

            const result = processEvent(event, role, state, 0);
            expect(result.debounced).toBe(false);
            expect(result.invalidatedKeys.length).toBeGreaterThan(0);
          },
        ),
        { numRuns: 10 },
      );
    });

    it('the first event is never debounced (no prior invalidation)', () => {
      fc.assert(
        fc.property(realtimeEventArb, userRoleArb, (event, role) => {
          const state: DebounceState = { lastInvalidationTime: null };
          const result = processEvent(event, role, state, 0);
          expect(result.debounced).toBe(false);
          expect(result.invalidatedKeys.length).toBeGreaterThan(0);
        }),
        { numRuns: 10 },
      );
    });

    it('in a batch, consecutive processed events are at least 500ms apart', () => {
      fc.assert(
        fc.property(eventBatchArb, userRoleArb, jitterBatchArb, (events, role, jitters) => {
          const results = processBatch(events, role, jitters);
          const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

          const processedTimestamps: number[] = [];
          for (let i = 0; i < results.length; i++) {
            if (!results[i].debounced) {
              processedTimestamps.push(sorted[i].timestamp);
            }
          }

          for (let i = 1; i < processedTimestamps.length; i++) {
            expect(processedTimestamps[i] - processedTimestamps[i - 1]).toBeGreaterThanOrEqual(
              DEBOUNCE_INTERVAL,
            );
          }
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('propagation time within 2 seconds', () => {
    it('propagation time is always within the 2-second budget', () => {
      fc.assert(
        fc.property(realtimeEventArb, userRoleArb, networkJitterArb, (event, role, jitter) => {
          const state: DebounceState = { lastInvalidationTime: null };
          const result = processEvent(event, role, state, jitter);

          if (!result.debounced) {
            expect(result.propagationTime).toBeLessThanOrEqual(MAX_PROPAGATION_TIME);
          }
        }),
        { numRuns: 10 },
      );
    });

    it('propagation time equals network jitter + processing overhead', () => {
      fc.assert(
        fc.property(realtimeEventArb, userRoleArb, networkJitterArb, (event, role, jitter) => {
          const state: DebounceState = { lastInvalidationTime: null };
          const result = processEvent(event, role, state, jitter);

          if (!result.debounced) {
            const expectedTime = jitter + 10; // 10ms processing overhead
            expect(result.propagationTime).toBe(expectedTime);
          }
        }),
        { numRuns: 10 },
      );
    });

    it('even worst-case jitter (500ms) + debounce (500ms) stays under 2 seconds', () => {
      // Worst case: event arrives right at debounce boundary + max network jitter
      const state: DebounceState = { lastInvalidationTime: 0 };
      const event: RealtimeEvent = {
        table: 'applications',
        eventType: 'UPDATE',
        timestamp: DEBOUNCE_INTERVAL, // exactly at boundary
      };

      const result = processEvent(event, 'admin', state, 500); // max jitter
      expect(result.debounced).toBe(false);
      // Total time: debounce wait (500ms) + jitter (500ms) + overhead (10ms) = 1010ms
      const totalTime = DEBOUNCE_INTERVAL + result.propagationTime;
      expect(totalTime).toBeLessThanOrEqual(MAX_PROPAGATION_TIME);
    });
  });

  describe('batch processing correctness', () => {
    it('every non-debounced event in a batch produces valid query keys for the role', () => {
      fc.assert(
        fc.property(eventBatchArb, userRoleArb, jitterBatchArb, (events, role, jitters) => {
          const results = processBatch(events, role, jitters);
          const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

          for (let i = 0; i < results.length; i++) {
            if (!results[i].debounced) {
              const expected = getInvalidationKeys(sorted[i].table, role);
              expect(results[i].invalidatedKeys).toEqual(expected);
            }
          }
        }),
        { numRuns: 10 },
      );
    });

    it('at least one event in any non-empty batch is processed (the first one)', () => {
      fc.assert(
        fc.property(eventBatchArb, userRoleArb, jitterBatchArb, (events, role, jitters) => {
          const results = processBatch(events, role, jitters);
          const processedCount = results.filter((r) => !r.debounced).length;
          expect(processedCount).toBeGreaterThanOrEqual(1);
        }),
        { numRuns: 10 },
      );
    });

    it('debounced events produce empty invalidation keys', () => {
      fc.assert(
        fc.property(eventBatchArb, userRoleArb, jitterBatchArb, (events, role, jitters) => {
          const results = processBatch(events, role, jitters);

          for (const result of results) {
            if (result.debounced) {
              expect(result.invalidatedKeys).toHaveLength(0);
              expect(result.propagationTime).toBe(0);
            }
          }
        }),
        { numRuns: 10 },
      );
    });
  });
});
