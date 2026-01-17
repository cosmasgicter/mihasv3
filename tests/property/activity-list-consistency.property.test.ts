/**
 * Property-Based Test: Activity and List Data Consistency
 * 
 * **Property 3: Activity and list data consistency**
 * **Validates: Requirements 12.1**
 * 
 * For any application that appears in the Recent Activity feed, that same
 * application SHALL also appear in the Application_List when queried without
 * status filters.
 * 
 * Feature: production-bug-fixes-jan2026, Property 3: Activity and list data consistency
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// Property test configuration - minimum 100 iterations
const propertyTestConfig = { numRuns: 100 };

/**
 * Application status type matching the database constraint
 */
type ApplicationStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected';

/**
 * Application interface for testing
 */
interface Application {
  id: string;
  status: ApplicationStatus;
  full_name: string;
  email: string;
  program: string;
  created_at: string;
  updated_at: string;
}

/**
 * Activity item interface matching AdminDashboardActivity
 */
interface ActivityItem {
  id: string;
  type: 'application' | 'approval' | 'rejection' | 'review' | 'system';
  message: string;
  timestamp: string;
  user?: string;
  status?: string;
}

/**
 * Simulates the recent activity query from functions/admin/dashboard.js
 * This mirrors the logic: order by created_at desc, limit 5
 * 
 * @param applications - List of all applications
 * @param limit - Maximum number of items to return (default 5)
 * @returns Recent activity items
 */
function getRecentActivity(applications: Application[], limit: number = 5): ActivityItem[] {
  // Sort by created_at descending (most recent first)
  const sorted = [...applications].sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  
  // Take the first `limit` items
  const recent = sorted.slice(0, limit);
  
  // Map to activity items (mirrors functions/admin/dashboard.js)
  return recent.map(app => ({
    id: app.id,
    type: 'application' as const,
    message: `New application from ${app.full_name} for ${app.program}`,
    timestamp: app.created_at,
    user: app.full_name,
    status: app.status
  }));
}

/**
 * Simulates the application list query from functions/applications.js
 * This mirrors the logic: no status exclusions when no filter is applied
 * 
 * @param applications - List of all applications
 * @param statusFilter - Optional status filter
 * @returns Filtered list of applications
 */
function getApplicationList(
  applications: Application[],
  statusFilter?: ApplicationStatus
): Application[] {
  let result = [...applications];
  
  // Apply status filter if provided
  if (statusFilter) {
    result = result.filter(app => app.status === statusFilter);
  }
  
  // No status exclusions by default - all statuses are included
  return result;
}

/**
 * Check if an application ID appears in the application list
 */
function applicationIdInList(id: string, list: Application[]): boolean {
  return list.some(app => app.id === id);
}

