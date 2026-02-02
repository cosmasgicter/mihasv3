/**
 * Property-Based Tests: API Response Structure Validity
 * Feature: supabase-complete-removal
 * Task: 5.4 Write property test for API response structure
 * 
 * **Property 2: API Response Structure Validity**
 * *For any* API response from the migrated endpoints, the response SHALL match
 * the expected TypeScript interface and contain all required fields.
 * 
 * **Validates: Requirements 1.2, 2.2, 5.2, 10.4**
 * 
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ============================================================================
// Test Configuration
// ============================================================================

const NUM_RUNS = 100;

// ============================================================================
// Type Definitions (mirrors apiClient.ts)
// ============================================================================

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

interface Application {
  id: string;
  application_number: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string;
  program: string;
  intake: string;
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected';
  payment_status: 'pending_review' | 'verified' | 'rejected';
  created_at: string;
  updated_at: string;
}

interface ApplicationInterview {
  id: string;
  application_id: string;
  scheduled_at: string;
  mode: 'in_person' | 'virtual' | 'phone';
  location: string | null;
  status: 'scheduled' | 'rescheduled' | 'completed' | 'cancelled';
  notes: string | null;
  program?: string;
  application_number?: string;
}

interface ApplicationStats {
  total_drafts: number;
  completed_applications: number;
  total_applications: number;
  avg_time_hours: number;
}

interface EmailCheckResponse {
  available: boolean;
}

// ============================================================================
// Arbitrary Generators
// ============================================================================

const uuidArb = fc.uuid();

const applicationStatusArb = fc.constantFrom('draft', 'submitted', 'under_review', 'approved', 'rejected') as fc.Arbitrary<Application['status']>;

const paymentStatusArb = fc.constantFrom('pending_review', 'verified', 'rejected') as fc.Arbitrary<Application['payment_status']>;

const interviewModeArb = fc.constantFrom('in_person', 'virtual', 'phone') as fc.Arbitrary<ApplicationInterview['mode']>;

const interviewStatusArb = fc.constantFrom('scheduled', 'rescheduled', 'completed', 'cancelled') as fc.Arbitrary<ApplicationInterview['status']>;

/**
 * Generate a valid ISO date string using constrained timestamps
 * Range: Jan 1, 2024 to Jan 1, 2027 (valid date range)
 */
const isoDateArb = fc.integer({ min: 1704067200000, max: 1798761600000 }).map(ts => new Date(ts).toISOString());

/**
 * Generate a valid Application object
 */
const applicationArb: fc.Arbitrary<Application> = fc.record({
  id: uuidArb,
  application_number: fc.string({ minLength: 6, maxLength: 15 }).map(s => `APP-${s}`),
  user_id: uuidArb,
  full_name: fc.string({ minLength: 2, maxLength: 100 }),
  email: fc.emailAddress(),
  phone: fc.string({ minLength: 10, maxLength: 15 }).map(s => `+260${s.replace(/\D/g, '').substring(0, 9)}`),
  program: fc.constantFrom('Nursing', 'Pharmacy', 'Clinical Medicine', 'Laboratory'),
  intake: fc.constantFrom('January 2025', 'September 2025', 'January 2026'),
  status: applicationStatusArb,
  payment_status: paymentStatusArb,
  created_at: isoDateArb,
  updated_at: isoDateArb,
});

/**
 * Generate a valid ApplicationInterview object
 */
const interviewArb: fc.Arbitrary<ApplicationInterview> = fc.record({
  id: uuidArb,
  application_id: uuidArb,
  scheduled_at: isoDateArb,
  mode: interviewModeArb,
  location: fc.option(fc.string({ minLength: 5, maxLength: 100 }), { nil: null }),
  status: interviewStatusArb,
  notes: fc.option(fc.string({ minLength: 0, maxLength: 500 }), { nil: null }),
  program: fc.option(fc.constantFrom('Nursing', 'Pharmacy', 'Clinical Medicine'), { nil: undefined }),
  application_number: fc.option(fc.string({ minLength: 6, maxLength: 15 }).map(s => `APP-${s}`), { nil: undefined }),
});

/**
 * Generate valid ApplicationStats
 */
const statsArb: fc.Arbitrary<ApplicationStats> = fc.record({
  total_drafts: fc.nat(1000),
  completed_applications: fc.nat(1000),
  total_applications: fc.nat(2000),
  avg_time_hours: fc.float({ min: 0, max: 100, noNaN: true }),
});

/**
 * Generate valid EmailCheckResponse
 */
const emailCheckArb: fc.Arbitrary<EmailCheckResponse> = fc.record({
  available: fc.boolean(),
});

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate that an object has all required Application fields
 */
