/**
 * Feature: realtime-sse-system, Property 14: Exponential backoff formula
 *
 * Validates: Requirements 9.1
 *
 * For any retry attempt number n (0-indexed), calculateBackoff(n, 1000, 30000)
 * should equal min(1000 * 2^n, 30000).
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { calculateBackoff, calculatePollingBackoff } from '@/lib/sseClient';

describe('Property 14: Exponential backoff formula', () => {
  it('calculateBackoff(n, 1000, 30000) === min(1000 * 2^n, 30000) for any attempt n', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 }),
        (attempt) => {
          const result = calculateBackoff(attempt, 1000, 30000);
          const expected = Math.min(1000 * Math.pow(2, attempt), 30000);
          expect(result).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('backoff is always >= initialBackoff and <= maxBackoff', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 100, max: 5000 }),
        fc.integer({ min: 5001, max: 60000 }),
        (attempt, initialBackoff, maxBackoff) => {
          const result = calculateBackoff(attempt, initialBackoff, maxBackoff);
          expect(result).toBeGreaterThanOrEqual(initialBackoff);
          expect(result).toBeLessThanOrEqual(maxBackoff);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('backoff doubles with each attempt until capped', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 19 }),
        (attempt) => {
          const current = calculateBackoff(attempt, 1000, 30000);
          const next = calculateBackoff(attempt + 1, 1000, 30000);
          // Next is either double or capped at max
          if (current * 2 <= 30000) {
            expect(next).toBe(current * 2);
          } else {
            expect(next).toBe(30000);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Feature: realtime-sse-system, Property 15: Progressive polling backoff formula
 *
 * Validates: Requirements 6.4, 9.4
 *
 * For any number of consecutive idle polls n (0-indexed), the polling interval
 * should equal min(30000 * 1.5^n, 120000).
 */
describe('Property 15: Progressive polling backoff formula', () => {
  it('calculatePollingBackoff(n) === min(30000 * 1.5^n, 120000) for any idle poll count n', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 30 }),
        (idlePolls) => {
          const result = calculatePollingBackoff(idlePolls);
          const expected = Math.min(30000 * Math.pow(1.5, idlePolls), 120000);
          expect(result).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('polling interval is always >= 30000 and <= 120000', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        (idlePolls) => {
          const result = calculatePollingBackoff(idlePolls);
          expect(result).toBeGreaterThanOrEqual(30000);
          expect(result).toBeLessThanOrEqual(120000);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('polling interval increases by 1.5x each idle poll until capped', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 29 }),
        (idlePolls) => {
          const current = calculatePollingBackoff(idlePolls);
          const next = calculatePollingBackoff(idlePolls + 1);
          if (current * 1.5 <= 120000) {
            expect(next).toBe(current * 1.5);
          } else {
            expect(next).toBe(120000);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
