/**
 * Property 6: Visibility guard prevents initial-load revalidation
 *
 * For any sequence of visibility events, the handler only invalidates when
 * transitioning from hidden→visible AND hasHiddenOnce === true. The flag is
 * only set to true on a hidden transition. Initial visible events do not
 * trigger revalidation.
 *
 * // Feature: production-stability-hardening, Property 6: Visibility guard prevents initial-load revalidation
 *
 * **Validates: Requirements 7.3, 7.5, 9.1, 9.2, 9.4**
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Model: Visibility guard state machine
// ---------------------------------------------------------------------------

type VisibilityState = 'visible' | 'hidden';

interface GuardState {
  hasHiddenOnce: boolean;
  invalidationCount: number;
}

const INITIAL_STATE: GuardState = {
  hasHiddenOnce: false,
  invalidationCount: 0,
};

/**
 * Pure state machine modelling the AuthContext visibility guard.
 *
 * - On 'hidden': set hasHiddenOnce = true, no invalidation
 * - On 'visible' when hasHiddenOnce is true: invalidate (count + 1)
 * - On 'visible' when hasHiddenOnce is false: no-op (initial load guard)
 */
function processVisibilityEvent(
  state: GuardState,
  newVisibility: VisibilityState,
): GuardState {
  if (newVisibility === 'hidden') {
    return { ...state, hasHiddenOnce: true };
  }
  // visible transition
  if (state.hasHiddenOnce) {
    return { ...state, invalidationCount: state.invalidationCount + 1 };
  }
  return state; // no invalidation on initial visible
}

/**
 * Process a full sequence of visibility events, returning the final state.
 */
function processSequence(events: VisibilityState[]): GuardState {
  return events.reduce(processVisibilityEvent, INITIAL_STATE);
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const visibilityEventArb = fc.constantFrom<VisibilityState>('visible', 'hidden');
const eventSequenceArb = fc.array(visibilityEventArb, { minLength: 0, maxLength: 50 });

// ---------------------------------------------------------------------------
// Source verification helpers
// ---------------------------------------------------------------------------

const AUTH_CONTEXT_FILE = path.resolve(
  process.cwd(),
  'src/contexts/AuthContext.tsx',
);

function readAuthContextSource(): string {
  return fs.readFileSync(AUTH_CONTEXT_FILE, 'utf-8');
}

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe('Property 6: Visibility guard prevents initial-load revalidation', () => {
  it('first visible event never triggers invalidation (hasHiddenOnce starts false)', () => {
    fc.assert(
      fc.property(eventSequenceArb, (events) => {
        // Prepend a 'visible' event to any sequence — the very first visible
        // must never cause invalidation because hasHiddenOnce is false.
        const firstVisibleState = processVisibilityEvent(INITIAL_STATE, 'visible');
        expect(firstVisibleState.invalidationCount).toBe(0);
        expect(firstVisibleState.hasHiddenOnce).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('after a hidden event, the next visible event triggers exactly one invalidation', () => {
    fc.assert(
      fc.property(eventSequenceArb, (prefixEvents) => {
        // Process any prefix, then force hidden → visible
        let state = processSequence(prefixEvents);
        const countBefore = state.invalidationCount;

        state = processVisibilityEvent(state, 'hidden');
        expect(state.hasHiddenOnce).toBe(true);

        state = processVisibilityEvent(state, 'visible');
        expect(state.invalidationCount).toBe(countBefore + 1);
      }),
      { numRuns: 100 },
    );
  });

  it('hasHiddenOnce flag is only set to true on hidden transitions', () => {
    fc.assert(
      fc.property(eventSequenceArb, (events) => {
        let state = INITIAL_STATE;
        for (const event of events) {
          const prev = state;
          state = processVisibilityEvent(state, event);

          if (event === 'visible') {
            // visible events must never change hasHiddenOnce
            expect(state.hasHiddenOnce).toBe(prev.hasHiddenOnce);
          }
          if (event === 'hidden') {
            // hidden events must set hasHiddenOnce to true
            expect(state.hasHiddenOnce).toBe(true);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('multiple visible events without intervening hidden each trigger one invalidation (once flag is set)', () => {
    fc.assert(
      fc.property(
        // Generate 1-10 consecutive visible events after the flag is set
        fc.integer({ min: 1, max: 10 }),
        (visibleCount) => {
          // Start with hidden to set the flag
          let state = processVisibilityEvent(INITIAL_STATE, 'hidden');
          expect(state.hasHiddenOnce).toBe(true);

          // Each visible event should trigger exactly one invalidation
          for (let i = 0; i < visibleCount; i++) {
            const countBefore = state.invalidationCount;
            state = processVisibilityEvent(state, 'visible');
            expect(state.invalidationCount).toBe(countBefore + 1);
          }

          // Total invalidations should equal the number of visible events
          expect(state.invalidationCount).toBe(visibleCount);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('for any event sequence, invalidation count equals visible events that occur after the first hidden', () => {
    fc.assert(
      fc.property(eventSequenceArb, (events) => {
        const finalState = processSequence(events);

        // Count expected invalidations manually: visible events after first hidden
        let seenHidden = false;
        let expectedInvalidations = 0;
        for (const event of events) {
          if (event === 'hidden') {
            seenHidden = true;
          } else if (event === 'visible' && seenHidden) {
            expectedInvalidations++;
          }
        }

        expect(finalState.invalidationCount).toBe(expectedInvalidations);
      }),
      { numRuns: 100 },
    );
  });

  // ---------------------------------------------------------------------------
  // Source verification: confirm the model matches the actual AuthContext code
  // ---------------------------------------------------------------------------

  describe('source verification', () => {
    const source = readAuthContextSource();

    it('AuthContext declares hasHiddenOnce flag', () => {
      expect(source).toContain('hasHiddenOnce');
    });

    it('hasHiddenOnce is set to true only on hidden transition', () => {
      // The source should set hasHiddenOnce = true inside a hidden check
      expect(source).toMatch(/visibilityState\s*===\s*['"]hidden['"]/);
      expect(source).toContain('hasHiddenOnce = true');
    });

    it('invalidation only occurs when hasHiddenOnce is true and visible', () => {
      // The source should check both visible state and hasHiddenOnce before invalidating
      expect(source).toMatch(/visibilityState\s*===\s*['"]visible['"]\s*&&\s*hasHiddenOnce/);
    });

    it('invalidation targets the auth session query key', () => {
      // The invalidation should target ['auth', 'session']
      expect(source).toMatch(/invalidateQueries\(\s*\{\s*queryKey:\s*\['auth',\s*'session'\]/);
    });

    it('hasHiddenOnce starts as false', () => {
      expect(source).toMatch(/let\s+hasHiddenOnce\s*=\s*false/);
    });
  });
});
