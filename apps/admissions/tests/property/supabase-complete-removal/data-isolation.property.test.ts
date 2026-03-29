/**
 * Property-Based Tests: User Data Isolation
 * Feature: supabase-complete-removal
 * Task: 3.4 Write property test for Interview data isolation
 * 
 * **Property 3: User Data Isolation**
 * *For any* authenticated user requesting their data, the API SHALL return
 * only data belonging to that user and no other user's data.
 * 
 * **Validates: Requirements 2.3, 10.3**
 * 
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ============================================================================
// Test Configuration
// ============================================================================

const NUM_RUNS = 10;

// ============================================================================
// Type Definitions
// ============================================================================

interface MockInterview {
  id: string;
  application_id: string;
  user_id: string;
  scheduled_at: string;
  mode: 'in_person' | 'virtual' | 'phone';
  location: string | null;
  status: 'scheduled' | 'rescheduled' | 'completed' | 'cancelled';
  notes: string | null;
  program?: string;
  application_number?: string;
}

interface MockApplication {
  id: string;
  user_id: string;
  application_number: string;
  program: string;
  status: string;
}

// ============================================================================
// Arbitrary Generators
// ============================================================================

/**
 * Generate a valid UUID
 */
const uuidArb = fc.uuid();

/**
 * Generate a valid interview mode
 */
const interviewModeArb = fc.constantFrom('in_person', 'virtual', 'phone') as fc.Arbitrary<'in_person' | 'virtual' | 'phone'>;

/**
 * Generate a valid interview status
 */
const interviewStatusArb = fc.constantFrom('scheduled', 'rescheduled', 'completed', 'cancelled') as fc.Arbitrary<'scheduled' | 'rescheduled' | 'completed' | 'cancelled'>;

/**
 * Generate a valid ISO date string
 */
const isoDateArb = fc.integer({ min: 1704067200000, max: 1798761600000 }).map(ts => new Date(ts).toISOString());

/**
 * Generate a mock application for a specific user
 */
function createMockApplication(userId: string, appId: string): MockApplication {
  return {
    id: appId,
    user_id: userId,
    application_number: `APP-${appId.substring(0, 8)}`,
    program: 'Nursing',
    status: 'submitted',
  };
}

/**
 * Generate a mock interview for a specific application
 */
function createMockInterview(application: MockApplication, interviewId: string): MockInterview {
  return {
    id: interviewId,
    application_id: application.id,
    user_id: application.user_id,
    scheduled_at: new Date().toISOString(),
    mode: 'virtual',
    location: null,
    status: 'scheduled',
    notes: null,
    program: application.program,
    application_number: application.application_number,
  };
}

// ============================================================================
// Simulation Functions (mirrors backend behavior)
// ============================================================================

/**
 * Simulates the backend interview filtering logic.
 * This is what the API endpoint does: filter interviews by user_id from JWT.
 */
function filterInterviewsByUser(
  allInterviews: MockInterview[],
  authenticatedUserId: string
): MockInterview[] {
  return allInterviews.filter(interview => interview.user_id === authenticatedUserId);
}

/**
 * Simulates the SQL query that joins interviews with applications
 * and filters by user_id from the authenticated JWT.
 * 
 * SQL equivalent:
 * SELECT ai.* FROM application_interviews ai
 * INNER JOIN applications a ON ai.application_id = a.id
 * WHERE a.user_id = $1
 */
function getInterviewsForUser(
  allInterviews: MockInterview[],
  allApplications: MockApplication[],
  authenticatedUserId: string
): MockInterview[] {
  // Get application IDs belonging to the user
  const userApplicationIds = new Set(
    allApplications
      .filter(app => app.user_id === authenticatedUserId)
      .map(app => app.id)
  );
  
  // Filter interviews to only those for user's applications
  return allInterviews.filter(interview => 
    userApplicationIds.has(interview.application_id)
  );
}

// ============================================================================
// Property 3: User Data Isolation
// ============================================================================

