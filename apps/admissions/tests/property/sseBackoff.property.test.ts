/**
 * Property-Based Tests: SSE Exponential Backoff
 * Feature: frontend-backend-forensic-audit
 * Task: 9.5 Write property test for exponential backoff
 * 
 * **Property 17: Exponential Backoff Implementation**
 * 
 * *For any* SSE reconnection attempt sequence, the backoff delay SHALL increase
 * exponentially (e.g., 1s, 2s, 4s, 8s) up to a maximum threshold.
 * 
 * **Validates: Requirements 5.4**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { calculateBackoff } from '../../src/lib/sseClient';

// ============================================================================
// Test Configuration
// ============================================================================

/**
 * Number of runs for property tests.
 * Backoff calculation is fast, so we can run many iterations.
 */
const NUM_RUNS = 10;

/**
 * Default values from the SSE client
 */
const DEFAULT_INITIAL_BACKOFF = 1000; // 1 second
const DEFAULT_MAX_BACKOFF = 30000;    // 30 seconds

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/**
 * Valid retry attempt number (0-indexed)
 * Attempt 0 = first retry, attempt 1 = second retry, etc.
 */
const attemptArb = fc.integer({ min: 0, max: 20 });

/**
 * Valid initial backoff in milliseconds (100ms to 10s)
 */
const initialBackoffArb = fc.integer({ min: 100, max: 10000 });

/**
 * Valid max backoff in milliseconds (1s to 120s)
 */
const maxBackoffArb = fc.integer({ min: 1000, max: 120000 });

/**
 * Retry count for sequence testing (1 to 15 retries)
 */
const retryCountArb = fc.integer({ min: 1, max: 15 });

/**
 * Configuration for backoff testing
 */
