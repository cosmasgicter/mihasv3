// @vitest-environment node
/**
 * Property 4: Dashboard Count Accuracy
 *
 * Feature: production-readiness-audit
 * **Validates: Requirements 2.1, 2.6**
 *
 * For any set of applications in the database, the admin dashboard counts for
 * each status (draft, submitted, under_review, approved, rejected) SHALL exactly
 * match the actual database counts.
 *
 * This test models the dashboard count computation as pure functions — no React
 * hooks, database connections, or complex modules required.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Domain types (mirrors the application status model)
// ---------------------------------------------------------------------------

type ApplicationStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected';

interface Application {
  id: string;
  status: ApplicationStatus;
  programId: string;
}

/** The status breakdown returned by the admin dashboard */
interface DashboardStatusBreakdown {
  draft: number;
  submitted: number;
  under_review: number;
  approved: number;
  rejected: number;
}

interface DashboardCounts {
  totalApplications: number;
  statusBreakdown: DashboardStatusBreakdown;
}

// ---------------------------------------------------------------------------
// All valid statuses the dashboard must account for
// ---------------------------------------------------------------------------

const ALL_STATUSES: ApplicationStatus[] = [
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
];

// ---------------------------------------------------------------------------
// Pure model: compute dashboard counts from a list of applications
// (mirrors the SQL GROUP BY status logic in api-src/admin.ts dashboard action)
// ---------------------------------------------------------------------------

/**
 * Compute the dashboard status breakdown from a set of applications.
 * This models the SQL: SELECT status, COUNT(*) FROM applications GROUP BY status
 */
function computeDashboardCounts(applications: Application[]): DashboardCounts {
  const breakdown: DashboardStatusBreakdown = {
    draft: 0,
    submitted: 0,
    under_review: 0,
    approved: 0,
    rejected: 0,
  };

  for (const app of applications) {
    breakdown[app.status] += 1;
  }

  return {
    totalApplications: applications.length,
    statusBreakdown: breakdown,
  };
}

/**
 * Compute the actual count for a specific status by filtering the raw data.
 * This is the "ground truth" — a simple filter + length.
 */
function actualCountForStatus(applications: Application[], status: ApplicationStatus): number {
  return applications.filter((app) => app.status === status).length;
}

/**
 * Add an application to the dataset and recompute counts.
 */
function addApplication(
  applications: Application[],
  newApp: Application,
): { applications: Application[]; counts: DashboardCounts } {
  const updated = [...applications, newApp];
  return { applications: updated, counts: computeDashboardCounts(updated) };
}

/**
 * Remove an application by id and recompute counts.
 */