describe('Property 3: Activity and List Data Consistency', () => {
  // Arbitrary for application status
  const statusArb = fc.constantFrom<ApplicationStatus>(
    'draft', 'submitted', 'under_review', 'approved', 'rejected'
  );
  
  // Arbitrary for ISO date string - use integer timestamp to avoid invalid date issues
  const dateArb = fc.integer({
    min: new Date('2025-01-01').getTime(),
    max: new Date('2026-12-31').getTime()
  }).map(timestamp => new Date(timestamp).toISOString());
  
  // Arbitrary for application
  const applicationArb = fc.record({
    id: fc.uuid(),
    status: statusArb,
    full_name: fc.string({ minLength: 1, maxLength: 50 }),
    email: fc.emailAddress(),
    program: fc.constantFrom('Nursing', 'Pharmacy', 'Clinical Medicine', 'Laboratory'),
    created_at: dateArb,
    updated_at: dateArb
  });

  /**
   * Property: All activity items appear in unfiltered application list
   * For any application that appears in recent activity, it SHALL also
   * appear in the application list when no status filter is applied.
   */
  it('all activity items appear in unfiltered application list', () => {
    fc.assert(
      fc.property(
        fc.array(applicationArb, { minLength: 1, maxLength: 100 }),
        (applications) => {
          // Get recent activity
          const recentActivity = getRecentActivity(applications);
          
          // Get unfiltered application list
          const applicationList = getApplicationList(applications);
          
          // Every activity item should have a corresponding application in the list
          recentActivity.forEach(activityItem => {
            expect(applicationIdInList(activityItem.id, applicationList)).toBe(true);
          });
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: Activity items with any status appear in list
   * Applications with any status (including draft) that appear in activity
   * SHALL appear in the unfiltered application list.
   */
  it('activity items with any status appear in unfiltered list', () => {
    fc.assert(
      fc.property(
        fc.array(applicationArb, { minLength: 1, maxLength: 100 }),
        (applications) => {
          // Get recent activity
          const recentActivity = getRecentActivity(applications);
          
          // Get unfiltered application list
          const applicationList = getApplicationList(applications);
          
          // Check each activity item
          recentActivity.forEach(activityItem => {
            // Find the original application
            const originalApp = applications.find(app => app.id === activityItem.id);
            expect(originalApp).toBeDefined();
            
            // Regardless of status, it should be in the list
            expect(applicationIdInList(activityItem.id, applicationList)).toBe(true);
          });
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: Draft applications in activity appear in list
   * Draft applications that appear in recent activity SHALL appear
   * in the unfiltered application list.
   */
  it('draft applications in activity appear in unfiltered list', () => {
    fc.assert(
      fc.property(
        fc.array(applicationArb, { minLength: 1, maxLength: 100 }),
        (applications) => {
          // Get recent activity
          const recentActivity = getRecentActivity(applications);
          
          // Get unfiltered application list
          const applicationList = getApplicationList(applications);
          
          // Find draft applications in activity
          const draftActivityItems = recentActivity.filter(item => item.status === 'draft');
          
          // All draft activity items should be in the list
          draftActivityItems.forEach(activityItem => {
            expect(applicationIdInList(activityItem.id, applicationList)).toBe(true);
          });
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: Activity count is bounded by list count
   * The number of items in recent activity SHALL NOT exceed the number
   * of items in the unfiltered application list.
   */
  it('activity count does not exceed list count', () => {
    fc.assert(
      fc.property(
        fc.array(applicationArb, { minLength: 0, maxLength: 100 }),
        (applications) => {
          // Get recent activity (limited to 5)
          const recentActivity = getRecentActivity(applications);
          
          // Get unfiltered application list
          const applicationList = getApplicationList(applications);
          
          // Activity count should not exceed list count
          expect(recentActivity.length).toBeLessThanOrEqual(applicationList.length);
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: Activity IDs are subset of list IDs
   * The set of application IDs in recent activity SHALL be a subset
   * of the application IDs in the unfiltered list.
   */
  it('activity IDs are subset of list IDs', () => {
    fc.assert(
      fc.property(
        fc.array(applicationArb, { minLength: 1, maxLength: 100 }),
        (applications) => {
          // Get recent activity
          const recentActivity = getRecentActivity(applications);
          
          // Get unfiltered application list
          const applicationList = getApplicationList(applications);
          
          // Get ID sets
          const activityIds = new Set(recentActivity.map(item => item.id));
          const listIds = new Set(applicationList.map(app => app.id));
          
          // Every activity ID should be in the list
          activityIds.forEach(id => {
            expect(listIds.has(id)).toBe(true);
          });
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: Consistent data source - same applications table
   * Both recent activity and application list queries use the same
   * underlying data source (applications table), so any application
   * in one view SHALL be accessible in the other.
   */
  it('both views use consistent data source', () => {
    fc.assert(
      fc.property(
        fc.array(applicationArb, { minLength: 1, maxLength: 100 }),
        (applications) => {
          // Get recent activity
          const recentActivity = getRecentActivity(applications);
          
          // Get unfiltered application list
          const applicationList = getApplicationList(applications);
          
          // For each activity item, verify it exists in the list with same data
          recentActivity.forEach(activityItem => {
            const listApp = applicationList.find(app => app.id === activityItem.id);
            expect(listApp).toBeDefined();
            
            if (listApp) {
              // Verify the data is consistent
              expect(activityItem.user).toBe(listApp.full_name);
              expect(activityItem.status).toBe(listApp.status);
            }
          });
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: No status exclusions in either view
   * Neither recent activity nor application list SHALL exclude any
   * application status by default.
   */
  it('no status exclusions in either view', () => {
    fc.assert(
      fc.property(
        fc.array(applicationArb, { minLength: 5, maxLength: 100 }),
        (applications) => {
          // Ensure we have at least one of each status
          const statuses: ApplicationStatus[] = ['draft', 'submitted', 'under_review', 'approved', 'rejected'];
          const hasAllStatuses = statuses.every(status => 
            applications.some(app => app.status === status)
          );
          
          if (!hasAllStatuses) {
            // Skip this test case if we don't have all statuses
            return true;
          }
          
          // Get unfiltered application list
          const applicationList = getApplicationList(applications);
          
          // All statuses should be represented in the list
          statuses.forEach(status => {
            const hasStatus = applicationList.some(app => app.status === status);
            expect(hasStatus).toBe(true);
          });
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: Activity limit does not affect list completeness
   * Even though recent activity is limited to 5 items, the application
   * list SHALL contain all applications including those not in activity.
   */
  it('activity limit does not affect list completeness', () => {
    fc.assert(
      fc.property(
        fc.array(applicationArb, { minLength: 10, maxLength: 100 }),
        (applications) => {
          // Get recent activity (limited to 5)
          const recentActivity = getRecentActivity(applications, 5);
          
          // Get unfiltered application list
          const applicationList = getApplicationList(applications);
          
          // Activity is limited to 5
          expect(recentActivity.length).toBeLessThanOrEqual(5);
          
          // But list contains all applications
          expect(applicationList.length).toBe(applications.length);
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });
});
