/**
 * Property-Based Tests: Interview Slot Uniqueness (Property 13)
 * Spec: production-readiness-audit
 * Task: 17.3
 *
 * **Property 13: Interview Slot Uniqueness**
 *
 * *For any* interview slot, only one student SHALL be able to book it —
 * concurrent booking attempts SHALL result in exactly one success.
 *
 * The system enforces this via:
 * - A double-booking prevention check before scheduling
 * - Database constraint `idx_application_interviews_active_unique`
 *   ensuring at most one active interview per application
 *
 * This test models the booking logic as pure functions with an in-memory
 * state, simulates concurrent booking attempts, and verifies:
 * - Exactly one booking succeeds per application
 * - The booking state is consistent after concurrent attempts
 * - An application can only have one active interview
 *
 * **Validates: Requirements 7.4**
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

const NUM_RUNS = 10;

// ============================================================================
// Types
// ============================================================================

type InterviewStatus = 'scheduled' | 'rescheduled' | 'completed' | 'no_show' | 'cancelled';

interface InterviewRecord {
  id: string;
  applicationId: string;
  scheduledAt: string;
  mode: 'in_person' | 'virtual' | 'phone';
  location: string;
  status: InterviewStatus;
}

interface BookingRequest {
  applicationId: string;
  scheduledAt: string;
  mode: 'in_person' | 'virtual' | 'phone';
  location: string;
}

interface BookingResult {
  success: boolean;
  reason: string;
  interview?: InterviewRecord;
}

// ============================================================================
// In-memory interview store — models the DB + unique constraint
// ============================================================================

class InterviewStore {
  private interviews: Map<string, InterviewRecord> = new Map();
  private nextId = 1;

  /**
   * Attempts to book an interview for an application.
   * Models the double-booking prevention check + unique constraint:
   * only one active (scheduled | rescheduled) interview per application.
   */
  book(request: BookingRequest): BookingResult {
    // Double-booking prevention: check for existing active interview
    const existing = this.getActiveInterview(request.applicationId);
    if (existing) {
      return {
        success: false,
        reason: `Application ${request.applicationId} already has an active interview (${existing.id})`,
      };
    }

    const id = `interview-${this.nextId++}`;
    const record: InterviewRecord = {
      id,
      applicationId: request.applicationId,
      scheduledAt: request.scheduledAt,
      mode: request.mode,
      location: request.location,
      status: 'scheduled',
    };

    this.interviews.set(id, record);
    return { success: true, reason: 'Interview scheduled', interview: record };
  }

  /** Returns the active interview for an application, if any. */
  getActiveInterview(applicationId: string): InterviewRecord | undefined {
    for (const interview of this.interviews.values()) {
      if (
        interview.applicationId === applicationId &&
        (interview.status === 'scheduled' || interview.status === 'rescheduled')
      ) {
        return interview;
      }
    }
    return undefined;
  }

  /** Returns all interviews for an application. */
  getInterviewsForApplication(applicationId: string): InterviewRecord[] {
    return Array.from(this.interviews.values()).filter(
      (i) => i.applicationId === applicationId
    );
  }

  /** Count of active interviews across all applications. */
  get activeCount(): number {
    let count = 0;
    for (const interview of this.interviews.values()) {
      if (interview.status === 'scheduled' || interview.status === 'rescheduled') {
        count++;
      }
    }
    return count;
  }

  /** Cancel an active interview (allows rebooking). */
  cancel(interviewId: string): boolean {
    const interview = this.interviews.get(interviewId);
    if (!interview) return false;
    if (interview.status !== 'scheduled' && interview.status !== 'rescheduled') return false;
    interview.status = 'cancelled';
    return true;
  }

  /** Complete an interview (allows rebooking). */
  complete(interviewId: string): boolean {
    const interview = this.interviews.get(interviewId);
    if (!interview) return false;
    if (interview.status !== 'scheduled' && interview.status !== 'rescheduled') return false;
    interview.status = 'completed';
    return true;
  }
}

/**
 * Simulates concurrent booking attempts by processing all requests
 * sequentially against the same store (models serialized DB transactions).
 * Returns the array of results in order.
 */
function simulateConcurrentBookings(
  store: InterviewStore,
  requests: BookingRequest[]
): BookingResult[] {
  return requests.map((req) => store.book(req));
}

// ============================================================================
// Generators
// ============================================================================

const applicationIdArb = fc.stringMatching(/^app-[0-9a-f]{8}$/);

const interviewModeArb = fc.constantFrom(
  'in_person' as const,
  'virtual' as const,
  'phone' as const,
);

const scheduledAtArb = fc
  .integer({ min: new Date('2025-01-01').getTime(), max: new Date('2026-12-31').getTime() })
  .map((ts) => new Date(ts).toISOString());

const locationArb = fc.constantFrom(
  'Main Campus - Room 101',
  'Virtual - Zoom Link',
  'Phone Interview',
  'Administration Block - Office 3',
);

const bookingRequestArb = (appId: fc.Arbitrary<string>): fc.Arbitrary<BookingRequest> =>
  fc.record({
    applicationId: appId,
    scheduledAt: scheduledAtArb,
    mode: interviewModeArb,
    location: locationArb,
  });

// ============================================================================
// Property 13: Interview Slot Uniqueness
// ============================================================================

