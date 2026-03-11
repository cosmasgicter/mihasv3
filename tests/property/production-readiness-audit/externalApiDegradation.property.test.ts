// @vitest-environment node
/**
 * Property 19: External API Graceful Degradation
 *
 * Feature: production-readiness-audit
 * **Validates: Requirements 11.3**
 *
 * For any failure of external APIs (HPCZ, ECZ, GNC/NMCZ), the system SHALL
 * continue operation with advisory-only eligibility status and not block the
 * user flow.
 *
 * The graceful degradation system:
 * - External APIs: HPCZ (Health Professions Council), ECZ (Examinations Council),
 *   GNC/NMCZ (Nursing/Midwifery Council)
 * - On any API failure, eligibility returns canProceed: true
 * - Fallback status is 'conditional' (never 'ineligible')
 * - Application submission is never blocked by eligibility failures
 * - Error messages are user-friendly (no stack traces or internal details)
 * - Multiple simultaneous API failures still produce a valid fallback
 *
 * This test models the degradation logic as pure functions — no React hooks,
 * database connections, or external API calls required.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Domain types (mirrors eligibility engine behaviour)
// ---------------------------------------------------------------------------

type ExternalApi = 'HPCZ' | 'ECZ' | 'GNC_NMCZ';
type ApiStatus = 'available' | 'timeout' | 'error_500' | 'error_503' | 'network_error' | 'invalid_response';
type EligibilityStatus = 'eligible' | 'conditional' | 'ineligible';

interface ApiResult {
  api: ExternalApi;
  status: ApiStatus;
  responseTimeMs: number;
}

interface EligibilityAssessment {
  canProceed: boolean;
  eligibilityStatus: EligibilityStatus;
  message: string;
  score: number;
  recommendations: string[];
  apiResults: ApiResult[];
  isFallback: boolean;
}

interface SubjectGrade {
  subject: string;
  grade: number; // 1-9 ECZ scale
}

interface ApplicationSubmission {
  applicationId: string;
  programId: string;
  grades: SubjectGrade[];
  eligibilityAssessment: EligibilityAssessment | null;
}

interface SubmissionResult {
  allowed: boolean;
  reason: string;
}

const EXTERNAL_APIS: ExternalApi[] = ['HPCZ', 'ECZ', 'GNC_NMCZ'];
const FAILURE_STATUSES: ApiStatus[] = ['timeout', 'error_500', 'error_503', 'network_error', 'invalid_response'];
const ALL_STATUSES: ApiStatus[] = ['available', ...FAILURE_STATUSES];

// Stack trace patterns that must never appear in user-facing messages
const STACK_TRACE_PATTERNS = [
  /at\s+\w+\s+\(/,       // "at functionName ("
  /Error:\s+.*\n\s+at/,   // multi-line stack trace
  /node_modules\//,        // internal paths
  /\.js:\d+:\d+/,          // file:line:col
  /\.ts:\d+:\d+/,          // TypeScript file:line:col
  /ECONNREFUSED/,          // raw network errors
  /ETIMEDOUT/,             // raw timeout errors
  /TypeError:/,            // raw JS errors
  /ReferenceError:/,       // raw JS errors
];

// ---------------------------------------------------------------------------
// Pure function models of the graceful degradation system
// ---------------------------------------------------------------------------

/**
 * Simulate calling an external API. Returns the result based on the API's
 * current status.
 */
function callExternalApi(api: ExternalApi, status: ApiStatus, responseTimeMs: number): ApiResult {
  return { api, status, responseTimeMs };
}

/**
 * Check if an API result represents a failure.
 */
function isApiFailure(result: ApiResult): boolean {
  return result.status !== 'available';
}

/**
 * Create a fallback assessment when one or more external APIs fail.
 * Mirrors the behaviour of createFallbackAssessment() and the catch block
 * in useEligibilityChecker.
 *
 * Key invariants:
 * - canProceed is ALWAYS true
 * - eligibilityStatus is 'conditional' (never 'ineligible')
 * - message is user-friendly (no stack traces)
 */
