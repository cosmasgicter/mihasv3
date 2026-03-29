// @vitest-environment node
/**
 * Property 16: Realtime Fallback Activation
 *
 * Feature: production-readiness-audit
 * **Validates: Requirements 12.4, 12.6**
 *
 * For any WebSocket connection failure, the system SHALL activate polling
 * fallback within 5 seconds and continue attempting reconnection with
 * exponential backoff.
 *
 * The realtime fallback system:
 * - Polling fallback activates within 5 seconds of WebSocket failure
 * - Polling interval is 30 seconds
 * - Reconnection uses exponential backoff (initial 1s, multiplier 2, max 30s)
 * - Fallback deactivates when WebSocket reconnects successfully
 *
 * This test models the fallback activation as pure functions — no React hooks,
 * WebSocket connections, or DOM required.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Constants (mirror production configuration)
// ---------------------------------------------------------------------------

const MAX_FALLBACK_ACTIVATION_TIME = 5000; // 5 seconds
const POLLING_INTERVAL = 30000; // 30 seconds
const RECONNECT_INITIAL_DELAY = 1000; // 1 second
const RECONNECT_MULTIPLIER = 2;
const RECONNECT_MAX_DELAY = 30000; // 30 seconds

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

interface FallbackState {
  connectionStatus: ConnectionStatus;
  pollingActive: boolean;
  pollingInterval: number;
  reconnectAttempt: number;
  nextReconnectDelay: number;
  fallbackActivatedAt: number | null;
  disconnectedAt: number | null;
}

// ---------------------------------------------------------------------------
// Pure model functions
// ---------------------------------------------------------------------------

/**
 * Create the initial connected state.
 */
function createInitialState(): FallbackState {
  return {
    connectionStatus: 'connected',
    pollingActive: false,
    pollingInterval: POLLING_INTERVAL,
    reconnectAttempt: 0,
    nextReconnectDelay: RECONNECT_INITIAL_DELAY,
    fallbackActivatedAt: null,
    disconnectedAt: null,
  };
}

/**
 * Compute the reconnection delay for a given attempt number using
 * exponential backoff: delay = min(initial * multiplier^attempt, maxDelay).
 */
function computeReconnectDelay(attempt: number): number {
  const delay = RECONNECT_INITIAL_DELAY * Math.pow(RECONNECT_MULTIPLIER, attempt);
  return Math.min(delay, RECONNECT_MAX_DELAY);
}

/**
 * Handle a WebSocket disconnection event.
 * Activates polling fallback and begins reconnection attempts.
 */
function handleDisconnect(state: FallbackState, timestamp: number): FallbackState {
  return {
    ...state,
    connectionStatus: 'disconnected',
    pollingActive: true,
    pollingInterval: POLLING_INTERVAL,
    reconnectAttempt: 0,
    nextReconnectDelay: RECONNECT_INITIAL_DELAY,
    fallbackActivatedAt: timestamp,
    disconnectedAt: timestamp,
  };
}

/**
 * Handle a failed reconnection attempt.
 * Increments the attempt counter and computes the next backoff delay.
 */
function handleReconnectFailure(state: FallbackState): FallbackState {
  const nextAttempt = state.reconnectAttempt + 1;
  return {
    ...state,
    connectionStatus: 'reconnecting',
    reconnectAttempt: nextAttempt,
    nextReconnectDelay: computeReconnectDelay(nextAttempt),
    pollingActive: true, // polling stays active during reconnection
  };
}

/**
 * Handle a successful reconnection.
 * Deactivates polling fallback and resets reconnection state.
 */
function handleReconnectSuccess(state: FallbackState): FallbackState {
  return {
    ...state,
    connectionStatus: 'connected',
    pollingActive: false,
    reconnectAttempt: 0,
    nextReconnectDelay: RECONNECT_INITIAL_DELAY,
    fallbackActivatedAt: null,
    disconnectedAt: null,
  };
}

/**
 * Simulate a sequence of reconnection attempts, returning the state after
 * each attempt. All attempts fail until the optional successAtIndex.
 */