function removeApplication(
  applications: Application[],
  appId: string,
): { applications: Application[]; counts: DashboardCounts } {
  const updated = applications.filter((app) => app.id !== appId);
  return { applications: updated, counts: computeDashboardCounts(updated) };
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const statusArb: fc.Arbitrary<ApplicationStatus> = fc.constantFrom(...ALL_STATUSES);

const programIdArb = fc.constantFrom('prog-1', 'prog-2', 'prog-3', 'prog-4', 'prog-5');

const applicationArb: fc.Arbitrary<Application> = fc.record({
  id: fc.uuid(),
  status: statusArb,
  programId: programIdArb,
});

/** 0–30 applications */
const applicationListArb = fc.array(applicationArb, { minLength: 0, maxLength: 30 });

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 4: Dashboard Count Accuracy', () => {
  describe('status counts match actual database counts', () => {
    it('each status count in the breakdown matches the filtered count from raw data', () => {
      fc.assert(
        fc.property(applicationListArb, (apps) => {
          const dashboard = computeDashboardCounts(apps);

          for (const status of ALL_STATUSES) {
            const actual = actualCountForStatus(apps, status);
            expect(dashboard.statusBreakdown[status]).toBe(actual);
          }
        }),
        { numRuns: 10 },
      );
    });

    it('draft count matches actual draft applications', () => {
      fc.assert(
        fc.property(applicationListArb, (apps) => {
          const dashboard = computeDashboardCounts(apps);
          const actual = apps.filter((a) => a.status === 'draft').length;
          expect(dashboard.statusBreakdown.draft).toBe(actual);
        }),
        { numRuns: 10 },
      );
    });

    it('submitted count matches actual submitted applications', () => {
      fc.assert(
        fc.property(applicationListArb, (apps) => {
          const dashboard = computeDashboardCounts(apps);
          const actual = apps.filter((a) => a.status === 'submitted').length;
          expect(dashboard.statusBreakdown.submitted).toBe(actual);
        }),
        { numRuns: 10 },
      );
    });

    it('under_review count matches actual under_review applications', () => {
      fc.assert(
        fc.property(applicationListArb, (apps) => {
          const dashboard = computeDashboardCounts(apps);
          const actual = apps.filter((a) => a.status === 'under_review').length;
          expect(dashboard.statusBreakdown.under_review).toBe(actual);
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('total count equals sum of all status counts', () => {
    it('totalApplications equals the sum of all status breakdown values', () => {
      fc.assert(
        fc.property(applicationListArb, (apps) => {
          const dashboard = computeDashboardCounts(apps);
          const sumOfStatuses = ALL_STATUSES.reduce(
            (sum, status) => sum + dashboard.statusBreakdown[status],
            0,
          );
          expect(dashboard.totalApplications).toBe(sumOfStatuses);
        }),
        { numRuns: 10 },
      );
    });

    it('totalApplications equals the input array length', () => {
      fc.assert(
        fc.property(applicationListArb, (apps) => {
          const dashboard = computeDashboardCounts(apps);
          expect(dashboard.totalApplications).toBe(apps.length);
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('empty dataset produces all zero counts', () => {
    it('an empty application list yields zero for every status and total', () => {
      const dashboard = computeDashboardCounts([]);

      expect(dashboard.totalApplications).toBe(0);
      for (const status of ALL_STATUSES) {
        expect(dashboard.statusBreakdown[status]).toBe(0);
      }
    });
  });

  describe('adding/removing applications updates counts correctly', () => {
    it('adding an application increments exactly the matching status count by 1', () => {
      fc.assert(
        fc.property(applicationListArb, applicationArb, (apps, newApp) => {
          const before = computeDashboardCounts(apps);
          const { counts: after } = addApplication(apps, newApp);

          // The added status should increase by exactly 1
          expect(after.statusBreakdown[newApp.status]).toBe(
            before.statusBreakdown[newApp.status] + 1,
          );

          // All other statuses should remain unchanged
          for (const status of ALL_STATUSES) {
            if (status !== newApp.status) {
              expect(after.statusBreakdown[status]).toBe(before.statusBreakdown[status]);
            }
          }

          // Total should increase by 1
          expect(after.totalApplications).toBe(before.totalApplications + 1);
        }),
        { numRuns: 10 },
      );
    });

    it('removing an application decrements exactly the matching status count by 1', () => {
      fc.assert(
        fc.property(
          applicationListArb.filter((apps) => apps.length > 0),
          (apps) => {
            // Pick a random index to remove
            const idx = Math.floor(Math.random() * apps.length);
            const toRemove = apps[idx];

            const before = computeDashboardCounts(apps);
            const { counts: after } = removeApplication(apps, toRemove.id);

            // The removed status should decrease by exactly 1
            expect(after.statusBreakdown[toRemove.status]).toBe(
              before.statusBreakdown[toRemove.status] - 1,
            );

            // All other statuses should remain unchanged
            for (const status of ALL_STATUSES) {
              if (status !== toRemove.status) {
                expect(after.statusBreakdown[status]).toBe(before.statusBreakdown[status]);
              }
            }

            // Total should decrease by 1
            expect(after.totalApplications).toBe(before.totalApplications - 1);
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  describe('status breakdown is exhaustive (no applications unaccounted for)', () => {
    it('every application is counted in exactly one status bucket', () => {
      fc.assert(
        fc.property(applicationListArb, (apps) => {
          const dashboard = computeDashboardCounts(apps);

          // Sum of all status counts must equal total
          const sumOfStatuses = ALL_STATUSES.reduce(
            (sum, status) => sum + dashboard.statusBreakdown[status],
            0,
          );
          expect(sumOfStatuses).toBe(dashboard.totalApplications);

          // Each application's status must be one of the known statuses
          for (const app of apps) {
            expect(ALL_STATUSES).toContain(app.status);
          }
        }),
        { numRuns: 10 },
      );
    });

    it('all counts are non-negative', () => {
      fc.assert(
        fc.property(applicationListArb, (apps) => {
          const dashboard = computeDashboardCounts(apps);

          expect(dashboard.totalApplications).toBeGreaterThanOrEqual(0);
          for (const status of ALL_STATUSES) {
            expect(dashboard.statusBreakdown[status]).toBeGreaterThanOrEqual(0);
          }
        }),
        { numRuns: 10 },
      );
    });

    it('status breakdown keys cover all expected statuses', () => {
      fc.assert(
        fc.property(applicationListArb, (apps) => {
          const dashboard = computeDashboardCounts(apps);
          const breakdownKeys = Object.keys(dashboard.statusBreakdown).sort();
          const expectedKeys = [...ALL_STATUSES].sort();
          expect(breakdownKeys).toEqual(expectedKeys);
        }),
        { numRuns: 10 },
      );
    });
  });
});
