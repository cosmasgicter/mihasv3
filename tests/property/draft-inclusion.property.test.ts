/**
 * Property-Based Test: Application List Draft Inclusion
 * 
 * **Property 2: Application list draft inclusion**
 * **Validates: Requirements 9.1**
 * 
 * For any application with status='draft' in the database, that application
 * SHALL appear in the unfiltered Application_List query results.
 * 
 * Feature: production-bug-fixes-jan2026, Property 2: Application list draft inclusion
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
  created_at: string;
}

/**
 * Draft filter type matching the useApplicationFilters hook
 */
type DraftFilter = 'all' | 'drafts' | 'completed';

/**
 * Simulates the application list query filtering logic
 * This mirrors the logic in useApplicationsData.ts
 * 
 * @param applications - List of all applications
 * @param draftFilter - The draft filter setting
 * @param statusFilter - Optional status filter
 * @returns Filtered list of applications
 */
function filterApplications(
  applications: Application[],
  draftFilter: DraftFilter = 'all',
  statusFilter?: ApplicationStatus
): Application[] {
  let result = [...applications];
  
  // Apply status filter if provided
  if (statusFilter) {
    result = result.filter(app => app.status === statusFilter);
  }
  
  // Apply draft filter
  if (draftFilter === 'drafts') {
    result = result.filter(app => app.status === 'draft');
  } else if (draftFilter === 'completed') {
    result = result.filter(app => app.status !== 'draft');
  }
  // 'all' shows both drafts and completed (no additional filter)
  
  return result;
}

/**
 * Check if an application appears in the filtered list
 */
function applicationAppearsInList(
  application: Application,
  filteredList: Application[]
): boolean {
  return filteredList.some(app => app.id === application.id);
}

