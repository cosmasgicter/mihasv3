/**
 * Property 13: Relative time formatting threshold
 *
 * Feature: production-remediation
 *
 * For any timestamp within the last 7 days, formatRelative() must return a
 * string containing a relative time indicator (e.g., "ago", "yesterday",
 * "today"). For any timestamp older than 7 days, formatRelative() must return
 * the absolute DD MMM YYYY format.
 *
 * **Validates: Requirements 22.5**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { formatRelative } from '../../src/lib/dateFormat';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Relative time indicators that formatRelative uses for recent timestamps */
const RELATIVE_INDICATORS = ['ago', 'Yesterday', 'Just now'];

/** Regex matching the absolute DD MMM YYYY format */
const ABSOLUTE_FORMAT = /^\d{1,2} \w{3} \d{4}$/;

/** Fixed reference time to keep tests deterministic */
const NOW = new Date('2025-06-15T12:00:00.000Z');

/**
 * Arbitrary: offset in ms within the last 7 days (1 second to just under 7 days).
 * We start at 1000ms to avoid the sub-second "Just now" edge and stay strictly
 * within the 7-day window.
 */
const recentOffsetArb = fc.integer({ min: 1_000, max: SEVEN_DAYS_MS - 1 });

/**
 * Arbitrary: offset in ms older than 7 days (7 days to ~365 days).
 * These timestamps should always produce absolute format.
 */
const oldOffsetArb = fc.integer({ min: SEVEN_DAYS_MS, max: 365 * 24 * 60 * 60 * 1000 });

/**
 * Arbitrary: offset in ms for future timestamps (1 second to 30 days ahead).
 * Future dates should produce absolute format.
 */
const futureOffsetArb = fc.integer({ min: 1_000, max: 30 * 24 * 60 * 60 * 1000 });

describe('Relative Time Formatting Threshold Property Tests (Property 13)', () => {
  describe('P13.1: Timestamps within 7 days return relative indicators', () => {
    it('any timestamp in the last 7 days contains a relative time indicator', () => {
      fc.assert(
        fc.property(recentOffsetArb, (offsetMs) => {
          const timestamp = new Date(NOW.getTime() - offsetMs);
          const result = formatRelative(timestamp, NOW);

          const hasRelativeIndicator = RELATIVE_INDICATORS.some((indicator) =>
            result.includes(indicator),
          );

          expect(hasRelativeIndicator).toBe(true);
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('P13.2: Timestamps older than 7 days return absolute DD MMM YYYY', () => {
    it('any timestamp older than 7 days matches the absolute format', () => {
      fc.assert(
        fc.property(oldOffsetArb, (offsetMs) => {
          const timestamp = new Date(NOW.getTime() - offsetMs);
          const result = formatRelative(timestamp, NOW);

          expect(result).toMatch(ABSOLUTE_FORMAT);
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('P13.3: Future timestamps return absolute DD MMM YYYY', () => {
    it('any future timestamp matches the absolute format', () => {
      fc.assert(
        fc.property(futureOffsetArb, (offsetMs) => {
          const timestamp = new Date(NOW.getTime() + offsetMs);
          const result = formatRelative(timestamp, NOW);

          expect(result).toMatch(ABSOLUTE_FORMAT);
        }),
        { numRuns: 10 },
      );
    });
  });
});