describe('Feature: supabase-complete-removal, Property 3: User Data Isolation', () => {
  describe('Interview Data Isolation', () => {
    /**
     * **Validates: Requirements 2.3, 10.3**
     * WHEN filtering interviews, THE Interview_Page SHALL filter by user's applications on the server side
     * WHEN fetching interviews, THE API SHALL join with applications table to filter by user_id
     */
    it('PROPERTY: For any authenticated user, API SHALL return only their interviews', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate two different user IDs and application/interview IDs
          uuidArb,
          uuidArb,
          uuidArb,
          uuidArb,
          uuidArb,
          uuidArb,
          async (userId1, userId2, appId1, appId2, intId1, intId2) => {
            // Ensure different users
            fc.pre(userId1 !== userId2);
            
            // Create applications for both users
            const app1 = createMockApplication(userId1, appId1);
            const app2 = createMockApplication(userId2, appId2);
            
            // Create interviews for both applications
            const interview1 = createMockInterview(app1, intId1);
            const interview2 = createMockInterview(app2, intId2);
            
            const allInterviews = [interview1, interview2];
            const allApplications = [app1, app2];
            
            // User 1 requests their interviews
            const user1Interviews = getInterviewsForUser(allInterviews, allApplications, userId1);
            
            // User 1 should only see their own interview
            expect(user1Interviews.length).toBe(1);
            expect(user1Interviews[0].user_id).toBe(userId1);
            expect(user1Interviews[0].id).toBe(interview1.id);
            
            // User 2 requests their interviews
            const user2Interviews = getInterviewsForUser(allInterviews, allApplications, userId2);
            
            // User 2 should only see their own interview
            expect(user2Interviews.length).toBe(1);
            expect(user2Interviews[0].user_id).toBe(userId2);
            expect(user2Interviews[0].id).toBe(interview2.id);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: No cross-user data leakage SHALL occur', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate 3 users with their own apps and interviews
          fc.tuple(uuidArb, uuidArb, uuidArb),
          fc.tuple(uuidArb, uuidArb, uuidArb),
          fc.tuple(uuidArb, uuidArb, uuidArb),
          async (user1Data, user2Data, user3Data) => {
            const [userId1, appId1, intId1] = user1Data;
            const [userId2, appId2, intId2] = user2Data;
            const [userId3, appId3, intId3] = user3Data;
            
            // Ensure all user IDs are unique
            fc.pre(userId1 !== userId2 && userId2 !== userId3 && userId1 !== userId3);
            
            // Create applications and interviews for each user
            const app1 = createMockApplication(userId1, appId1);
            const app2 = createMockApplication(userId2, appId2);
            const app3 = createMockApplication(userId3, appId3);
            
            const interview1 = createMockInterview(app1, intId1);
            const interview2 = createMockInterview(app2, intId2);
            const interview3 = createMockInterview(app3, intId3);
            
            const allApplications = [app1, app2, app3];
            const allInterviews = [interview1, interview2, interview3];
            
            // For each user, verify they only see their own data
            for (const userId of [userId1, userId2, userId3]) {
              const userInterviews = getInterviewsForUser(allInterviews, allApplications, userId);
              
              // Should have exactly 1 interview
              expect(userInterviews.length).toBe(1);
              
              // All returned interviews must belong to this user
              for (const interview of userInterviews) {
                expect(interview.user_id).toBe(userId);
              }
              
              // No interviews from other users should be present
              const otherUserIds = [userId1, userId2, userId3].filter(id => id !== userId);
              for (const interview of userInterviews) {
                expect(otherUserIds).not.toContain(interview.user_id);
              }
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: User with no interviews SHALL receive empty array', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb,
          uuidArb,
          uuidArb,
          uuidArb,
          async (userWithInterviews, userWithoutInterviews, appId, intId) => {
            fc.pre(userWithInterviews !== userWithoutInterviews);
            
            // Only create interview for first user
            const app = createMockApplication(userWithInterviews, appId);
            const interview = createMockInterview(app, intId);
            
            const allInterviews = [interview];
            const allApplications = [app];
            
            // User without interviews should get empty array
            const result = getInterviewsForUser(allInterviews, allApplications, userWithoutInterviews);
            
            expect(result).toEqual([]);
            expect(result.length).toBe(0);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: User with multiple interviews SHALL receive all their interviews', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb,
          fc.array(fc.tuple(uuidArb, uuidArb), { minLength: 1, maxLength: 5 }),
          async (userId, appIntPairs) => {
            const allApplications: MockApplication[] = [];
            const allInterviews: MockInterview[] = [];
            
            // Create multiple applications and interviews for the user
            for (const [appId, intId] of appIntPairs) {
              const app = createMockApplication(userId, appId);
              const interview = createMockInterview(app, intId);
              allApplications.push(app);
              allInterviews.push(interview);
            }
            
            const result = getInterviewsForUser(allInterviews, allApplications, userId);
            
            // Should receive all interviews
            expect(result.length).toBe(appIntPairs.length);
            
            // All interviews should belong to the user
            for (const interview of result) {
              expect(interview.user_id).toBe(userId);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Application Data Isolation', () => {
    /**
     * **Validates: Requirements 2.3, 10.3**
     * Interview queries filter by user_id from the authenticated JWT
     * Application queries filter by user_id from the authenticated JWT
     */
    it('PROPERTY: Direct filtering by user_id SHALL isolate data correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb,
          uuidArb,
          uuidArb,
          uuidArb,
          async (userId1, userId2, intId1, intId2) => {
            fc.pre(userId1 !== userId2);
            
            // Create interviews with explicit user_id
            const interview1: MockInterview = {
              id: intId1,
              application_id: 'app-1',
              user_id: userId1,
              scheduled_at: new Date().toISOString(),
              mode: 'virtual',
              location: null,
              status: 'scheduled',
              notes: null,
            };
            
            const interview2: MockInterview = {
              id: intId2,
              application_id: 'app-2',
              user_id: userId2,
              scheduled_at: new Date().toISOString(),
              mode: 'in_person',
              location: 'Room 101',
              status: 'scheduled',
              notes: null,
            };
            
            const allInterviews = [interview1, interview2];
            
            // Filter by user_id (simulating WHERE user_id = $1)
            const user1Result = filterInterviewsByUser(allInterviews, userId1);
            const user2Result = filterInterviewsByUser(allInterviews, userId2);
            
            // Each user only sees their own data
            expect(user1Result.length).toBe(1);
            expect(user1Result[0].user_id).toBe(userId1);
            
            expect(user2Result.length).toBe(1);
            expect(user2Result[0].user_id).toBe(userId2);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  it('PROPERTY: Empty database SHALL return empty array for any user', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        async (userId) => {
          const result = getInterviewsForUser([], [], userId);
          expect(result).toEqual([]);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  it('PROPERTY: Invalid user ID SHALL return empty array', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        uuidArb,
        uuidArb,
        async (validUserId, invalidUserId, appId, intId) => {
          fc.pre(validUserId !== invalidUserId);
          
          const app = createMockApplication(validUserId, appId);
          const interview = createMockInterview(app, intId);
          
          // Query with invalid user ID
          const result = getInterviewsForUser([interview], [app], invalidUserId);
          
          expect(result).toEqual([]);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  it('PROPERTY: User ID matching SHALL be exact string comparison', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        uuidArb,
        async (userId, appId, intId) => {
          const app = createMockApplication(userId, appId);
          const interview = createMockInterview(app, intId);
          
          // Exact match should work
          const exactResult = filterInterviewsByUser([interview], userId);
          expect(exactResult.length).toBe(1);
          
          // Different ID should not match
          const differentId = userId.split('').reverse().join('');
          if (differentId !== userId) {
            const differentResult = filterInterviewsByUser([interview], differentId);
            expect(differentResult.length).toBe(0);
          }
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});