describe('Property 13: Interview Slot Uniqueness', () => {

  // ==========================================================================
  // 13.1: Concurrent bookings for the same application yield exactly one success
  // Validates: Requirement 7.4
  // ==========================================================================

  describe('Concurrent booking for same application', () => {
    it('PROPERTY: concurrent booking attempts for the same application result in exactly one success', () => {
      fc.assert(
        fc.property(
          applicationIdArb,
          fc.integer({ min: 2, max: 6 }),
          (appId, attemptCount) => {
            const store = new InterviewStore();

            // Generate N booking requests all targeting the same application
            const requests: BookingRequest[] = Array.from({ length: attemptCount }, (_, i) => ({
              applicationId: appId,
              scheduledAt: new Date(2025, 6, 1 + i, 10, 0).toISOString(),
              mode: 'in_person' as const,
              location: `Room ${i + 1}`,
            }));

            const results = simulateConcurrentBookings(store, requests);

            const successes = results.filter((r) => r.success);
            const failures = results.filter((r) => !r.success);

            // Exactly one booking succeeds
            expect(successes).toHaveLength(1);
            // All others fail
            expect(failures).toHaveLength(attemptCount - 1);
            // The successful booking created an interview record
            expect(successes[0].interview).toBeDefined();
            expect(successes[0].interview!.applicationId).toBe(appId);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // 13.2: Each application has at most one active interview
  // Validates: Requirement 7.4
  // ==========================================================================

  describe('At most one active interview per application', () => {
    it('PROPERTY: after any number of booking attempts, each application has at most one active interview', () => {
      fc.assert(
        fc.property(
          fc.array(bookingRequestArb(applicationIdArb), { minLength: 1, maxLength: 10 }),
          (requests) => {
            const store = new InterviewStore();
            simulateConcurrentBookings(store, requests);

            // Collect unique application IDs
            const appIds = new Set(requests.map((r) => r.applicationId));

            for (const appId of appIds) {
              const activeInterviews = store
                .getInterviewsForApplication(appId)
                .filter((i) => i.status === 'scheduled' || i.status === 'rescheduled');

              expect(activeInterviews.length).toBeLessThanOrEqual(1);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // 13.3: Booking state is consistent after concurrent attempts
  // Validates: Requirement 7.4
  // ==========================================================================

  describe('Booking state consistency', () => {
    it('PROPERTY: the total active interview count equals the number of distinct applications that were successfully booked', () => {
      fc.assert(
        fc.property(
          fc.array(bookingRequestArb(applicationIdArb), { minLength: 1, maxLength: 12 }),
          (requests) => {
            const store = new InterviewStore();
            const results = simulateConcurrentBookings(store, requests);

            const successfulAppIds = new Set(
              results
                .filter((r) => r.success && r.interview)
                .map((r) => r.interview!.applicationId)
            );

            expect(store.activeCount).toBe(successfulAppIds.size);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: every successful booking has a corresponding active interview in the store', () => {
      fc.assert(
        fc.property(
          fc.array(bookingRequestArb(applicationIdArb), { minLength: 1, maxLength: 10 }),
          (requests) => {
            const store = new InterviewStore();
            const results = simulateConcurrentBookings(store, requests);

            for (const result of results) {
              if (result.success && result.interview) {
                const active = store.getActiveInterview(result.interview.applicationId);
                expect(active).toBeDefined();
                expect(active!.id).toBe(result.interview.id);
              }
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // 13.4: Rebooking after cancellation allows exactly one new booking
  // Validates: Requirement 7.4
  // ==========================================================================

  describe('Rebooking after cancellation', () => {
    it('PROPERTY: after cancelling an active interview, a new booking for the same application succeeds', () => {
      fc.assert(
        fc.property(
          applicationIdArb,
          scheduledAtArb,
          scheduledAtArb,
          interviewModeArb,
          (appId, time1, time2, mode) => {
            const store = new InterviewStore();

            // First booking succeeds
            const first = store.book({
              applicationId: appId,
              scheduledAt: time1,
              mode,
              location: 'Room A',
            });
            expect(first.success).toBe(true);

            // Second booking fails (active interview exists)
            const blocked = store.book({
              applicationId: appId,
              scheduledAt: time2,
              mode,
              location: 'Room B',
            });
            expect(blocked.success).toBe(false);

            // Cancel the first interview
            store.cancel(first.interview!.id);

            // Now a new booking succeeds
            const rebooked = store.book({
              applicationId: appId,
              scheduledAt: time2,
              mode,
              location: 'Room B',
            });
            expect(rebooked.success).toBe(true);
            expect(rebooked.interview!.applicationId).toBe(appId);

            // Only one active interview exists
            const actives = store
              .getInterviewsForApplication(appId)
              .filter((i) => i.status === 'scheduled' || i.status === 'rescheduled');
            expect(actives).toHaveLength(1);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // 13.5: Different applications can book independently
  // Validates: Requirement 7.4
  // ==========================================================================

  describe('Independent application bookings', () => {
    it('PROPERTY: distinct applications can each book one interview independently', () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(applicationIdArb, { minLength: 2, maxLength: 6 }),
          scheduledAtArb,
          interviewModeArb,
          (appIds, time, mode) => {
            const store = new InterviewStore();

            const results = appIds.map((appId) =>
              store.book({
                applicationId: appId,
                scheduledAt: time,
                mode,
                location: 'Shared Room',
              })
            );

            // All bookings succeed since they are for different applications
            for (const result of results) {
              expect(result.success).toBe(true);
            }

            // Active count matches number of distinct applications
            expect(store.activeCount).toBe(appIds.length);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });
});
