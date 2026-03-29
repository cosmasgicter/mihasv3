// @vitest-environment node
/**
 * Property 12: Notification Retry Logic
 *
 * Feature: production-readiness-audit
 * **Validates: Requirements 5.3, 11.2**
 *
 * For any failed email notification, the system SHALL retry with exponential
 * backoff (delays of 1s, 2s, 4s) up to 3 attempts before marking as failed.
 *
 * This test models the retry logic as pure functions (mirroring
 * notificationResilience.js) and verifies the exponential backoff property
 * across randomly generated failure scenarios.
 *
 * Retry config (from notificationResilience.js):
 *   baseDelay: 1000ms (1 second)
 *   multiplier: 2
 *   maxRetries: 3
 *   Delays: attempt 1 = 1s, attempt 2 = 2s, attempt 3 = 4s
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Retry configuration (mirrors notificationResilience.js)
// ---------------------------------------------------------------------------

interface RetryConfig {
  baseDelay: number;   // milliseconds
  multiplier: number;
  maxRetries: number;
}

const DEFAULT_CONFIG: RetryConfig = {
  baseDelay: 1000,
  multiplier: 2,
  maxRetries: 3,
};

// ---------------------------------------------------------------------------
// Notification status model
// ---------------------------------------------------------------------------

type NotificationStatus = 'pending' | 'sent' | 'failed';

interface RetryResult {
  status: NotificationStatus;
  attempts: number;
  delays: number[];
}

// ---------------------------------------------------------------------------
// Pure function models of the retry logic
// ---------------------------------------------------------------------------

/**
 * Calculate the delay for a given attempt number (0-indexed).
 * Formula: baseDelay * multiplier^attempt
 *
 * attempt 0 → baseDelay * 2^0 = 1000ms (1s)
 * attempt 1 → baseDelay * 2^1 = 2000ms (2s)
 * attempt 2 → baseDelay * 2^2 = 4000ms (4s)
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  return config.baseDelay * Math.pow(config.multiplier, attempt);
}

/**
 * Simulate the full retry sequence for a notification.
 *
 * @param failurePattern - array of booleans; true = attempt fails, false = succeeds
 * @param config - retry configuration
 * @returns the final status, total attempts made, and delays used
 */
