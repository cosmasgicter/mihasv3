/**
 * Property 11: Application statistics accuracy
 *
 * Feature: production-remediation
 *
 * For any list of applications with random statuses from
 * {draft, submitted, under_review, approved, rejected, waitlisted},
 * the "in-progress" count must equal the count of applications with status
 * `draft` or `submitted`, and the "completed" count must equal the count of
 * applications with status `approved`, `rejected`, or `waitlisted`.
 * The sum of in-progress + completed + other must equal the total count.
 *
 * **Validates: Requirements 19.1, 19.2**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  computeApplicationStats,
  type ApplicationStatsInput,
} from '../../src/lib/applicationStats';

const ALL_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'waitlisted',
] as const;

const IN_PROGRESS_STATUSES = new Set(['draft', 'submitted']);
const COMPLETED_STATUSES = new Set(['approved', 'rejected', 'waitlisted']);

/** Arbitrary: a single application with a random status */
const applicationArb: fc.Arbitrary<ApplicationStatsInput> = fc
  .constantFrom(...ALL_STATUSES)
  .map(status => ({ status }));

/** Arbitrary: a list of 0–50 applications */
const applicationListArb = fc.array(applicationArb, { minLength: 0, maxLength: 50 });

describe('Application Statistics Accuracy Property Tests (Property 11)', () => {
  describe('P11.1: In-progress count equals draft + submitted count', () => {
    it('inProgress matches the number of draft and submitted applications', () => {
      fc.assert(
        fc.property(applicationListArb, (apps) => {
          const stats = computeApplicationStats(apps);
          const expected = apps.filter(a => IN_PROGRESS_STATUSES.has(a.status)).length;
          expect(stats.inProgress).toBe(expected);
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('P11.2: Completed count equals approved + rejected + waitlisted count', () => {
    it('completed matches the number of approved, rejected, and waitlisted applications', () => {
      fc.assert(
        fc.property(applicationListArb, (apps) => {
          const stats = computeApplicationStats(apps);
          const expected = apps.filter(a => COMPLETED_STATUSES.has(a.status)).length;
          expect(stats.completed).toBe(expected);
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('P11.3: inProgress + completed + other equals total', () => {
    it('the sum of all categories equals the total application count', () => {
      fc.assert(
        fc.property(applicationListArb, (apps) => {
          const stats = computeApplicationStats(apps);
          const other = apps.filter(
            a => !IN_PROGRESS_STATUSES.has(a.status) && !COMPLETED_STATUSES.has(a.status),
          ).length;
          expect(stats.inProgress + stats.completed + other).toBe(stats.total);
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('P11.4: Total always equals input array length', () => {
    it('total count matches the number of applications provided', () => {
      fc.assert(
        fc.property(applicationListArb, (apps) => {
          const stats = computeApplicationStats(apps);
          expect(stats.total).toBe(apps.length);
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('P11.5: All counts are non-negative', () => {
    it('inProgress, completed, and total are never negative', () => {
      fc.assert(
        fc.property(applicationListArb, (apps) => {
          const stats = computeApplicationStats(apps);
          expect(stats.inProgress).toBeGreaterThanOrEqual(0);
          expect(stats.completed).toBeGreaterThanOrEqual(0);
          expect(stats.total).toBeGreaterThanOrEqual(0);
        }),
        { numRuns: 10 },
      );
    });
  });
});
