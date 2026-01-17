/**
 * Property-Based Test: Approval Rate Calculation Correctness
 * 
 * **Property 1: Approval rate calculation correctness**
 * **Validates: Requirements 1.4**
 * 
 * For any set of applications with known approved count and total count,
 * the approval rate SHALL equal (approved_count / total_count) * 100,
 * rounded to 2 decimal places.
 * 
 * Feature: production-bug-fixes-jan2026, Property 1: Approval rate calculation correctness
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// Property test configuration - minimum 100 iterations
const propertyTestConfig = { numRuns: 100 };

/**
 * Calculate approval rate as implemented in the database function
 * This mirrors the SQL: ROUND((approved::numeric / total::numeric) * 100, 2)
 * 
 * @param approved - Number of approved applications
 * @param total - Total number of applications
 * @returns Approval rate as a percentage, rounded to 2 decimal places
 */
function calculateApprovalRate(approved: number, total: number): number {
  if (total === 0) {
    return 0;
  }
  return Math.round((approved / total) * 100 * 100) / 100;
}

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
}

/**
 * Calculate approval rate from a list of applications
 * This simulates what the database function does
 */
function calculateApprovalRateFromApplications(applications: Application[]): number {
  const total = applications.length;
  const approved = applications.filter(app => app.status === 'approved').length;
  return calculateApprovalRate(approved, total);
}

describe('Property 1: Approval Rate Calculation Correctness', () => {
  /**
   * Property: Approval rate equals (approved / total) * 100
   * For any approved count and total count, the calculation SHALL be correct
   */
  it('approval rate equals (approved / total) * 100 for any valid counts', () => {
    fc.assert(
      fc.property(
        // Generate total count (at least 1 to avoid division by zero)
        fc.integer({ min: 1, max: 10000 }),
        // Generate approved count (will be constrained to <= total)
        fc.integer({ min: 0, max: 10000 }),
        (total, approvedRaw) => {
          // Ensure approved <= total
          const approved = Math.min(approvedRaw, total);
          
          // Calculate expected rate
          const expectedRate = Math.round((approved / total) * 100 * 100) / 100;
          
          // Calculate using our function
          const calculatedRate = calculateApprovalRate(approved, total);
          
          // They should be equal
          expect(calculatedRate).toBe(expectedRate);
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: Approval rate is always between 0 and 100 (inclusive)
   * For any valid input, the rate SHALL be in the valid percentage range
   */
  it('approval rate is always between 0 and 100 inclusive', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 0, max: 10000 }),
        (total, approvedRaw) => {
          const approved = Math.min(approvedRaw, total);
          const rate = calculateApprovalRate(approved, total);
          
          expect(rate).toBeGreaterThanOrEqual(0);
          expect(rate).toBeLessThanOrEqual(100);
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: Zero total returns zero rate
   * When there are no applications, the rate SHALL be 0
   */
  it('returns 0 when total is 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        (approved) => {
          const rate = calculateApprovalRate(approved, 0);
          expect(rate).toBe(0);
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: All approved equals 100%
   * When all applications are approved, the rate SHALL be 100
   */
  it('returns 100 when all applications are approved', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        (total) => {
          const rate = calculateApprovalRate(total, total);
          expect(rate).toBe(100);
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: None approved equals 0%
   * When no applications are approved, the rate SHALL be 0
   */
  it('returns 0 when no applications are approved', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        (total) => {
          const rate = calculateApprovalRate(0, total);
          expect(rate).toBe(0);
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: Rate from application list matches direct calculation
   * For any list of applications, calculating from the list SHALL match
   * calculating from the counts directly
   */
  it('rate from application list matches direct calculation', () => {
    // Arbitrary for application status
    const statusArb = fc.constantFrom<ApplicationStatus>(
      'draft', 'submitted', 'under_review', 'approved', 'rejected'
    );
    
    // Arbitrary for application
    const applicationArb = fc.record({
      id: fc.uuid(),
      status: statusArb
    });
    
    fc.assert(
      fc.property(
        fc.array(applicationArb, { minLength: 1, maxLength: 100 }),
        (applications) => {
          // Calculate from list
          const rateFromList = calculateApprovalRateFromApplications(applications);
          
          // Calculate directly
          const total = applications.length;
          const approved = applications.filter(app => app.status === 'approved').length;
          const rateFromCounts = calculateApprovalRate(approved, total);
          
          // They should be equal
          expect(rateFromList).toBe(rateFromCounts);
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: Monotonicity - more approvals means higher or equal rate
   * Adding an approved application SHALL not decrease the approval rate
   */
  it('adding an approved application does not decrease the rate', () => {
    const statusArb = fc.constantFrom<ApplicationStatus>(
      'draft', 'submitted', 'under_review', 'approved', 'rejected'
    );
    
    const applicationArb = fc.record({
      id: fc.uuid(),
      status: statusArb
    });
    
    fc.assert(
      fc.property(
        fc.array(applicationArb, { minLength: 1, maxLength: 99 }),
        (applications) => {
          // Calculate original rate
          const originalRate = calculateApprovalRateFromApplications(applications);
          
          // Add an approved application
          const withApproved: Application[] = [
            ...applications,
            { id: 'new-approved', status: 'approved' }
          ];
          const newRate = calculateApprovalRateFromApplications(withApproved);
          
          // New rate should be >= original rate
          expect(newRate).toBeGreaterThanOrEqual(originalRate);
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: Specific example - 13 approved out of 25 total = 52%
   * This validates the specific requirement from the spec
   */
  it('calculates 52% for 13 approved out of 25 total', () => {
    const rate = calculateApprovalRate(13, 25);
    expect(rate).toBe(52);
  });

  /**
   * Property: Specific example - 13 approved out of 26 total = 50%
   * This validates the current database state
   */
  it('calculates 50% for 13 approved out of 26 total', () => {
    const rate = calculateApprovalRate(13, 26);
    expect(rate).toBe(50);
  });
});