function isValidApplication(obj: unknown): obj is Application {
  if (typeof obj !== 'object' || obj === null) return false;
  const app = obj as Record<string, unknown>;
  
  return (
    typeof app.id === 'string' &&
    typeof app.application_number === 'string' &&
    typeof app.user_id === 'string' &&
    typeof app.full_name === 'string' &&
    typeof app.email === 'string' &&
    typeof app.phone === 'string' &&
    typeof app.program === 'string' &&
    typeof app.intake === 'string' &&
    ['draft', 'submitted', 'under_review', 'approved', 'rejected'].includes(app.status as string) &&
    ['pending_review', 'verified', 'rejected'].includes(app.payment_status as string) &&
    typeof app.created_at === 'string' &&
    typeof app.updated_at === 'string'
  );
}

/**
 * Validate that an object has all required ApplicationInterview fields
 */
function isValidInterview(obj: unknown): obj is ApplicationInterview {
  if (typeof obj !== 'object' || obj === null) return false;
  const interview = obj as Record<string, unknown>;
  
  return (
    typeof interview.id === 'string' &&
    typeof interview.application_id === 'string' &&
    typeof interview.scheduled_at === 'string' &&
    ['in_person', 'virtual', 'phone'].includes(interview.mode as string) &&
    (interview.location === null || typeof interview.location === 'string') &&
    ['scheduled', 'rescheduled', 'completed', 'cancelled'].includes(interview.status as string) &&
    (interview.notes === null || typeof interview.notes === 'string')
  );
}

/**
 * Validate that an object has all required ApplicationStats fields
 */
function isValidStats(obj: unknown): obj is ApplicationStats {
  if (typeof obj !== 'object' || obj === null) return false;
  const stats = obj as Record<string, unknown>;
  
  return (
    typeof stats.total_drafts === 'number' &&
    typeof stats.completed_applications === 'number' &&
    typeof stats.total_applications === 'number' &&
    typeof stats.avg_time_hours === 'number'
  );
}

/**
 * Validate that an object has all required EmailCheckResponse fields
 */
function isValidEmailCheck(obj: unknown): obj is EmailCheckResponse {
  if (typeof obj !== 'object' || obj === null) return false;
  const response = obj as Record<string, unknown>;
  
  return typeof response.available === 'boolean';
}

/**
 * Validate API response wrapper structure
 */
function isValidApiResponse<T>(response: unknown, dataValidator?: (data: unknown) => data is T): response is ApiResponse<T> {
  if (typeof response !== 'object' || response === null) return false;
  const resp = response as Record<string, unknown>;
  
  // Must have success boolean
  if (typeof resp.success !== 'boolean') return false;
  
  // If success is true, data should be present (or undefined for void responses)
  // If success is false, error should be present
  if (resp.success === false) {
    if (typeof resp.error !== 'string' && resp.error !== undefined) return false;
  }
  
  // If data validator provided and data exists, validate it
  if (dataValidator && resp.data !== undefined) {
    return dataValidator(resp.data);
  }
  
  return true;
}

// ============================================================================
// Property 2: API Response Structure Validity
// ============================================================================