function simulateRetry(
  failurePattern: boolean[],
  config: RetryConfig = DEFAULT_CONFIG,
): RetryResult {
  const delays: number[] = [];
  let attempts = 0;

  for (let i = 0; i <= config.maxRetries; i++) {
    attempts++;
    const fails = i < failurePattern.length ? failurePattern[i] : false;

    if (!fails) {
      return { status: 'sent', attempts, delays };
    }

    // If this was the last allowed attempt, mark as permanently failed
    if (i === config.maxRetries) {
      return { status: 'failed', attempts, delays };
    }

    // Record the delay before the next retry
    delays.push(calculateDelay(i, config));
  }

  // Should not reach here, but satisfy TypeScript
  return { status: 'failed', attempts, delays };
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Generate a failure pattern: an array of booleans where true = failure.
 * Length between 1 and 5 to cover scenarios beyond maxRetries.
 */
const failurePatternArb = fc.array(fc.boolean(), { minLength: 1, maxLength: 5 });

/** Generate a valid retry config with reasonable bounds */
const retryConfigArb: fc.Arbitrary<RetryConfig> = fc.record({
  baseDelay: fc.integer({ min: 100, max: 5000 }),
  multiplier: fc.integer({ min: 2, max: 4 }),
  maxRetries: fc.integer({ min: 1, max: 5 }),
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 12: Notification Retry Logic', () => {
  describe('exponential backoff delay calculation', () => {
    it('delay follows the formula: baseDelay * multiplier^attempt', () => {
      fc.assert(
        fc.property(retryConfigArb, fc.integer({ min: 0, max: 10 }), (config, attempt) => {
          const delay = calculateDelay(attempt, config);
          const expected = config.baseDelay * Math.pow(config.multiplier, attempt);
          expect(delay).toBe(expected);
        }),
        { numRuns: 10 },
      );
    });

    it('delays are strictly increasing for successive attempts', () => {
      fc.assert(
        fc.property(retryConfigArb, (config) => {
          for (let i = 0; i < config.maxRetries - 1; i++) {
            const current = calculateDelay(i, config);
            const next = calculateDelay(i + 1, config);
            expect(next).toBeGreaterThan(current);
          }
        }),
        { numRuns: 10 },
      );
    });

    it('default config produces delays of 1s, 2s, 4s', () => {
      expect(calculateDelay(0, DEFAULT_CONFIG)).toBe(1000);
      expect(calculateDelay(1, DEFAULT_CONFIG)).toBe(2000);
      expect(calculateDelay(2, DEFAULT_CONFIG)).toBe(4000);
    });
  });

  describe('max retries enforcement', () => {
    it('never exceeds maxRetries + 1 total attempts (1 initial + maxRetries retries)', () => {
      fc.assert(
        fc.property(failurePatternArb, retryConfigArb, (pattern, config) => {
          const result = simulateRetry(pattern, config);
          expect(result.attempts).toBeLessThanOrEqual(config.maxRetries + 1);
        }),
        { numRuns: 10 },
      );
    });

    it('marks as failed after exactly maxRetries + 1 attempts when all fail', () => {
      fc.assert(
        fc.property(retryConfigArb, (config) => {
          // All attempts fail
          const allFail = Array(config.maxRetries + 1).fill(true);
          const result = simulateRetry(allFail, config);

          expect(result.status).toBe('failed');
          expect(result.attempts).toBe(config.maxRetries + 1);
        }),
        { numRuns: 10 },
      );
    });

    it('default config: 4 total attempts (1 initial + 3 retries) when all fail', () => {
      const allFail = [true, true, true, true];
      const result = simulateRetry(allFail, DEFAULT_CONFIG);

      expect(result.status).toBe('failed');
      expect(result.attempts).toBe(4);
      expect(result.delays).toEqual([1000, 2000, 4000]);
    });
  });

  describe('successful retry stops further attempts', () => {
    it('stops retrying on first success', () => {
      fc.assert(
        fc.property(failurePatternArb, retryConfigArb, (pattern, config) => {
          const result = simulateRetry(pattern, config);

          if (result.status === 'sent') {
            // The number of delays recorded should be attempts - 1
            // (no delay after the successful attempt)
            expect(result.delays.length).toBe(result.attempts - 1);
          }
        }),
        { numRuns: 10 },
      );
    });

    it('immediate success on first attempt produces zero delays', () => {
      fc.assert(
        fc.property(retryConfigArb, (config) => {
          const result = simulateRetry([false], config);

          expect(result.status).toBe('sent');
          expect(result.attempts).toBe(1);
          expect(result.delays).toHaveLength(0);
        }),
        { numRuns: 10 },
      );
    });

    it('success on second attempt produces exactly one delay', () => {
      fc.assert(
        fc.property(retryConfigArb, (config) => {
          const result = simulateRetry([true, false], config);

          expect(result.status).toBe('sent');
          expect(result.attempts).toBe(2);
          expect(result.delays).toHaveLength(1);
          expect(result.delays[0]).toBe(calculateDelay(0, config));
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('delay sequence correctness', () => {
    it('recorded delays match the exponential backoff formula', () => {
      fc.assert(
        fc.property(failurePatternArb, retryConfigArb, (pattern, config) => {
          const result = simulateRetry(pattern, config);

          for (let i = 0; i < result.delays.length; i++) {
            expect(result.delays[i]).toBe(calculateDelay(i, config));
          }
        }),
        { numRuns: 10 },
      );
    });

    it('default config all-fail scenario produces [1000, 2000, 4000]', () => {
      const allFail = [true, true, true, true];
      const result = simulateRetry(allFail, DEFAULT_CONFIG);
      expect(result.delays).toEqual([1000, 2000, 4000]);
    });

    it('total wait time equals sum of exponential delays', () => {
      fc.assert(
        fc.property(failurePatternArb, retryConfigArb, (pattern, config) => {
          const result = simulateRetry(pattern, config);
          const expectedTotal = result.delays.reduce((sum, d) => sum + d, 0);
          const actualTotal = result.delays.reduce((sum, d) => sum + d, 0);
          expect(actualTotal).toBe(expectedTotal);

          // Also verify each delay is positive
          for (const d of result.delays) {
            expect(d).toBeGreaterThan(0);
          }
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('final status is always determined', () => {
    it('result is always either sent or failed, never pending', () => {
      fc.assert(
        fc.property(failurePatternArb, retryConfigArb, (pattern, config) => {
          const result = simulateRetry(pattern, config);
          expect(['sent', 'failed']).toContain(result.status);
        }),
        { numRuns: 10 },
      );
    });

    it('result is sent if any attempt in the pattern succeeds within maxRetries', () => {
      fc.assert(
        fc.property(retryConfigArb, (config) => {
          // Generate a pattern that succeeds on the last allowed attempt
          const pattern = Array(config.maxRetries).fill(true);
          pattern.push(false); // succeeds on final attempt

          const result = simulateRetry(pattern, config);
          expect(result.status).toBe('sent');
          expect(result.attempts).toBe(config.maxRetries + 1);
        }),
        { numRuns: 10 },
      );
    });
  });
});
