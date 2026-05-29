/**
 * Property-Based Tests: Payment Gate Enforcement (Property 3)
 * Spec: production-readiness-audit
 * Task: 16.3
 *
 * **Property 3: Payment Gate Enforcement**
 *
 * *For any* application with payment_status not equal to 'verified',
 * attempting to schedule an interview SHALL be rejected.
 *
 * Payment statuses: pending (null), pending_review, verified, rejected
 * Only 'verified' allows interview scheduling.
 *
 * **Validates: Requirements 1.8, 7.1**
 *
 * This test models the payment gate as a pure function and verifies
 * that only verified payments allow interview scheduling, all other
 * statuses are rejected, and the gate is deterministic.
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

const NUM_RUNS = 10;

// ============================================================================
// Types
// ============================================================================

/**
 * All possible payment statuses in the system.
 * null represents an application with no payment record yet (not_paid).
 */
type PaymentStatus = 'pending_review' | 'verified' | 'rejected' | null;

interface InterviewScheduleRequest {
  applicationId: string;
  paymentStatus: PaymentStatus;
  scheduledAt: string;
  mode: 'in_person' | 'virtual' | 'phone';
  location: string;
}

interface GateResult {
  allowed: boolean;
  reason: string;
}

// ============================================================================
// Pure model function — mirrors the payment gate logic
// ============================================================================

/**
 * Pure function that models the payment gate enforcement.
 * This mirrors the check that should exist in handleScheduleInterview:
 * only applications with payment_status === 'verified' can schedule interviews.
 */
function evaluatePaymentGate(paymentStatus: PaymentStatus): GateResult {
  if (paymentStatus === 'verified') {
    return { allowed: true, reason: 'Payment verified' };
  }
  return {
    allowed: false,
    reason: paymentStatus === null
      ? 'No payment submitted'
      : `Payment status is '${paymentStatus}', must be 'verified'`,
  };
}

/**
 * Attempts to schedule an interview, enforcing the payment gate first.
 * Returns the gate result without side effects.
 */
function attemptScheduleInterview(request: InterviewScheduleRequest): GateResult {
  return evaluatePaymentGate(request.paymentStatus);
}

// ============================================================================
// Generators
// ============================================================================

const uuidArb = fc.uuid();

/** All payment statuses including null (no payment) */
const allPaymentStatusArb: fc.Arbitrary<PaymentStatus> = fc.constantFrom(
  'pending_review' as PaymentStatus,
  'verified' as PaymentStatus,
  'rejected' as PaymentStatus,
  null as PaymentStatus,
);

/** Only non-verified payment statuses */
const nonVerifiedPaymentStatusArb: fc.Arbitrary<PaymentStatus> = fc.constantFrom(
  'pending_review' as PaymentStatus,
  'rejected' as PaymentStatus,
  null as PaymentStatus,
);

const interviewModeArb = fc.constantFrom(
  'in_person' as const,
  'virtual' as const,
  'phone' as const,
);

/** Generate a valid ISO datetime string for scheduling */
const scheduledAtArb = fc.integer({
  min: new Date('2025-01-01').getTime(),
  max: new Date('2026-12-31').getTime(),
}).map(ts => new Date(ts).toISOString());

const locationArb = fc.constantFrom(
  'Main Campus - Room 101',
  'Virtual - Zoom Link',
  'Phone Interview',
  'Administration Block - Office 3',
);

const interviewRequestArb = (paymentStatus: fc.Arbitrary<PaymentStatus>) =>
  fc.record({
    applicationId: uuidArb,
    paymentStatus,
    scheduledAt: scheduledAtArb,
    mode: interviewModeArb,
    location: locationArb,
  });

// ============================================================================
// Property 3: Payment Gate Enforcement
// ============================================================================

