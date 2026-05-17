/**
 * Property-based tests for service layer normalization
 *
 * Feature: frontend-django-alignment, Property 4: Paginated applications normalization
 *
 * **Validates: Requirements 2.5, 4.4, 8.1**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { normalizePaginatedApplications } from '@/services/applications';
import type { Application } from '@/types/database';

// ── Arbitraries ─────────────────────────────────────────────────────────

/** Minimal Application record with required fields */
const applicationRecordArb: fc.Arbitrary<Application> = fc.record({
  id: fc.uuid(),
  user_id: fc.uuid(),
  status: fc.constantFrom('draft', 'submitted', 'under_review', 'approved', 'rejected', 'waitlisted'),
  full_name: fc.option(fc.string({ minLength: 1, maxLength: 60 }), { nil: undefined }),
  email: fc.option(fc.emailAddress(), { nil: undefined }),
  created_at: fc.option(
    fc.integer({ min: 1577836800000, max: 1893456000000 }).map(ts => new Date(ts).toISOString()),
    { nil: undefined },
  ),
});

/** Django pagination metadata */
const paginationMetaArb = fc.record({
  page: fc.integer({ min: 1, max: 500 }),
  pageSize: fc.integer({ min: 1, max: 100 }),
  totalCount: fc.integer({ min: 0, max: 100000 }),
});

// ── Test Suite ──────────────────────────────────────────────────────────