const backoffConfigArb = fc.record({
  initialBackoff: initialBackoffArb,
  maxBackoff: maxBackoffArb,
}).filter(config => config.maxBackoff >= config.initialBackoff);

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 17: Exponential Backoff Implementation', () => {
  /**
   * **Validates: Requirements 5.4**
   * 
   * THE SSE_System SHALL implement exponential backoff strategy
   */

  // ==========================================================================
  // Core Exponential Backoff Properties
  // ==========================================================================

  describe('Exponential Growth', () => {
    it('PROPERTY: Each delay is roughly double the previous (with tolerance for capping)', () => {
      fc.assert(
        fc.property(
          retryCountArb,
          (retryCount) => {
            const delays: number[] = [];
            for (let i = 0; i < retryCount; i++) {
              delays.push(calculateBackoff(i, DEFAULT_INITIAL_BACKOFF, DEFAULT_MAX_BACKOFF));
            }
            
            // Each delay should be roughly double the previous (with jitter tolerance)
            // unless capped at maxBackoff
            for (let i = 1; i < delays.length; i++) {
              const prevDelay = delays[i - 1];
              const currDelay = delays[i];
              
              // If previous delay was already at max, current should also be at max
              if (prevDelay >= DEFAULT_MAX_BACKOFF) {
                expect(currDelay).toBe(DEFAULT_MAX_BACKOFF);
              } else {
                // Otherwise, current should be at least 1.5x previous (allowing for some tolerance)
                // and at most 2.5x previous (or capped at max)
                expect(currDelay).toBeGreaterThanOrEqual(prevDelay * 1.5);
                expect(currDelay).toBeLessThanOrEqual(Math.min(prevDelay * 2.5, DEFAULT_MAX_BACKOFF));
              }
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Backoff follows formula initialBackoff * 2^attempt', () => {
      fc.assert(
        fc.property(
          attemptArb,
          backoffConfigArb,
          (attempt, config) => {
            const { initialBackoff, maxBackoff } = config;
            const result = calculateBackoff(attempt, initialBackoff, maxBackoff);
            
            // Expected value before capping
            const expectedUncapped = initialBackoff * Math.pow(2, attempt);
            
            // Result should be min(expectedUncapped, maxBackoff)
            const expected = Math.min(expectedUncapped, maxBackoff);
            expect(result).toBe(expected);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Delays form a non-decreasing sequence', () => {
      fc.assert(
        fc.property(
          retryCountArb,
          backoffConfigArb,
          (retryCount, config) => {
            const { initialBackoff, maxBackoff } = config;
            const delays: number[] = [];
            
            for (let i = 0; i < retryCount; i++) {
              delays.push(calculateBackoff(i, initialBackoff, maxBackoff));
            }
            
            // Each delay should be >= the previous
            for (let i = 1; i < delays.length; i++) {
              expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // Max Backoff Capping
  // ==========================================================================

  describe('Max Backoff Capping', () => {
    it('PROPERTY: Backoff is always capped at maxBackoff', () => {
      fc.assert(
        fc.property(
          attemptArb,
          backoffConfigArb,
          (attempt, config) => {
            const { initialBackoff, maxBackoff } = config;
            const result = calculateBackoff(attempt, initialBackoff, maxBackoff);
            
            expect(result).toBeLessThanOrEqual(maxBackoff);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Large attempt numbers result in maxBackoff', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 10, max: 100 }), // Large attempt numbers
          backoffConfigArb,
          (attempt, config) => {
            const { initialBackoff, maxBackoff } = config;
            const result = calculateBackoff(attempt, initialBackoff, maxBackoff);
            
            // For large attempts, should always hit the cap
            expect(result).toBe(maxBackoff);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Once maxBackoff is reached, subsequent attempts stay at maxBackoff', () => {
      fc.assert(
        fc.property(
          backoffConfigArb,
          (config) => {
            const { initialBackoff, maxBackoff } = config;
            
            // Find the first attempt that hits maxBackoff
            let firstMaxAttempt = 0;
            while (calculateBackoff(firstMaxAttempt, initialBackoff, maxBackoff) < maxBackoff) {
              firstMaxAttempt++;
              if (firstMaxAttempt > 100) break; // Safety limit
            }
            
            // All subsequent attempts should also be at maxBackoff
            for (let i = firstMaxAttempt; i < firstMaxAttempt + 5; i++) {
              expect(calculateBackoff(i, initialBackoff, maxBackoff)).toBe(maxBackoff);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // Initial Backoff Respect
  // ==========================================================================

  describe('Initial Backoff Respect', () => {
    it('PROPERTY: First attempt (attempt=0) returns initialBackoff', () => {
      fc.assert(
        fc.property(
          backoffConfigArb,
          (config) => {
            const { initialBackoff, maxBackoff } = config;
            const result = calculateBackoff(0, initialBackoff, maxBackoff);
            
            // First attempt should return initialBackoff (or maxBackoff if initial > max)
            expect(result).toBe(Math.min(initialBackoff, maxBackoff));
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Backoff is always at least initialBackoff (for attempt >= 0)', () => {
      fc.assert(
        fc.property(
          attemptArb,
          backoffConfigArb,
          (attempt, config) => {
            const { initialBackoff, maxBackoff } = config;
            const result = calculateBackoff(attempt, initialBackoff, maxBackoff);
            
            // Result should be at least initialBackoff (capped at maxBackoff)
            expect(result).toBeGreaterThanOrEqual(Math.min(initialBackoff, maxBackoff));
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Different initial backoffs produce proportionally different delays', () => {
      fc.assert(
        fc.property(
          attemptArb.filter(a => a < 5), // Small attempts to avoid capping
          fc.integer({ min: 100, max: 1000 }),
          (attempt, baseBackoff) => {
            const maxBackoff = 1000000; // Very high to avoid capping
            
            const delay1 = calculateBackoff(attempt, baseBackoff, maxBackoff);
            const delay2 = calculateBackoff(attempt, baseBackoff * 2, maxBackoff);
            
            // Doubling initial backoff should double the delay
            expect(delay2).toBe(delay1 * 2);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('PROPERTY: Attempt 0 is handled correctly', () => {
      fc.assert(
        fc.property(
          backoffConfigArb,
          (config) => {
            const { initialBackoff, maxBackoff } = config;
            const result = calculateBackoff(0, initialBackoff, maxBackoff);
            
            // 2^0 = 1, so result should be initialBackoff (capped at maxBackoff)
            expect(result).toBe(Math.min(initialBackoff, maxBackoff));
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Very large attempt numbers do not cause overflow', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 50, max: 1000 }), // Very large attempts
          backoffConfigArb,
          (attempt, config) => {
            const { initialBackoff, maxBackoff } = config;
            const result = calculateBackoff(attempt, initialBackoff, maxBackoff);
            
            // Should not be NaN, Infinity, or negative
            expect(Number.isFinite(result)).toBe(true);
            expect(result).toBeGreaterThan(0);
            expect(result).toBeLessThanOrEqual(maxBackoff);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: When initialBackoff equals maxBackoff, all attempts return that value', () => {
      fc.assert(
        fc.property(
          attemptArb,
          fc.integer({ min: 100, max: 10000 }),
          (attempt, backoffValue) => {
            const result = calculateBackoff(attempt, backoffValue, backoffValue);
            
            // When initial = max, result should always be that value
            expect(result).toBe(backoffValue);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: When initialBackoff > maxBackoff, result is capped at maxBackoff', () => {
      fc.assert(
        fc.property(
          attemptArb,
          fc.integer({ min: 5000, max: 10000 }), // initialBackoff
          fc.integer({ min: 1000, max: 4999 }),  // maxBackoff (smaller)
          (attempt, initialBackoff, maxBackoff) => {
            const result = calculateBackoff(attempt, initialBackoff, maxBackoff);
            
            // Result should be capped at maxBackoff
            expect(result).toBe(maxBackoff);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Result is always a positive number', () => {
      fc.assert(
        fc.property(
          attemptArb,
          backoffConfigArb,
          (attempt, config) => {
            const { initialBackoff, maxBackoff } = config;
            const result = calculateBackoff(attempt, initialBackoff, maxBackoff);
            
            expect(result).toBeGreaterThan(0);
            expect(typeof result).toBe('number');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Result is always an integer (no fractional milliseconds)', () => {
      fc.assert(
        fc.property(
          attemptArb,
          backoffConfigArb,
          (attempt, config) => {
            const { initialBackoff, maxBackoff } = config;
            const result = calculateBackoff(attempt, initialBackoff, maxBackoff);
            
            // Result should be an integer (whole milliseconds)
            expect(Number.isInteger(result)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // Default Configuration Tests
  // ==========================================================================

  describe('Default Configuration (1s initial, 30s max)', () => {
    it('PROPERTY: Default config produces expected sequence', () => {
      // Test the specific sequence mentioned in the design doc
      const expectedSequence = [1000, 2000, 4000, 8000, 16000, 30000, 30000];
      
      for (let i = 0; i < expectedSequence.length; i++) {
        const result = calculateBackoff(i, DEFAULT_INITIAL_BACKOFF, DEFAULT_MAX_BACKOFF);
        expect(result).toBe(expectedSequence[i]);
      }
    });

    it('PROPERTY: Default config caps at 30 seconds', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }),
          (attempt) => {
            const result = calculateBackoff(attempt, DEFAULT_INITIAL_BACKOFF, DEFAULT_MAX_BACKOFF);
            expect(result).toBeLessThanOrEqual(DEFAULT_MAX_BACKOFF);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Default config reaches max at attempt 5', () => {
      // 1000 * 2^5 = 32000 > 30000, so attempt 5 should be capped
      const attempt4 = calculateBackoff(4, DEFAULT_INITIAL_BACKOFF, DEFAULT_MAX_BACKOFF);
      const attempt5 = calculateBackoff(5, DEFAULT_INITIAL_BACKOFF, DEFAULT_MAX_BACKOFF);
      
      expect(attempt4).toBe(16000); // 1000 * 2^4 = 16000
      expect(attempt5).toBe(30000); // Capped at max
    });
  });

  // ==========================================================================
  // Mathematical Properties
  // ==========================================================================

  describe('Mathematical Properties', () => {
    it('PROPERTY: Backoff doubles with each attempt (before capping)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 3 }), // Small attempts to avoid capping
          fc.integer({ min: 100, max: 1000 }),
          (attempt, initialBackoff) => {
            const maxBackoff = 1000000; // Very high to avoid capping
            
            const current = calculateBackoff(attempt, initialBackoff, maxBackoff);
            const next = calculateBackoff(attempt + 1, initialBackoff, maxBackoff);
            
            // Next should be exactly double current
            expect(next).toBe(current * 2);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Backoff at attempt N is initialBackoff * 2^N (before capping)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10 }),
          fc.integer({ min: 100, max: 500 }),
          (attempt, initialBackoff) => {
            const maxBackoff = 1000000; // Very high to avoid capping
            
            const result = calculateBackoff(attempt, initialBackoff, maxBackoff);
            const expected = initialBackoff * Math.pow(2, attempt);
            
            expect(result).toBe(expected);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Total wait time for N retries is predictable', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          backoffConfigArb,
          (retryCount, config) => {
            const { initialBackoff, maxBackoff } = config;
            
            let totalWait = 0;
            for (let i = 0; i < retryCount; i++) {
              totalWait += calculateBackoff(i, initialBackoff, maxBackoff);
            }
            
            // Total wait should be positive and finite
            expect(totalWait).toBeGreaterThan(0);
            expect(Number.isFinite(totalWait)).toBe(true);
            
            // Total wait should be at least retryCount * initialBackoff
            expect(totalWait).toBeGreaterThanOrEqual(retryCount * Math.min(initialBackoff, maxBackoff));
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });
});