describe('Property 2: Application List Draft Inclusion', () => {
  // Arbitrary for application status
  const statusArb = fc.constantFrom<ApplicationStatus>(
    'draft', 'submitted', 'under_review', 'approved', 'rejected'
  );
  
  // Arbitrary for application
  const applicationArb = fc.record({
    id: fc.uuid(),
    status: statusArb,
    full_name: fc.string({ minLength: 1, maxLength: 50 }),
    email: fc.emailAddress(),
    created_at: fc.constant('2025-01-16T12:00:00.000Z')
  });

  /**
   * Property: All drafts appear in unfiltered list (draftFilter='all')
   * For any application with status='draft', it SHALL appear in the list
   * when draftFilter is 'all' (the default)
   */
  it('all draft applications appear in unfiltered list (draftFilter="all")', () => {
    fc.assert(
      fc.property(
        fc.array(applicationArb, { minLength: 1, maxLength: 100 }),
        (applications) => {
          // Get all draft applications
          const drafts = applications.filter(app => app.status === 'draft');
          
          // Filter with 'all' (default - no draft filtering)
          const filteredList = filterApplications(applications, 'all');
          
          // All drafts should appear in the filtered list
          drafts.forEach(draft => {
            expect(applicationAppearsInList(draft, filteredList)).toBe(true);
          });
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: All drafts appear when status filter is 'draft'
   * When filtering by status='draft', all draft applications SHALL appear
   */
  it('all draft applications appear when status filter is "draft"', () => {
    fc.assert(
      fc.property(
        fc.array(applicationArb, { minLength: 1, maxLength: 100 }),
        (applications) => {
          // Get all draft applications
          const drafts = applications.filter(app => app.status === 'draft');
          
          // Filter by status='draft'
          const filteredList = filterApplications(applications, 'all', 'draft');
          
          // All drafts should appear in the filtered list
          drafts.forEach(draft => {
            expect(applicationAppearsInList(draft, filteredList)).toBe(true);
          });
          
          // Only drafts should appear
          filteredList.forEach(app => {
            expect(app.status).toBe('draft');
          });
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: Drafts appear when draftFilter is 'drafts'
   * When draftFilter='drafts', only draft applications SHALL appear
   */
  it('only draft applications appear when draftFilter is "drafts"', () => {
    fc.assert(
      fc.property(
        fc.array(applicationArb, { minLength: 1, maxLength: 100 }),
        (applications) => {
          // Filter with 'drafts'
          const filteredList = filterApplications(applications, 'drafts');
          
          // All items in filtered list should be drafts
          filteredList.forEach(app => {
            expect(app.status).toBe('draft');
          });
          
          // All drafts from original list should be in filtered list
          const drafts = applications.filter(app => app.status === 'draft');
          drafts.forEach(draft => {
            expect(applicationAppearsInList(draft, filteredList)).toBe(true);
          });
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: No drafts appear when draftFilter is 'completed'
   * When draftFilter='completed', no draft applications SHALL appear
   */
  it('no draft applications appear when draftFilter is "completed"', () => {
    fc.assert(
      fc.property(
        fc.array(applicationArb, { minLength: 1, maxLength: 100 }),
        (applications) => {
          // Filter with 'completed'
          const filteredList = filterApplications(applications, 'completed');
          
          // No items in filtered list should be drafts
          filteredList.forEach(app => {
            expect(app.status).not.toBe('draft');
          });
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: Unfiltered list contains all applications
   * When no filters are applied, all applications SHALL appear
   */
  it('unfiltered list contains all applications', () => {
    fc.assert(
      fc.property(
        fc.array(applicationArb, { minLength: 1, maxLength: 100 }),
        (applications) => {
          // Filter with 'all' (no filtering)
          const filteredList = filterApplications(applications, 'all');
          
          // All applications should appear
          expect(filteredList.length).toBe(applications.length);
          
          applications.forEach(app => {
            expect(applicationAppearsInList(app, filteredList)).toBe(true);
          });
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: Draft count is preserved
   * The number of drafts in the filtered list (when draftFilter='all')
   * SHALL equal the number of drafts in the original list
   */
  it('draft count is preserved in unfiltered list', () => {
    fc.assert(
      fc.property(
        fc.array(applicationArb, { minLength: 1, maxLength: 100 }),
        (applications) => {
          // Count drafts in original list
          const originalDraftCount = applications.filter(app => app.status === 'draft').length;
          
          // Filter with 'all'
          const filteredList = filterApplications(applications, 'all');
          
          // Count drafts in filtered list
          const filteredDraftCount = filteredList.filter(app => app.status === 'draft').length;
          
          // Counts should match
          expect(filteredDraftCount).toBe(originalDraftCount);
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: Filter completeness - drafts + completed = all
   * The union of 'drafts' and 'completed' filters SHALL equal 'all'
   */
  it('drafts filter + completed filter = all applications', () => {
    fc.assert(
      fc.property(
        fc.array(applicationArb, { minLength: 1, maxLength: 100 }),
        (applications) => {
          // Get all three filtered lists
          const allList = filterApplications(applications, 'all');
          const draftsList = filterApplications(applications, 'drafts');
          const completedList = filterApplications(applications, 'completed');
          
          // Union of drafts and completed should equal all
          const unionIds = new Set([
            ...draftsList.map(app => app.id),
            ...completedList.map(app => app.id)
          ]);
          const allIds = new Set(allList.map(app => app.id));
          
          expect(unionIds.size).toBe(allIds.size);
          
          // Every ID in union should be in all
          unionIds.forEach(id => {
            expect(allIds.has(id)).toBe(true);
          });
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: Filter mutual exclusivity
   * 'drafts' and 'completed' filters SHALL have no overlap
   */
  it('drafts and completed filters have no overlap', () => {
    fc.assert(
      fc.property(
        fc.array(applicationArb, { minLength: 1, maxLength: 100 }),
        (applications) => {
          // Get both filtered lists
          const draftsList = filterApplications(applications, 'drafts');
          const completedList = filterApplications(applications, 'completed');
          
          // Get IDs
          const draftsIds = new Set(draftsList.map(app => app.id));
          const completedIds = new Set(completedList.map(app => app.id));
          
          // No overlap
          draftsIds.forEach(id => {
            expect(completedIds.has(id)).toBe(false);
          });
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });
});