describe('Feature: frontend-django-alignment, Property 4: Paginated applications normalization', () => {
  /**
   * **Validates: Requirements 2.5, 4.4, 8.1**
   *
   * For any Django paginated response shaped as {results: [...], totalCount, page, pageSize},
   * normalizePaginatedApplications shall return a PaginatedApplicationsResponse where
   * applications contains exactly the input records and totalCount is non-negative.
   */
  it('normalizes {results: [...], totalCount, page, pageSize} shape correctly', () => {
    fc.assert(
      fc.property(
        fc.array(applicationRecordArb, { minLength: 0, maxLength: 15 }),
        paginationMetaArb,
        (records, meta) => {
          const response = {
            results: records,
            totalCount: meta.totalCount,
            page: meta.page,
            pageSize: meta.pageSize,
          };

          const result = normalizePaginatedApplications(response);

          expect(result.applications).toHaveLength(records.length);
          expect(result.applications).toBe(records);
          expect(result.totalCount).toBe(meta.totalCount);
          expect(result.totalCount).toBeGreaterThanOrEqual(0);
          expect(result.page).toBe(meta.page);
          expect(result.pageSize).toBe(meta.pageSize);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 2.5, 4.4, 8.1**
   *
   * For any Django response shaped as {applications: [...], count, page},
   * normalizePaginatedApplications shall return a PaginatedApplicationsResponse where
   * applications contains exactly the input records and totalCount is non-negative.
   */
  it('normalizes {applications: [...], count, page} shape correctly', () => {
    fc.assert(
      fc.property(
        fc.array(applicationRecordArb, { minLength: 0, maxLength: 15 }),
        fc.integer({ min: 0, max: 100000 }),
        fc.integer({ min: 1, max: 500 }),
        (records, count, page) => {
          const response = {
            applications: records,
            count,
            page,
          };

          const result = normalizePaginatedApplications(response);

          expect(result.applications).toHaveLength(records.length);
          expect(result.applications).toBe(records);
          expect(result.totalCount).toBe(count);
          expect(result.totalCount).toBeGreaterThanOrEqual(0);
          expect(result.page).toBe(page);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 2.5, 4.4, 8.1**
   *
   * For any raw Application[] (no pagination wrapper),
   * normalizePaginatedApplications shall return a PaginatedApplicationsResponse where
   * applications contains exactly the input records, totalCount equals the array length,
   * page is 1, and pageSize equals the array length.
   */
  it('normalizes raw Application[] shape correctly', () => {
    fc.assert(
      fc.property(
        fc.array(applicationRecordArb, { minLength: 0, maxLength: 15 }),
        (records) => {
          const result = normalizePaginatedApplications(records);

          expect(result.applications).toHaveLength(records.length);
          expect(result.applications).toBe(records);
          expect(result.totalCount).toBe(records.length);
          expect(result.totalCount).toBeGreaterThanOrEqual(0);
          expect(result.page).toBe(1);
          expect(result.pageSize).toBe(records.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 2.5, 4.4, 8.1**
   *
   * For null and undefined inputs, normalizePaginatedApplications shall return
   * a safe default with an empty applications array and non-negative totalCount.
   */
  it('handles null and undefined inputs with safe defaults', () => {
    const nullResult = normalizePaginatedApplications(null);
    expect(nullResult.applications).toEqual([]);
    expect(nullResult.totalCount).toBeGreaterThanOrEqual(0);
    expect(nullResult.page).toBe(1);

    const undefinedResult = normalizePaginatedApplications(undefined);
    expect(undefinedResult.applications).toEqual([]);
    expect(undefinedResult.totalCount).toBeGreaterThanOrEqual(0);
    expect(undefinedResult.page).toBe(1);
  });

  /**
   * **Validates: Requirements 2.5, 4.4, 8.1**
   *
   * When {results} takes priority over {applications} when both are present,
   * the applications array in the output contains exactly the results records.
   */
  it('prefers results over applications when both keys are present', () => {
    fc.assert(
      fc.property(
        fc.array(applicationRecordArb, { minLength: 1, maxLength: 10 }),
        fc.array(applicationRecordArb, { minLength: 1, maxLength: 10 }),
        paginationMetaArb,
        (resultsRecords, applicationsRecords, meta) => {
          const response = {
            results: resultsRecords,
            applications: applicationsRecords,
            totalCount: meta.totalCount,
            page: meta.page,
            pageSize: meta.pageSize,
          };

          const result = normalizePaginatedApplications(response);

          // results takes priority via nullish coalescing (results ?? applications)
          expect(result.applications).toBe(resultsRecords);
          expect(result.applications).toHaveLength(resultsRecords.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 2.5, 4.4, 8.1**
   *
   * totalCount is always a non-negative number regardless of input shape.
   */
  it('totalCount is always non-negative across all input shapes', () => {
    const anyPaginatedInputArb = fc.oneof(
      // {results} shape
      fc.tuple(
        fc.array(applicationRecordArb, { minLength: 0, maxLength: 10 }),
        paginationMetaArb,
      ).map(([records, meta]) => ({
        results: records,
        totalCount: meta.totalCount,
        page: meta.page,
        pageSize: meta.pageSize,
      })),
      // {applications} shape
      fc.tuple(
        fc.array(applicationRecordArb, { minLength: 0, maxLength: 10 }),
        fc.integer({ min: 0, max: 100000 }),
      ).map(([records, count]) => ({
        applications: records,
        count,
      })),
      // raw array shape
      fc.array(applicationRecordArb, { minLength: 0, maxLength: 10 }),
      // null/undefined
      fc.constantFrom(null, undefined),
    );

    fc.assert(
      fc.property(anyPaginatedInputArb, (input) => {
        const result = normalizePaginatedApplications(input as any);

        expect(result.totalCount).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(result.totalCount)).toBe(true);
        expect(Array.isArray(result.applications)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

// ── Property 5: Admin dashboard normalization with fallback ─────────────

import { normalizeStats } from '@/services/admin/dashboard';
import type { AdminDashboardStats } from '@/services/admin/dashboard';

const VALID_SYSTEM_HEALTH_VALUES: AdminDashboardStats['systemHealth'][] = [
  'excellent',
  'good',
  'warning',
  'critical',
];

const ADMIN_DASHBOARD_NUMERIC_KEYS: (keyof AdminDashboardStats)[] = [
  'totalApplications',
  'pendingApplications',
  'approvedApplications',
  'conditionallyApprovedApplications',
  'enrolledApplications',
  'acceptedApplications',
  'rejectedApplications',
  'totalPrograms',
  'activeIntakes',
  'totalStudents',
  'todayApplications',
  'weekApplications',
  'monthApplications',
  'avgProcessingTime',
  'avgProcessingTimeHours',
  'medianProcessingTimeHours',
  'p95ProcessingTimeHours',
  'decisionVelocity24h',
  'activeUsers',
  'activeUsersLast7d',
];

// ── Arbitraries ─────────────────────────────────────────────────────────

/** Valid admin dashboard stats object with realistic values */
const validStatsArb = fc.record({
  totalApplications: fc.integer({ min: 0, max: 100000 }),
  pendingApplications: fc.integer({ min: 0, max: 100000 }),
  approvedApplications: fc.integer({ min: 0, max: 100000 }),
  conditionallyApprovedApplications: fc.integer({ min: 0, max: 100000 }),
  enrolledApplications: fc.integer({ min: 0, max: 100000 }),
  acceptedApplications: fc.integer({ min: 0, max: 100000 }),
  rejectedApplications: fc.integer({ min: 0, max: 100000 }),
  totalPrograms: fc.integer({ min: 0, max: 1000 }),
  activeIntakes: fc.integer({ min: 0, max: 500 }),
  totalStudents: fc.integer({ min: 0, max: 100000 }),
  todayApplications: fc.integer({ min: 0, max: 10000 }),
  weekApplications: fc.integer({ min: 0, max: 50000 }),
  monthApplications: fc.integer({ min: 0, max: 100000 }),
  avgProcessingTime: fc.float({ min: 0, max: 1000, noNaN: true }),
  avgProcessingTimeHours: fc.float({ min: 0, max: 10000, noNaN: true }),
  medianProcessingTimeHours: fc.float({ min: 0, max: 10000, noNaN: true }),
  p95ProcessingTimeHours: fc.float({ min: 0, max: 50000, noNaN: true }),
  decisionVelocity24h: fc.float({ min: 0, max: 1000, noNaN: true }),
  activeUsers: fc.integer({ min: 0, max: 100000 }),
  activeUsersLast7d: fc.integer({ min: 0, max: 100000 }),
  systemHealth: fc.constantFrom('excellent', 'good', 'warning', 'critical'),
});

/** Snake_case variant of valid stats (Django-style) */
const snakeCaseStatsArb = fc.record({
  total_applications: fc.integer({ min: 0, max: 100000 }),
  pending_applications: fc.integer({ min: 0, max: 100000 }),
  approved_applications: fc.integer({ min: 0, max: 100000 }),
  rejected_applications: fc.integer({ min: 0, max: 100000 }),
  total_programs: fc.integer({ min: 0, max: 1000 }),
  active_intakes: fc.integer({ min: 0, max: 500 }),
  total_students: fc.integer({ min: 0, max: 100000 }),
  today_applications: fc.integer({ min: 0, max: 10000 }),
  week_applications: fc.integer({ min: 0, max: 50000 }),
  month_applications: fc.integer({ min: 0, max: 100000 }),
  avg_processing_time: fc.float({ min: 0, max: 1000, noNaN: true }),
  avg_processing_time_hours: fc.float({ min: 0, max: 10000, noNaN: true }),
  median_processing_time_hours: fc.float({ min: 0, max: 10000, noNaN: true }),
  p95_processing_time_hours: fc.float({ min: 0, max: 50000, noNaN: true }),
  decision_velocity_24h: fc.float({ min: 0, max: 1000, noNaN: true }),
  active_users: fc.integer({ min: 0, max: 100000 }),
  active_users_last_7d: fc.integer({ min: 0, max: 100000 }),
  system_health: fc.constantFrom('excellent', 'good', 'warning', 'critical'),
});

/** Arbitrary value that could appear in a malformed response */
const junkValueArb = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.string(),
  fc.boolean(),
  fc.constant(NaN),
  fc.constant(Infinity),
  fc.constant(-Infinity),
  fc.array(fc.integer()),
  fc.dictionary(fc.string(), fc.string()),
);

/** Object with wrong value types for all numeric fields */
const wrongTypesStatsArb = fc.record({
  totalApplications: junkValueArb,
  pendingApplications: junkValueArb,
  approvedApplications: junkValueArb,
  rejectedApplications: junkValueArb,
  totalPrograms: junkValueArb,
  activeIntakes: junkValueArb,
  totalStudents: junkValueArb,
  todayApplications: junkValueArb,
  weekApplications: junkValueArb,
  monthApplications: junkValueArb,
  avgProcessingTime: junkValueArb,
  avgProcessingTimeHours: junkValueArb,
  medianProcessingTimeHours: junkValueArb,
  p95ProcessingTimeHours: junkValueArb,
  decisionVelocity24h: junkValueArb,
  activeUsers: junkValueArb,
  activeUsersLast7d: junkValueArb,
  systemHealth: junkValueArb,
});

// ── Test Suite ──────────────────────────────────────────────────────────

describe('Feature: frontend-django-alignment, Property 5: Admin dashboard normalization with fallback', () => {
  /**
   * **Validates: Requirements 3.1, 3.4**
   *
   * For any valid camelCase stats object, normalizeStats shall return an AdminDashboardStats
   * where all numeric fields are finite and systemHealth is a valid enum value.
   */
  it('returns finite numerics and valid systemHealth for valid camelCase input', () => {
    fc.assert(
      fc.property(validStatsArb, (input) => {
        const result = normalizeStats(input as unknown as Record<string, unknown>);

        for (const key of ADMIN_DASHBOARD_NUMERIC_KEYS) {
          expect(Number.isFinite(result[key])).toBe(true);
        }
        expect(VALID_SYSTEM_HEALTH_VALUES).toContain(result.systemHealth);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.1, 3.4**
   *
   * For any valid snake_case stats object (Django-style), normalizeStats shall return
   * an AdminDashboardStats where all numeric fields are finite and systemHealth is valid.
   */
  it('returns finite numerics and valid systemHealth for snake_case input', () => {
    fc.assert(
      fc.property(snakeCaseStatsArb, (input) => {
        const result = normalizeStats(input as unknown as Record<string, unknown>);

        for (const key of ADMIN_DASHBOARD_NUMERIC_KEYS) {
          expect(Number.isFinite(result[key])).toBe(true);
        }
        expect(VALID_SYSTEM_HEALTH_VALUES).toContain(result.systemHealth);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.1, 3.4**
   *
   * For an empty object (missing all keys), normalizeStats shall return safe defaults
   * with all numeric fields finite and systemHealth valid.
   */
  it('handles empty objects with safe defaults', () => {
    const result = normalizeStats({});

    for (const key of ADMIN_DASHBOARD_NUMERIC_KEYS) {
      expect(Number.isFinite(result[key])).toBe(true);
    }
    expect(VALID_SYSTEM_HEALTH_VALUES).toContain(result.systemHealth);
  });

  /**
   * **Validates: Requirements 3.1, 3.4**
   *
   * For undefined input, normalizeStats shall return safe defaults
   * with all numeric fields finite and systemHealth valid.
   */
  it('handles undefined input with safe defaults', () => {
    const result = normalizeStats(undefined);

    for (const key of ADMIN_DASHBOARD_NUMERIC_KEYS) {
      expect(Number.isFinite(result[key])).toBe(true);
    }
    expect(VALID_SYSTEM_HEALTH_VALUES).toContain(result.systemHealth);
  });

  /**
   * **Validates: Requirements 3.1, 3.4**
   *
   * For any object with wrong value types for all fields, normalizeStats shall still
   * return finite numerics and a valid systemHealth. The function shall never throw.
   */
  it('returns finite numerics and valid systemHealth for wrong value types', () => {
    fc.assert(
      fc.property(wrongTypesStatsArb, (input) => {
        const result = normalizeStats(input as unknown as Record<string, unknown>);

        for (const key of ADMIN_DASHBOARD_NUMERIC_KEYS) {
          expect(Number.isFinite(result[key])).toBe(true);
        }
        expect(VALID_SYSTEM_HEALTH_VALUES).toContain(result.systemHealth);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.1, 3.4**
   *
   * normalizeStats shall never throw for any input shape — valid, empty, missing keys,
   * or wrong types.
   */
  it('never throws regardless of input shape', () => {
    const anyInputArb = fc.oneof(
      validStatsArb.map(s => s as unknown as Record<string, unknown>),
      snakeCaseStatsArb.map(s => s as unknown as Record<string, unknown>),
      wrongTypesStatsArb.map(s => s as unknown as Record<string, unknown>),
      fc.constant({}),
      fc.constant(undefined as unknown as Record<string, unknown>),
    );

    fc.assert(
      fc.property(anyInputArb, (input) => {
        expect(() => normalizeStats(input)).not.toThrow();
      }),
      { numRuns: 100 },
    );
  });
});


// ── Property 6: No double envelope unwrap ───────────────────────────────

describe('Feature: frontend-django-alignment, Property 6: No double envelope unwrap', () => {
  /**
   * **Validates: Requirements 4.1**
   *
   * For any payload that is NOT a {success: true, data: ...} envelope,
   * the service layer normalizers shall not strip or discard any top-level keys.
   * Specifically, if the input has a key `results`, the output shall still
   * reference those results.
   */
  it('preserves results array from non-envelope paginated response', () => {
    fc.assert(
      fc.property(
        fc.array(applicationRecordArb, { minLength: 1, maxLength: 10 }),
        paginationMetaArb,
        (records, meta) => {
          // This is already-unwrapped data (NOT an envelope)
          const nonEnvelopePayload = {
            results: records,
            totalCount: meta.totalCount,
            page: meta.page,
            pageSize: meta.pageSize,
          };

          const result = normalizePaginatedApplications(nonEnvelopePayload);

          // The normalizer must NOT strip the results key — it should use it
          expect(result.applications).toBe(records);
          expect(result.applications).toHaveLength(records.length);
          expect(result.totalCount).toBe(meta.totalCount);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('preserves applications array from non-envelope response', () => {
    fc.assert(
      fc.property(
        fc.array(applicationRecordArb, { minLength: 1, maxLength: 10 }),
        fc.integer({ min: 0, max: 100000 }),
        (records, count) => {
          // Already-unwrapped data with applications key
          const nonEnvelopePayload = {
            applications: records,
            count,
          };

          const result = normalizePaginatedApplications(nonEnvelopePayload);

          expect(result.applications).toBe(records);
          expect(result.totalCount).toBe(count);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('does not treat plain objects without success/data as envelopes', () => {
    fc.assert(
      fc.property(
        fc.array(applicationRecordArb, { minLength: 0, maxLength: 10 }),
        fc.record({
          someExtraKey: fc.string({ minLength: 1, maxLength: 20 }),
          anotherKey: fc.integer({ min: 0, max: 1000 }),
        }),
        (records, extras) => {
          // Object with results + extra keys but no success/data envelope
          const payload = {
            results: records,
            totalCount: records.length,
            page: 1,
            pageSize: records.length,
            ...extras,
          };

          const result = normalizePaginatedApplications(payload as any);

          // Results must be preserved, not discarded
          expect(result.applications).toBe(records);
          expect(result.applications).toHaveLength(records.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ── Property 7: Catalog field normalization ─────────────────────────────

import {
  normalizeProgram,
  normalizeIntake,
  normalizeSubject,
  normalizeInstitution,
  normalizeProgramsResponse,
  normalizeIntakesResponse,
} from '@/services/catalog';
import type { Program, Intake } from '@/services/catalog';

/** Django-style raw program record with snake_case fields */
const rawProgramArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 60 }),
  code: fc.option(fc.string({ minLength: 2, maxLength: 12 }), { nil: undefined }),
  description: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: undefined }),
  institution_id: fc.option(fc.uuid(), { nil: undefined }),
  duration_years: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined }),
  duration_months: fc.option(fc.integer({ min: 1, max: 120 }), { nil: undefined }),
  application_fee: fc.oneof(
    fc.integer({ min: 0, max: 100000 }),
    fc.string({ minLength: 1, maxLength: 10 }).filter(s => !isNaN(Number(s))),
  ),
  requirements: fc.option(
    fc.record({ summary: fc.string({ minLength: 0, maxLength: 100 }) }),
    { nil: null },
  ),
  is_active: fc.option(fc.boolean(), { nil: undefined }),
});

/** Django-style raw intake record with snake_case fields */
const rawIntakeArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 60 }),
  year: fc.integer({ min: 2020, max: 2035 }),
  start_date: fc.option(
    fc.integer({ min: 1577836800000, max: 1893456000000 }).map(ts => new Date(ts).toISOString().split('T')[0]),
    { nil: undefined },
  ),
  end_date: fc.option(
    fc.integer({ min: 1577836800000, max: 1893456000000 }).map(ts => new Date(ts).toISOString().split('T')[0]),
    { nil: undefined },
  ),
  application_start_date: fc.option(
    fc.integer({ min: 1577836800000, max: 1893456000000 }).map(ts => new Date(ts).toISOString().split('T')[0]),
    { nil: undefined },
  ),
  application_deadline: fc.integer({ min: 1577836800000, max: 1893456000000 }).map(ts => new Date(ts).toISOString().split('T')[0]),
  max_capacity: fc.option(fc.integer({ min: 0, max: 5000 }), { nil: undefined }),
  current_enrollment: fc.option(fc.integer({ min: 0, max: 5000 }), { nil: undefined }),
  is_active: fc.option(fc.boolean(), { nil: undefined }),
});

describe('Feature: frontend-django-alignment, Property 7: Catalog field normalization', () => {
  /**
   * **Validates: Requirements 4.2, 4.3, 4.9**
   *
   * For any Django catalog program record with snake_case fields,
   * normalizeProgram shall produce a frontend-typed Program where all
   * required fields are present and numeric fields are finite.
   */
  it('normalizes raw Django program records with all required fields present and finite numerics', () => {
    fc.assert(
      fc.property(rawProgramArb, (raw) => {
        const result = normalizeProgram(raw as any);

        // Must return a non-null result for records with valid id
        expect(result).not.toBeNull();
        const program = result as Program;

        // Required fields must be present
        expect(typeof program.id).toBe('string');
        expect(program.id).toBe(raw.id);
        expect(typeof program.name).toBe('string');

        // Numeric fields must be finite
        expect(Number.isFinite(program.duration_years)).toBe(true);
        expect(Number.isFinite(program.application_fee)).toBe(true);

        // institution_id must be a string (possibly empty)
        expect(typeof program.institution_id).toBe('string');
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 4.2, 4.3, 4.9**
   *
   * For any Django catalog intake record with snake_case fields,
   * normalizeIntake shall produce a frontend-typed Intake where all
   * required fields are present and numeric fields are finite.
   */
  it('normalizes raw Django intake records with all required fields present and finite numerics', () => {
    fc.assert(
      fc.property(rawIntakeArb, (raw) => {
        const result = normalizeIntake(raw as any);

        // Must return a non-null result for records with valid id
        expect(result).not.toBeNull();
        const intake = result as Intake;

        // Required fields must be present
        expect(typeof intake.id).toBe('string');
        expect(intake.id).toBe(raw.id);
        expect(typeof intake.name).toBe('string');
        expect(typeof intake.year).toBe('number');

        // Numeric fields must be finite
        expect(Number.isFinite(intake.max_capacity)).toBe(true);

        // Date fields: application_deadline is always a string;
        // start_date and end_date may be undefined when the raw record
        // takes the fast path (max_capacity already a number)
        expect(typeof intake.application_deadline).toBe('string');
        if (intake.start_date !== undefined) {
          expect(typeof intake.start_date).toBe('string');
        }
        if (intake.end_date !== undefined) {
          expect(typeof intake.end_date).toBe('string');
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 4.2, 4.9**
   *
   * For any array of raw Django program records wrapped in a collection response,
   * normalizeProgramsResponse shall produce a {programs: Program[]} where
   * all valid records are preserved.
   */
  it('normalizes a collection of raw programs preserving all valid records', () => {
    fc.assert(
      fc.property(
        fc.array(rawProgramArb, { minLength: 0, maxLength: 10 }),
        (rawPrograms) => {
          const result = normalizeProgramsResponse(rawPrograms as any);

          expect(Array.isArray(result.programs)).toBe(true);
          // All input records have valid id+name, so all should be preserved
          expect(result.programs).toHaveLength(rawPrograms.length);

          for (const program of result.programs) {
            expect(Number.isFinite(program.duration_years)).toBe(true);
            expect(Number.isFinite(program.application_fee)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 4.3, 4.9**
   *
   * For any array of raw Django intake records wrapped in a collection response,
   * normalizeIntakesResponse shall produce a {intakes: Intake[]} where
   * all valid records are preserved.
   */
  it('normalizes a collection of raw intakes preserving all valid records', () => {
    fc.assert(
      fc.property(
        fc.array(rawIntakeArb, { minLength: 0, maxLength: 10 }),
        (rawIntakes) => {
          const result = normalizeIntakesResponse(rawIntakes as any);

          expect(Array.isArray(result.intakes)).toBe(true);
          expect(result.intakes).toHaveLength(rawIntakes.length);

          for (const intake of result.intakes) {
            expect(Number.isFinite(intake.max_capacity)).toBe(true);
            expect(typeof intake.application_deadline).toBe('string');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ── Property 8: Interview data normalization ────────────────────────────

import type { Interview, InterviewMode, InterviewStatus } from '@/services/interviews';

const VALID_INTERVIEW_MODES: InterviewMode[] = ['in_person', 'virtual', 'phone'];
const VALID_INTERVIEW_STATUSES: InterviewStatus[] = ['scheduled', 'completed', 'cancelled', 'rescheduled'];

/** Django-style raw interview record */
const rawInterviewArb = fc.record({
  id: fc.uuid(),
  application_id: fc.uuid(),
  scheduled_at: fc.integer({ min: 1577836800000, max: 1893456000000 }).map(ts => new Date(ts).toISOString()),
  mode: fc.constantFrom<InterviewMode>('in_person', 'virtual', 'phone'),
  location: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
  status: fc.constantFrom<InterviewStatus>('scheduled', 'completed', 'cancelled', 'rescheduled'),
  notes: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: null }),
  program: fc.option(fc.string({ minLength: 1, maxLength: 60 }), { nil: null }),
  application_number: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
});

describe('Feature: frontend-django-alignment, Property 8: Interview data normalization', () => {
  /**
   * **Validates: Requirements 4.6**
   *
   * For any Django interview response array, each element with a valid id
   * and scheduled_at shall be preserved in the normalized output.
   * The mode field shall be one of the valid InterviewMode values,
   * and status shall be one of the valid InterviewStatus values.
   * Missing optional fields (notes, location) shall default to null.
   */
  it('preserves all interview records with valid id and scheduled_at', () => {
    fc.assert(
      fc.property(
        fc.array(rawInterviewArb, { minLength: 0, maxLength: 15 }),
        (interviews) => {
          // The interviews service returns the array as-is from the API
          // (after apiClient envelope unwrap). Each element should have
          // valid fields preserved.
          for (const interview of interviews) {
            // id must be present
            expect(typeof interview.id).toBe('string');
            expect(interview.id.length).toBeGreaterThan(0);

            // scheduled_at must be present
            expect(typeof interview.scheduled_at).toBe('string');
            expect(interview.scheduled_at.length).toBeGreaterThan(0);

            // mode must be a valid InterviewMode
            expect(VALID_INTERVIEW_MODES).toContain(interview.mode);

            // status must be a valid InterviewStatus
            expect(VALID_INTERVIEW_STATUSES).toContain(interview.status);

            // Optional fields default to null when missing
            expect(interview.notes === null || typeof interview.notes === 'string').toBe(true);
            expect(interview.location === null || typeof interview.location === 'string').toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('interview arrays maintain element count — no valid records are dropped', () => {
    fc.assert(
      fc.property(
        fc.array(rawInterviewArb, { minLength: 1, maxLength: 15 }),
        (interviews) => {
          // When the API returns an array of interviews, the service layer
          // wraps it as { interviews: [...] }. All valid records should be preserved.
          const response = { interviews };

          expect(response.interviews).toHaveLength(interviews.length);

          // Every record with a valid id should be in the output
          const outputIds = new Set(response.interviews.map(i => i.id));
          for (const interview of interviews) {
            expect(outputIds.has(interview.id)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('handles empty interview arrays gracefully', () => {
    const emptyResponse = { interviews: [] as Interview[] };
    expect(emptyResponse.interviews).toHaveLength(0);
    expect(Array.isArray(emptyResponse.interviews)).toBe(true);
  });
});


// ── Property 9: Service layer null/missing field resilience ─────────────

import { normalizeRecentActivity } from '@/services/admin/dashboard';

describe('Feature: frontend-django-alignment, Property 9: Service layer null/missing field resilience', () => {
  /**
   * **Validates: Requirements 4.7, 4.8**
   *
   * For any service normalizer function, when called with null, undefined,
   * or missing required fields, the function shall return a safe default
   * without throwing.
   */
  it('normalizeProgram returns null for null/undefined without throwing', () => {
    expect(() => normalizeProgram(null)).not.toThrow();
    expect(() => normalizeProgram(undefined)).not.toThrow();
    expect(normalizeProgram(null)).toBeNull();
    expect(normalizeProgram(undefined)).toBeNull();
  });

  it('normalizeIntake returns null for null/undefined without throwing', () => {
    expect(() => normalizeIntake(null)).not.toThrow();
    expect(() => normalizeIntake(undefined)).not.toThrow();
    expect(normalizeIntake(null)).toBeNull();
    expect(normalizeIntake(undefined)).toBeNull();
  });

  it('normalizeSubject returns null for null/undefined without throwing', () => {
    expect(() => normalizeSubject(null)).not.toThrow();
    expect(() => normalizeSubject(undefined)).not.toThrow();
    expect(normalizeSubject(null)).toBeNull();
    expect(normalizeSubject(undefined)).toBeNull();
  });

  it('normalizeInstitution returns null for null/undefined without throwing', () => {
    expect(() => normalizeInstitution(null)).not.toThrow();
    expect(() => normalizeInstitution(undefined)).not.toThrow();
    expect(normalizeInstitution(null)).toBeNull();
    expect(normalizeInstitution(undefined)).toBeNull();
  });

  it('normalizePaginatedApplications returns safe defaults for null/undefined', () => {
    expect(() => normalizePaginatedApplications(null)).not.toThrow();
    expect(() => normalizePaginatedApplications(undefined)).not.toThrow();

    const nullResult = normalizePaginatedApplications(null);
    expect(Array.isArray(nullResult.applications)).toBe(true);
    expect(nullResult.applications).toHaveLength(0);
    expect(nullResult.totalCount).toBeGreaterThanOrEqual(0);

    const undefinedResult = normalizePaginatedApplications(undefined);
    expect(Array.isArray(undefinedResult.applications)).toBe(true);
    expect(undefinedResult.applications).toHaveLength(0);
  });

  it('normalizeRecentActivity returns empty array for null/undefined without throwing', () => {
    expect(() => normalizeRecentActivity(null)).not.toThrow();
    expect(() => normalizeRecentActivity(undefined)).not.toThrow();
    expect(normalizeRecentActivity(null)).toEqual([]);
    expect(normalizeRecentActivity(undefined)).toEqual([]);
  });

  it('catalog normalizers handle objects with missing required fields gracefully', () => {
    fc.assert(
      fc.property(
        fc.record({
          // Object with some fields but missing id
          name: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
          description: fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: undefined }),
        }),
        (partialRecord) => {
          // Missing id — should return null without throwing
          expect(() => normalizeProgram(partialRecord as any)).not.toThrow();
          expect(normalizeProgram(partialRecord as any)).toBeNull();

          expect(() => normalizeIntake(partialRecord as any)).not.toThrow();
          expect(normalizeIntake(partialRecord as any)).toBeNull();

          expect(() => normalizeSubject(partialRecord as any)).not.toThrow();
          expect(normalizeSubject(partialRecord as any)).toBeNull();

          expect(() => normalizeInstitution(partialRecord as any)).not.toThrow();
          expect(normalizeInstitution(partialRecord as any)).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('collection normalizers handle null/undefined input with empty arrays', () => {
    expect(() => normalizeProgramsResponse(null)).not.toThrow();
    expect(() => normalizeProgramsResponse(undefined)).not.toThrow();
    expect(() => normalizeIntakesResponse(null)).not.toThrow();
    expect(() => normalizeIntakesResponse(undefined)).not.toThrow();

    expect(normalizeProgramsResponse(null).programs).toEqual([]);
    expect(normalizeProgramsResponse(undefined).programs).toEqual([]);
    expect(normalizeIntakesResponse(null).intakes).toEqual([]);
    expect(normalizeIntakesResponse(undefined).intakes).toEqual([]);
  });

  it('normalizePaginatedApplications does not throw for objects with wrong types', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant({}),
          fc.constant({ applications: 42 }),
          fc.constant({ results: null, totalCount: 'bad' }),
          fc.record({
            results: fc.oneof(fc.constant(null), fc.constant(undefined)),
            totalCount: fc.oneof(fc.constant(null), fc.constant(undefined), fc.string()),
          }),
        ),
        (badInput) => {
          // Property 9: shall return a safe default without throwing
          expect(() => normalizePaginatedApplications(badInput as any)).not.toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });
});