describe('Property 3: Payment Gate Enforcement', () => {

  // ==========================================================================
  // 3.1: Only 'verified' payment status allows interview scheduling
  // Validates: Requirement 1.8
  // ==========================================================================

  describe('Verified payment allows scheduling', () => {
    it('PROPERTY: applications with verified payment status are always allowed to schedule interviews', () => {
      fc.assert(
        fc.property(
          interviewRequestArb(fc.constant('verified' as PaymentStatus)),
          (request) => {
            const result = attemptScheduleInterview(request);
            expect(result.allowed).toBe(true);
            expect(result.reason).toBe('Payment verified');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // 3.2: All non-verified statuses are rejected
  // Validates: Requirement 7.1
  // ==========================================================================

  describe('Non-verified payment blocks scheduling', () => {
    it('PROPERTY: applications with non-verified payment status are always rejected for interview scheduling', () => {
      fc.assert(
        fc.property(
          interviewRequestArb(nonVerifiedPaymentStatusArb),
          (request) => {
            const result = attemptScheduleInterview(request);
            expect(result.allowed).toBe(false);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: pending_review payment status is rejected', () => {
      fc.assert(
        fc.property(
          interviewRequestArb(fc.constant('pending_review' as PaymentStatus)),
          (request) => {
            const result = attemptScheduleInterview(request);
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('pending_review');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: rejected payment status is rejected', () => {
      fc.assert(
        fc.property(
          interviewRequestArb(fc.constant('rejected' as PaymentStatus)),
          (request) => {
            const result = attemptScheduleInterview(request);
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('rejected');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: null (no payment) status is rejected', () => {
      fc.assert(
        fc.property(
          interviewRequestArb(fc.constant(null as PaymentStatus)),
          (request) => {
            const result = attemptScheduleInterview(request);
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('No payment submitted');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // 3.3: The gate is deterministic
  // Validates: Requirements 1.8, 7.1
  // ==========================================================================

  describe('Payment gate determinism', () => {
    it('PROPERTY: the payment gate produces the same result for the same input every time', () => {
      fc.assert(
        fc.property(
          interviewRequestArb(allPaymentStatusArb),
          (request) => {
            const result1 = attemptScheduleInterview(request);
            const result2 = attemptScheduleInterview(request);
            const result3 = attemptScheduleInterview(request);

            expect(result1.allowed).toBe(result2.allowed);
            expect(result2.allowed).toBe(result3.allowed);
            expect(result1.reason).toBe(result2.reason);
            expect(result2.reason).toBe(result3.reason);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: the gate result depends only on payment_status, not on other request fields', () => {
      fc.assert(
        fc.property(
          allPaymentStatusArb,
          uuidArb,
          uuidArb,
          scheduledAtArb,
          scheduledAtArb,
          interviewModeArb,
          interviewModeArb,
          (status, appId1, appId2, time1, time2, mode1, mode2) => {
            const result1 = attemptScheduleInterview({
              applicationId: appId1,
              paymentStatus: status,
              scheduledAt: time1,
              mode: mode1,
              location: 'Location A',
            });
            const result2 = attemptScheduleInterview({
              applicationId: appId2,
              paymentStatus: status,
              scheduledAt: time2,
              mode: mode2,
              location: 'Location B',
            });

            expect(result1.allowed).toBe(result2.allowed);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // 3.4: Exactly one status allows scheduling
  // Validates: Requirements 1.8, 7.1
  // ==========================================================================

  describe('Exhaustive status coverage', () => {
    it('PROPERTY: for any payment status, the gate returns allowed=true if and only if status is verified', () => {
      fc.assert(
        fc.property(
          allPaymentStatusArb,
          (status) => {
            const result = evaluatePaymentGate(status);
            expect(result.allowed).toBe(status === 'verified');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: the gate always returns a non-empty reason string', () => {
      fc.assert(
        fc.property(
          allPaymentStatusArb,
          (status) => {
            const result = evaluatePaymentGate(status);
            expect(typeof result.reason).toBe('string');
            expect(result.reason.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });
});