function createFallbackAssessment(apiResults: ApiResult[]): EligibilityAssessment {
  const failedApis = apiResults.filter(isApiFailure);
  const failedNames = failedApis.map(r => r.api).join(', ');

  return {
    canProceed: true,
    eligibilityStatus: 'conditional',
    message: failedApis.length > 0
      ? 'Unable to verify eligibility at this time. You may proceed with your application.'
      : 'Eligibility verified successfully.',
    score: 0,
    recommendations: failedApis.length > 0
      ? ['Please consult with admissions for specific requirements']
      : [],
    apiResults,
    isFallback: failedApis.length > 0,
  };
}

/**
 * Perform eligibility assessment with graceful degradation.
 * If any external API fails, the system falls back to advisory-only mode.
 */
function assessEligibility(
  apiStatuses: Map<ExternalApi, { status: ApiStatus; responseTimeMs: number }>,
  grades: SubjectGrade[],
): EligibilityAssessment {
  const apiResults: ApiResult[] = [];

  for (const api of EXTERNAL_APIS) {
    const config = apiStatuses.get(api) ?? { status: 'network_error' as ApiStatus, responseTimeMs: 0 };
    apiResults.push(callExternalApi(api, config.status, config.responseTimeMs));
  }

  const hasFailure = apiResults.some(isApiFailure);

  if (hasFailure) {
    return createFallbackAssessment(apiResults);
  }

  // All APIs available — perform normal assessment
  const score = grades.length > 0
    ? Math.round(grades.reduce((sum, g) => sum + Math.max(0, 10 - g.grade), 0) / grades.length * 10)
    : 0;

  return {
    canProceed: true,
    eligibilityStatus: score >= 50 ? 'eligible' : 'conditional',
    message: score >= 50 ? '✓ Meets requirements' : 'Requirements not fully met',
    score,
    recommendations: score < 50 ? ['Consider retaking subjects with low grades'] : [],
    apiResults,
    isFallback: false,
  };
}

/**
 * Determine if an application submission should be allowed.
 * Submission is NEVER blocked by eligibility check failures.
 * Mirrors handleSubmitApplication which does NOT check eligibility.
 */
function canSubmitApplication(submission: ApplicationSubmission): SubmissionResult {
  // Application submission never depends on eligibility assessment
  // Even if assessment is null (failed entirely), submission proceeds
  if (!submission.applicationId || !submission.programId) {
    return { allowed: false, reason: 'Missing required application data' };
  }

  // Eligibility is advisory only — never blocks submission
  return { allowed: true, reason: 'Submission allowed' };
}

/**
 * Validate that a message is user-friendly (no stack traces or internal details).
 */
