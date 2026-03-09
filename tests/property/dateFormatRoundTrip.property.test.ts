/**
 * Property 12: Date formatting round-trip
 *
 * Feature: production-remediation
 *
 * For any valid Date object, formatting it with formatDate() and then parsing
 * the result back must produce a date with the same year, month, and day.
 * Additionally, toDateInputValue() applied to any ISO 8601 timestamp must
 * produce a string matching the pattern YYYY-MM-DD.
 *
 * **Validates: Requirements 22.1, 22.2, 22.3**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { formatDate, toDateInputValue } from '../../src/lib/dateFormat';

/** Month abbreviation lookup for parsing formatDate output back */
const MONTH_ABBREVS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/**
 * Parse a "DD MMM YYYY" string back into { year, month, day }.
 * Returns null if the string doesn't match the expected format.
 */
function parseDDMMMYYYY(formatted: string): { year: number; month: number; day: number } | null {
  const match = formatted.match(/^(\d{1,2}) (\w{3}) (\d{4})$/);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const monthIdx = MONTH_ABBREVS[match[2]];
  const year = parseInt(match[3], 10);
  if (monthIdx === undefined) return null;
  return { year, month: monthIdx, day };
}

/** Arbitrary: a valid Date between 1970 and 2099 */
const validDateArb = fc
  .date({ min: new Date(1970, 0, 1), max: new Date(2099, 11, 31) })
  .filter(d => !Number.isNaN(d.getTime()));

/** Arbitrary: an ISO 8601 timestamp string from a valid date */
const isoTimestampArb = validDateArb.map(d => d.toISOString());

describe('Date Formatting Round-Trip Property Tests (Property 12)', () => {
  describe('P12.1: formatDate round-trip preserves year, month, and day', () => {
    it('formatting then parsing back yields the same year/month/day', () => {
      fc.assert(
        fc.property(validDateArb, (date) => {
          const formatted = formatDate(date);

          // formatDate should never return "Not available" for valid dates
          expect(formatted).not.toBe('Not available');

          const parsed = parseDDMMMYYYY(formatted);
          expect(parsed).not.toBeNull();

          expect(parsed!.year).toBe(date.getFullYear());
          expect(parsed!.month).toBe(date.getMonth());
          expect(parsed!.day).toBe(date.getDate());
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('P12.2: toDateInputValue produces YYYY-MM-DD pattern', () => {
    it('output always matches the YYYY-MM-DD regex for valid ISO timestamps', () => {
      fc.assert(
        fc.property(isoTimestampArb, (iso) => {
          const result = toDateInputValue(iso);

          // Must not be empty for valid ISO strings
          expect(result).not.toBe('');

          // Must match YYYY-MM-DD pattern
          expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('P12.3: toDateInputValue round-trip preserves date components', () => {
    it('the YYYY-MM-DD output parses back to the same year/month/day as the input', () => {
      fc.assert(
        fc.property(validDateArb, (date) => {
          const result = toDateInputValue(date);

          expect(result).not.toBe('');
          expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);

          const [yearStr, monthStr, dayStr] = result.split('-');
          expect(parseInt(yearStr, 10)).toBe(date.getFullYear());
          expect(parseInt(monthStr, 10)).toBe(date.getMonth() + 1);
          expect(parseInt(dayStr, 10)).toBe(date.getDate());
        }),
        { numRuns: 10 },
      );
    });
  });
});
