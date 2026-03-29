// @vitest-environment node
/**
 * Property 15: Database normalization post-conditions
 * Property 16: Normalization migration idempotency
 *
 * Tests normalization logic as pure functions against random dirty data.
 * Validates: Requirements 33.2, 33.3, 33.4, 33.5, 33.6, 33.7
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// --- Pure normalization functions extracted from migration logic ---

const VALID_STATUSES = ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'waitlisted'] as const;

function normalizePhone(phone: string | null): string | null {
  if (!phone) return phone;
  // Zambian number starting with 0 and 10 digits total → +260 prefix
  if (/^0[0-9]{9}$/.test(phone)) {
    return '+260' + phone.substring(1);
  }
  return phone;
}

function normalizeNationality(nationality: string | null | undefined, citizenship: string | null | undefined): string {
  if (nationality && nationality.trim() !== '') return nationality;
  if (citizenship && citizenship.trim() !== '') return citizenship;
  return 'Zambian';
}

function normalizeStatus(status: string | null | undefined): string {
  if (status && (VALID_STATUSES as readonly string[]).includes(status)) return status;
  return 'draft';
}

function normalizeTimestamps(createdAt: Date | null, updatedAt: Date | null): { createdAt: Date; updatedAt: Date } {
  const now = new Date();
  const created = createdAt ?? now;
  const updated = updatedAt && updatedAt >= created ? updatedAt : created;
  return { createdAt: created, updatedAt: updated };
}

function swapDatesIfNeeded(startDate: Date, endDate: Date): { startDate: Date; endDate: Date } {
  if (startDate > endDate) return { startDate: endDate, endDate: startDate };
  return { startDate, endDate };
}

function normalizeProgramName(name: string | null | undefined): string {
  if (name && name.trim() !== '') return name;
  return 'Unnamed Program';
}

// --- Property 15: Normalization post-conditions ---

describe('Property 15: Database normalization post-conditions', () => {
  it('normalizePhone: Zambian 0-prefix numbers become +260', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 9, maxLength: 9 }),
        (digitArr) => {
          const phone = '0' + digitArr.join('');
          const result = normalizePhone(phone);
          expect(result).toMatch(/^\+260/);
          expect(result).toHaveLength(13); // +260 + 9 digits
        },
      ),
      { numRuns: 10 },
    );
  });

  it('normalizePhone: already-prefixed numbers are unchanged', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 9, maxLength: 12 }),
        (digitArr) => {
          const phone = '+260' + digitArr.join('');
          const result = normalizePhone(phone);
          expect(result).toBe(phone);
        },
      ),
      { numRuns: 10 },
    );
  });

  it('normalizePhone: null stays null', () => {
    expect(normalizePhone(null)).toBeNull();
  });

  it('normalizeNationality: never returns empty or null', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string(), { nil: null }),
        fc.option(fc.string(), { nil: null }),
        (nationality, citizenship) => {
          const result = normalizeNationality(nationality, citizenship);
          expect(result).toBeTruthy();
          expect(result.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 10 },
    );
  });

  it('normalizeNationality: prefers nationality over citizenship when non-blank', () => {
    const nonBlankString = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);
    fc.assert(
      fc.property(nonBlankString, nonBlankString, (nationality, citizenship) => {
        const result = normalizeNationality(nationality, citizenship);
        expect(result).toBe(nationality);
      }),
      { numRuns: 10 },
    );
  });

  it('normalizeStatus: always returns a valid status', () => {
    fc.assert(
      fc.property(fc.option(fc.string(), { nil: null }), (status) => {
        const result = normalizeStatus(status);
        expect(VALID_STATUSES).toContain(result);
      }),
      { numRuns: 10 },
    );
  });

  it('normalizeTimestamps: updatedAt >= createdAt always', () => {
    fc.assert(
      fc.property(
        fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }), { nil: null }),
        fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }), { nil: null }),
        (createdAt, updatedAt) => {
          const result = normalizeTimestamps(createdAt, updatedAt);
          expect(result.updatedAt.getTime()).toBeGreaterThanOrEqual(result.createdAt.getTime());
        },
      ),
      { numRuns: 10 },
    );
  });

  it('swapDatesIfNeeded: startDate <= endDate always', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
        (a, b) => {
          const result = swapDatesIfNeeded(a, b);
          expect(result.startDate.getTime()).toBeLessThanOrEqual(result.endDate.getTime());
        },
      ),
      { numRuns: 10 },
    );
  });

  it('normalizeProgramName: never returns empty', () => {
    fc.assert(
      fc.property(fc.option(fc.string(), { nil: null }), (name) => {
        const result = normalizeProgramName(name);
        expect(result.length).toBeGreaterThan(0);
      }),
      { numRuns: 10 },
    );
  });
});

// --- Property 16: Normalization migration idempotency ---

describe('Property 16: Normalization migration idempotency', () => {
  it('normalizePhone is idempotent', () => {
    fc.assert(
      fc.property(fc.option(fc.string({ minLength: 0, maxLength: 15 }), { nil: null }), (phone) => {
        const once = normalizePhone(phone);
        const twice = normalizePhone(once);
        expect(twice).toBe(once);
      }),
      { numRuns: 10 },
    );
  });

  it('normalizeNationality is idempotent', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string(), { nil: null }),
        fc.option(fc.string(), { nil: null }),
        (nationality, citizenship) => {
          const once = normalizeNationality(nationality, citizenship);
          const twice = normalizeNationality(once, citizenship);
          expect(twice).toBe(once);
        },
      ),
      { numRuns: 10 },
    );
  });

  it('normalizeStatus is idempotent', () => {
    fc.assert(
      fc.property(fc.option(fc.string(), { nil: null }), (status) => {
        const once = normalizeStatus(status);
        const twice = normalizeStatus(once);
        expect(twice).toBe(once);
      }),
      { numRuns: 10 },
    );
  });

  it('normalizeTimestamps is idempotent', () => {
    fc.assert(
      fc.property(
        fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }), { nil: null }),
        fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }), { nil: null }),
        (createdAt, updatedAt) => {
          const once = normalizeTimestamps(createdAt, updatedAt);
          const twice = normalizeTimestamps(once.createdAt, once.updatedAt);
          expect(twice.createdAt.getTime()).toBe(once.createdAt.getTime());
          expect(twice.updatedAt.getTime()).toBe(once.updatedAt.getTime());
        },
      ),
      { numRuns: 10 },
    );
  });

  it('swapDatesIfNeeded is idempotent', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
        (a, b) => {
          const once = swapDatesIfNeeded(a, b);
          const twice = swapDatesIfNeeded(once.startDate, once.endDate);
          expect(twice.startDate.getTime()).toBe(once.startDate.getTime());
          expect(twice.endDate.getTime()).toBe(once.endDate.getTime());
        },
      ),
      { numRuns: 10 },
    );
  });

  it('normalizeProgramName is idempotent', () => {
    fc.assert(
      fc.property(fc.option(fc.string(), { nil: null }), (name) => {
        const once = normalizeProgramName(name);
        const twice = normalizeProgramName(once);
        expect(twice).toBe(once);
      }),
      { numRuns: 10 },
    );
  });
});