function isUserFriendlyMessage(message: string): boolean {
  return !STACK_TRACE_PATTERNS.some(pattern => pattern.test(message));
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const externalApiArb: fc.Arbitrary<ExternalApi> = fc.constantFrom('HPCZ', 'ECZ', 'GNC_NMCZ');

const failureStatusArb: fc.Arbitrary<ApiStatus> = fc.constantFrom(
  'timeout', 'error_500', 'error_503', 'network_error', 'invalid_response',
);

const apiStatusArb: fc.Arbitrary<ApiStatus> = fc.constantFrom(
  'available', 'timeout', 'error_500', 'error_503', 'network_error', 'invalid_response',
);

const responseTimeArb = fc.integer({ min: 0, max: 30000 });

const subjectGradeArb: fc.Arbitrary<SubjectGrade> = fc.record({
  subject: fc.constantFrom('Mathematics', 'English', 'Biology', 'Chemistry', 'Physics', 'Science'),
  grade: fc.integer({ min: 1, max: 9 }),
});

const gradesArb = fc.array(subjectGradeArb, { minLength: 0, maxLength: 8 });

/** Generate a map of API statuses where at least one API has failed */
const failingApiStatusesArb: fc.Arbitrary<Map<ExternalApi, { status: ApiStatus; responseTimeMs: number }>> =
  fc.tuple(
    fc.record({ status: failureStatusArb, responseTimeMs: responseTimeArb }),
    fc.record({ status: apiStatusArb, responseTimeMs: responseTimeArb }),
    fc.record({ status: apiStatusArb, responseTimeMs: responseTimeArb }),
  ).chain(([first, second, third]) => {
    // Shuffle which API gets the guaranteed failure
    return fc.constantFrom(
      new Map<ExternalApi, { status: ApiStatus; responseTimeMs: number }>([
        ['HPCZ', first], ['ECZ', second], ['GNC_NMCZ', third],
      ]),
      new Map<ExternalApi, { status: ApiStatus; responseTimeMs: number }>([
        ['HPCZ', second], ['ECZ', first], ['GNC_NMCZ', third],
      ]),
      new Map<ExternalApi, { status: ApiStatus; responseTimeMs: number }>([
        ['HPCZ', third], ['ECZ', second], ['GNC_NMCZ', first],
      ]),
    );
  });

/** Generate a map where ALL APIs have failed */
const allFailingApiStatusesArb: fc.Arbitrary<Map<ExternalApi, { status: ApiStatus; responseTimeMs: number }>> =
  fc.tuple(
    fc.record({ status: failureStatusArb, responseTimeMs: responseTimeArb }),
    fc.record({ status: failureStatusArb, responseTimeMs: responseTimeArb }),
    fc.record({ status: failureStatusArb, responseTimeMs: responseTimeArb }),
  ).map(([hpcz, ecz, gnc]) =>
    new Map<ExternalApi, { status: ApiStatus; responseTimeMs: number }>([
      ['HPCZ', hpcz], ['ECZ', ecz], ['GNC_NMCZ', gnc],
    ]),
  );

/** Generate a map with mixed API availability */
const mixedApiStatusesArb: fc.Arbitrary<Map<ExternalApi, { status: ApiStatus; responseTimeMs: number }>> =
  fc.tuple(
    fc.record({ status: apiStatusArb, responseTimeMs: responseTimeArb }),
    fc.record({ status: apiStatusArb, responseTimeMs: responseTimeArb }),
    fc.record({ status: apiStatusArb, responseTimeMs: responseTimeArb }),
  ).map(([hpcz, ecz, gnc]) =>
    new Map<ExternalApi, { status: ApiStatus; responseTimeMs: number }>([
      ['HPCZ', hpcz], ['ECZ', ecz], ['GNC_NMCZ', gnc],
    ]),
  );

const applicationIdArb = fc.stringMatching(/^APP-[A-Z0-9]{6}$/);
const programIdArb = fc.uuid();

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 19: External API Graceful Degradation', () => {
  describe('fallback always allows user to proceed', () => {
    it('any single API failure results in canProceed: true', () => {
      fc.assert(
        fc.property(failingApiStatusesArb, gradesArb, (apiStatuses, grades) => {
          const result = assessEligibility(apiStatuses, grades);
          expect(result.canProceed).toBe(true);
        }),
        { numRuns: 10 },
      );
    });

    it('all APIs failing simultaneously still results in canProceed: true', () => {
      fc.assert(
        fc.property(allFailingApiStatusesArb, gradesArb, (apiStatuses, grades) => {
          const result = assessEligibility(apiStatuses, grades);
          expect(result.canProceed).toBe(true);
        }),
        { numRuns: 10 },
      );
    });

    it('mixed API availability always results in canProceed: true', () => {
      fc.assert(
        fc.property(mixedApiStatusesArb, gradesArb, (apiStatuses, grades) => {
          const result = assessEligibility(apiStatuses, grades);
          expect(result.canProceed).toBe(true);
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('fallback eligibility status is never ineligible', () => {
    it('API failures produce conditional status, never ineligible', () => {
      fc.assert(
        fc.property(failingApiStatusesArb, gradesArb, (apiStatuses, grades) => {
          const result = assessEligibility(apiStatuses, grades);
          if (result.isFallback) {
            expect(result.eligibilityStatus).toBe('conditional');
            expect(result.eligibilityStatus).not.toBe('ineligible');
          }
        }),
        { numRuns: 10 },
      );
    });

    it('all APIs down produces conditional status', () => {
      fc.assert(
        fc.property(allFailingApiStatusesArb, gradesArb, (apiStatuses, grades) => {
          const result = assessEligibility(apiStatuses, grades);
          expect(result.eligibilityStatus).toBe('conditional');
          expect(result.isFallback).toBe(true);
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('application submission never blocked by eligibility failures', () => {
    it('submission allowed even when eligibility assessment is null (total failure)', () => {
      fc.assert(
        fc.property(applicationIdArb, programIdArb, gradesArb, (appId, progId, grades) => {
          const submission: ApplicationSubmission = {
            applicationId: appId,
            programId: progId,
            grades,
            eligibilityAssessment: null, // complete API failure
          };
          const result = canSubmitApplication(submission);
          expect(result.allowed).toBe(true);
        }),
        { numRuns: 10 },
      );
    });

    it('submission allowed when eligibility is in fallback mode', () => {
      fc.assert(
        fc.property(
          applicationIdArb,
          programIdArb,
          gradesArb,
          allFailingApiStatusesArb,
          (appId, progId, grades, apiStatuses) => {
            const assessment = assessEligibility(apiStatuses, grades);
            const submission: ApplicationSubmission = {
              applicationId: appId,
              programId: progId,
              grades,
              eligibilityAssessment: assessment,
            };
            const result = canSubmitApplication(submission);
            expect(result.allowed).toBe(true);
          },
        ),
        { numRuns: 10 },
      );
    });

    it('submission allowed regardless of eligibility status value', () => {
      fc.assert(
        fc.property(
          applicationIdArb,
          programIdArb,
          gradesArb,
          mixedApiStatusesArb,
          (appId, progId, grades, apiStatuses) => {
            const assessment = assessEligibility(apiStatuses, grades);
            const submission: ApplicationSubmission = {
              applicationId: appId,
              programId: progId,
              grades,
              eligibilityAssessment: assessment,
            };
            const result = canSubmitApplication(submission);
            expect(result.allowed).toBe(true);
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  describe('error messages are user-friendly (no stack traces)', () => {
    it('fallback messages contain no stack trace patterns', () => {
      fc.assert(
        fc.property(failingApiStatusesArb, gradesArb, (apiStatuses, grades) => {
          const result = assessEligibility(apiStatuses, grades);
          expect(isUserFriendlyMessage(result.message)).toBe(true);
          for (const rec of result.recommendations) {
            expect(isUserFriendlyMessage(rec)).toBe(true);
          }
        }),
        { numRuns: 10 },
      );
    });

    it('all-APIs-down messages contain no internal error details', () => {
      fc.assert(
        fc.property(allFailingApiStatusesArb, gradesArb, (apiStatuses, grades) => {
          const result = assessEligibility(apiStatuses, grades);
          expect(result.message).not.toContain('ECONNREFUSED');
          expect(result.message).not.toContain('ETIMEDOUT');
          expect(result.message).not.toContain('TypeError');
          expect(result.message).not.toContain('node_modules');
          expect(isUserFriendlyMessage(result.message)).toBe(true);
        }),
        { numRuns: 10 },
      );
    });

    it('fallback message communicates that the user can proceed', () => {
      fc.assert(
        fc.property(allFailingApiStatusesArb, gradesArb, (apiStatuses, grades) => {
          const result = assessEligibility(apiStatuses, grades);
          if (result.isFallback) {
            expect(result.message.toLowerCase()).toContain('proceed');
          }
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('fallback assessment structure is always valid', () => {
    it('fallback always includes apiResults for all three external APIs', () => {
      fc.assert(
        fc.property(failingApiStatusesArb, gradesArb, (apiStatuses, grades) => {
          const result = assessEligibility(apiStatuses, grades);
          expect(result.apiResults).toHaveLength(3);
          const apiNames = result.apiResults.map(r => r.api);
          expect(apiNames).toContain('HPCZ');
          expect(apiNames).toContain('ECZ');
          expect(apiNames).toContain('GNC_NMCZ');
        }),
        { numRuns: 10 },
      );
    });

    it('fallback score is 0 when APIs fail', () => {
      fc.assert(
        fc.property(allFailingApiStatusesArb, gradesArb, (apiStatuses, grades) => {
          const result = assessEligibility(apiStatuses, grades);
          expect(result.score).toBe(0);
        }),
        { numRuns: 10 },
      );
    });

    it('fallback provides recommendations when APIs fail', () => {
      fc.assert(
        fc.property(failingApiStatusesArb, gradesArb, (apiStatuses, grades) => {
          const result = assessEligibility(apiStatuses, grades);
          if (result.isFallback) {
            expect(result.recommendations.length).toBeGreaterThan(0);
          }
        }),
        { numRuns: 10 },
      );
    });

    it('isFallback is true when any API has failed', () => {
      fc.assert(
        fc.property(failingApiStatusesArb, gradesArb, (apiStatuses, grades) => {
          const result = assessEligibility(apiStatuses, grades);
          const hasFailure = result.apiResults.some(isApiFailure);
          expect(result.isFallback).toBe(hasFailure);
        }),
        { numRuns: 10 },
      );
    });
  });
});