function simulateReconnectionSequence(
  numAttempts: number,
  successAtIndex?: number,
): FallbackState[] {
  const states: FallbackState[] = [];
  let state = createInitialState();
  state = handleDisconnect(state, 1000);
  states.push(state);

  for (let i = 0; i < numAttempts; i++) {
    if (successAtIndex !== undefined && i === successAtIndex) {
      state = handleReconnectSuccess(state);
    } else {
      state = handleReconnectFailure(state);
    }
    states.push(state);
  }

  return states;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Timestamp for disconnection events */
const timestampArb = fc.integer({ min: 1000, max: 100000 });

/** Number of reconnection attempts (1–10) */
const attemptCountArb = fc.integer({ min: 1, max: 10 });

/** Reconnection attempt index (0-based) */
const attemptIndexArb = fc.integer({ min: 0, max: 15 });

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 16: Realtime Fallback Activation', () => {
  describe('fallback activation on WebSocket failure', () => {
    it('polling fallback activates immediately on disconnect', () => {
      fc.assert(
        fc.property(timestampArb, (timestamp) => {
          const state = createInitialState();
          const disconnected = handleDisconnect(state, timestamp);

          expect(disconnected.pollingActive).toBe(true);
          expect(disconnected.connectionStatus).toBe('disconnected');
          expect(disconnected.fallbackActivatedAt).toBe(timestamp);
          expect(disconnected.disconnectedAt).toBe(timestamp);
        }),
        { numRuns: 10 },
      );
    });

    it('fallback activation time is within 5-second budget (instant in model)', () => {
      fc.assert(
        fc.property(timestampArb, (timestamp) => {
          const state = createInitialState();
          const disconnected = handleDisconnect(state, timestamp);

          // Activation is synchronous in the model — 0ms delay
          const activationDelay = disconnected.fallbackActivatedAt! - disconnected.disconnectedAt!;
          expect(activationDelay).toBeLessThanOrEqual(MAX_FALLBACK_ACTIVATION_TIME);
        }),
        { numRuns: 10 },
      );
    });

    it('polling interval is always 30 seconds', () => {
      fc.assert(
        fc.property(timestampArb, (timestamp) => {
          const state = createInitialState();
          const disconnected = handleDisconnect(state, timestamp);

          expect(disconnected.pollingInterval).toBe(POLLING_INTERVAL);
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('exponential backoff on reconnection attempts', () => {
    it('initial reconnect delay is 1 second', () => {
      fc.assert(
        fc.property(timestampArb, (timestamp) => {
          const state = createInitialState();
          const disconnected = handleDisconnect(state, timestamp);

          expect(disconnected.nextReconnectDelay).toBe(RECONNECT_INITIAL_DELAY);
          expect(disconnected.reconnectAttempt).toBe(0);
        }),
        { numRuns: 10 },
      );
    });

    it('reconnect delay doubles with each failed attempt', () => {
      fc.assert(
        fc.property(attemptIndexArb, (attempt) => {
          const delay = computeReconnectDelay(attempt);
          const expectedRaw = RECONNECT_INITIAL_DELAY * Math.pow(RECONNECT_MULTIPLIER, attempt);
          const expected = Math.min(expectedRaw, RECONNECT_MAX_DELAY);

          expect(delay).toBe(expected);
        }),
        { numRuns: 10 },
      );
    });

    it('reconnect delay never exceeds the maximum (30 seconds)', () => {
      fc.assert(
        fc.property(attemptIndexArb, (attempt) => {
          const delay = computeReconnectDelay(attempt);
          expect(delay).toBeLessThanOrEqual(RECONNECT_MAX_DELAY);
        }),
        { numRuns: 10 },
      );
    });

    it('reconnect delays form a non-decreasing sequence up to the cap', () => {
      fc.assert(
        fc.property(attemptCountArb, (numAttempts) => {
          const delays: number[] = [];
          for (let i = 0; i <= numAttempts; i++) {
            delays.push(computeReconnectDelay(i));
          }

          for (let i = 1; i < delays.length; i++) {
            expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
          }
        }),
        { numRuns: 10 },
      );
    });

    it('attempt counter increments on each failed reconnection', () => {
      fc.assert(
        fc.property(attemptCountArb, (numAttempts) => {
          const states = simulateReconnectionSequence(numAttempts);

          // states[0] is the disconnect state (attempt 0)
          // states[1..n] are reconnection failure states
          for (let i = 1; i < states.length; i++) {
            expect(states[i].reconnectAttempt).toBe(i);
          }
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('polling remains active during reconnection', () => {
    it('polling stays active through all reconnection attempts', () => {
      fc.assert(
        fc.property(attemptCountArb, (numAttempts) => {
          const states = simulateReconnectionSequence(numAttempts);

          for (const state of states) {
            expect(state.pollingActive).toBe(true);
          }
        }),
        { numRuns: 10 },
      );
    });

    it('polling interval remains constant during reconnection', () => {
      fc.assert(
        fc.property(attemptCountArb, (numAttempts) => {
          const states = simulateReconnectionSequence(numAttempts);

          for (const state of states) {
            expect(state.pollingInterval).toBe(POLLING_INTERVAL);
          }
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('fallback deactivation on successful reconnection', () => {
    it('polling deactivates when WebSocket reconnects', () => {
      fc.assert(
        fc.property(attemptCountArb, (failedAttempts) => {
          // Simulate failures then a success
          const states = simulateReconnectionSequence(failedAttempts + 1, failedAttempts);
          const finalState = states[states.length - 1];

          expect(finalState.connectionStatus).toBe('connected');
          expect(finalState.pollingActive).toBe(false);
          expect(finalState.reconnectAttempt).toBe(0);
          expect(finalState.nextReconnectDelay).toBe(RECONNECT_INITIAL_DELAY);
          expect(finalState.fallbackActivatedAt).toBeNull();
        }),
        { numRuns: 10 },
      );
    });

    it('reconnect state fully resets after successful reconnection', () => {
      fc.assert(
        fc.property(attemptCountArb, (failedAttempts) => {
          const states = simulateReconnectionSequence(failedAttempts + 1, failedAttempts);
          const finalState = states[states.length - 1];
          const initialState = createInitialState();

          // Final state should match initial connected state
          expect(finalState.connectionStatus).toBe(initialState.connectionStatus);
          expect(finalState.pollingActive).toBe(initialState.pollingActive);
          expect(finalState.reconnectAttempt).toBe(initialState.reconnectAttempt);
          expect(finalState.nextReconnectDelay).toBe(initialState.nextReconnectDelay);
        }),
        { numRuns: 10 },
      );
    });

    it('a new disconnect after reconnection starts fresh backoff', () => {
      fc.assert(
        fc.property(
          attemptCountArb,
          timestampArb,
          (failedAttempts, newDisconnectTime) => {
            // Simulate: disconnect → failures → success → disconnect again
            const states = simulateReconnectionSequence(failedAttempts + 1, failedAttempts);
            const reconnectedState = states[states.length - 1];
            const newDisconnect = handleDisconnect(reconnectedState, newDisconnectTime);

            // Should start fresh
            expect(newDisconnect.reconnectAttempt).toBe(0);
            expect(newDisconnect.nextReconnectDelay).toBe(RECONNECT_INITIAL_DELAY);
            expect(newDisconnect.pollingActive).toBe(true);
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  describe('backoff delay sequence correctness', () => {
    it('delay sequence follows 1s, 2s, 4s, 8s, 16s, 30s, 30s, ...', () => {
      const expectedDelays = [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000];

      for (let i = 0; i < expectedDelays.length; i++) {
        expect(computeReconnectDelay(i)).toBe(expectedDelays[i]);
      }
    });

    it('delay at the cap stays at the cap for any higher attempt', () => {
      fc.assert(
        fc.property(fc.integer({ min: 5, max: 100 }), (attempt) => {
          // At attempt 5, delay = 1000 * 2^5 = 32000, capped to 30000
          const delay = computeReconnectDelay(attempt);
          expect(delay).toBe(RECONNECT_MAX_DELAY);
        }),
        { numRuns: 10 },
      );
    });
  });
});