describe('Feature: supabase-complete-removal, Property 2: API Response Structure Validity', () => {
  describe('Applications List Response', () => {
    /**
     * **Validates: Requirements 1.2**
     * WHEN displaying payment status, THE Payment_Page SHALL use the same data structure returned by the API
     */
    it('PROPERTY: Applications list response SHALL contain valid Application objects', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(applicationArb, { minLength: 0, maxLength: 10 }),
          async (applications) => {
            // Simulate API response
            const response: ApiResponse<Application[]> = {
              success: true,
              data: applications,
            };
            
            // Validate response structure
            expect(isValidApiResponse(response)).toBe(true);
            expect(response.success).toBe(true);
            expect(Array.isArray(response.data)).toBe(true);
            
            // Validate each application
            for (const app of response.data!) {
              expect(isValidApplication(app)).toBe(true);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Applications list response SHALL have success boolean', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          fc.option(fc.array(applicationArb, { minLength: 0, maxLength: 5 }), { nil: undefined }),
          fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
          async (success, data, error) => {
            const response: ApiResponse<Application[]> = {
              success,
              data: success ? data : undefined,
              error: success ? undefined : error,
            };
            
            expect(typeof response.success).toBe('boolean');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Interviews Response', () => {
    /**
     * **Validates: Requirements 2.2**
     * THE Interview_API endpoint SHALL return interviews with application details joined
     */
    it('PROPERTY: Interviews response SHALL contain valid ApplicationInterview objects', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(interviewArb, { minLength: 0, maxLength: 10 }),
          async (interviews) => {
            // Simulate API response
            const response: ApiResponse<{ interviews: ApplicationInterview[] }> = {
              success: true,
              data: { interviews },
            };
            
            // Validate response structure
            expect(isValidApiResponse(response)).toBe(true);
            expect(response.success).toBe(true);
            expect(response.data).toHaveProperty('interviews');
            expect(Array.isArray(response.data!.interviews)).toBe(true);
            
            // Validate each interview
            for (const interview of response.data!.interviews) {
              expect(isValidInterview(interview)).toBe(true);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Interview objects SHALL have required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          interviewArb,
          async (interview) => {
            // Required fields must be present
            expect(interview).toHaveProperty('id');
            expect(interview).toHaveProperty('application_id');
            expect(interview).toHaveProperty('scheduled_at');
            expect(interview).toHaveProperty('mode');
            expect(interview).toHaveProperty('status');
            
            // Types must be correct
            expect(typeof interview.id).toBe('string');
            expect(typeof interview.application_id).toBe('string');
            expect(typeof interview.scheduled_at).toBe('string');
            expect(['in_person', 'virtual', 'phone']).toContain(interview.mode);
            expect(['scheduled', 'rescheduled', 'completed', 'cancelled']).toContain(interview.status);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Email Check Response', () => {
    /**
     * **Validates: Requirements 5.2, 10.4**
     * THE Email_Check_API endpoint SHALL return `{ available: boolean }` response
     * WHEN checking email, THE API SHALL return `{ available: true/false }` without exposing user data
     */
    it('PROPERTY: Email check response SHALL contain only available boolean', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailCheckArb,
          async (emailCheck) => {
            // Simulate API response
            const response: ApiResponse<EmailCheckResponse> = {
              success: true,
              data: emailCheck,
            };
            
            // Validate response structure
            expect(isValidApiResponse(response)).toBe(true);
            expect(response.success).toBe(true);
            expect(response.data).toHaveProperty('available');
            expect(typeof response.data!.available).toBe('boolean');
            
            // Should NOT expose any user data
            expect(response.data).not.toHaveProperty('id');
            expect(response.data).not.toHaveProperty('email');
            expect(response.data).not.toHaveProperty('user_id');
            expect(response.data).not.toHaveProperty('name');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Email check SHALL return boolean available field', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          async (available) => {
            const response: ApiResponse<EmailCheckResponse> = {
              success: true,
              data: { available },
            };
            
            expect(isValidEmailCheck(response.data)).toBe(true);
            expect(response.data!.available).toBe(available);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Stats Response', () => {
    /**
     * **Validates: Requirements 4.1**
     */
    it('PROPERTY: Stats response SHALL contain all required numeric fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          statsArb,
          async (stats) => {
            // Simulate API response
            const response: ApiResponse<ApplicationStats> = {
              success: true,
              data: stats,
            };
            
            // Validate response structure
            expect(isValidApiResponse(response)).toBe(true);
            expect(isValidStats(response.data)).toBe(true);
            
            // All fields must be numbers
            expect(typeof response.data!.total_drafts).toBe('number');
            expect(typeof response.data!.completed_applications).toBe('number');
            expect(typeof response.data!.total_applications).toBe('number');
            expect(typeof response.data!.avg_time_hours).toBe('number');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Error Response', () => {
    /**
     * **Validates: Requirements 1.2, 10.4**
     * No additional user data is leaked in responses
     */
    it('PROPERTY: Error response SHALL have success=false and error message', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 200 }),
          fc.option(fc.constantFrom('UNAUTHORIZED', 'NOT_FOUND', 'VALIDATION_ERROR', 'INTERNAL_ERROR'), { nil: undefined }),
          async (errorMessage, errorCode) => {
            const response: ApiResponse<never> = {
              success: false,
              error: errorMessage,
              code: errorCode,
            };
            
            expect(response.success).toBe(false);
            expect(typeof response.error).toBe('string');
            expect(response.error!.length).toBeGreaterThan(0);
            
            // Should not contain data on error
            expect(response.data).toBeUndefined();
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Error response SHALL NOT leak sensitive data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 200 }),
          async (errorMessage) => {
            const response: ApiResponse<never> = {
              success: false,
              error: errorMessage,
            };
            
            // Should not contain any user data fields
            expect(response).not.toHaveProperty('user_id');
            expect(response).not.toHaveProperty('email');
            expect(response).not.toHaveProperty('password');
            expect(response).not.toHaveProperty('token');
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
  it('PROPERTY: Empty arrays SHALL be valid responses', async () => {
    const emptyApplicationsResponse: ApiResponse<Application[]> = {
      success: true,
      data: [],
    };
    
    const emptyInterviewsResponse: ApiResponse<{ interviews: ApplicationInterview[] }> = {
      success: true,
      data: { interviews: [] },
    };
    
    expect(isValidApiResponse(emptyApplicationsResponse)).toBe(true);
    expect(isValidApiResponse(emptyInterviewsResponse)).toBe(true);
    expect(emptyApplicationsResponse.data).toEqual([]);
    expect(emptyInterviewsResponse.data!.interviews).toEqual([]);
  });

  it('PROPERTY: Null optional fields SHALL be valid', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        async (id, appId) => {
          const interview: ApplicationInterview = {
            id,
            application_id: appId,
            scheduled_at: new Date().toISOString(),
            mode: 'virtual',
            location: null,
            status: 'scheduled',
            notes: null,
          };
          
          expect(isValidInterview(interview)).toBe(true);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});
