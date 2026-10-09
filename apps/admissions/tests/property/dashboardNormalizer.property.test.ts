/**
 * Property-based tests for Dashboard Normalizers
 * Feature: live-500-fixes
 *
 * Properties 1, 2
 *
 * **Validates: Requirements 2.3, 8.1, 8.7**
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { normalizeRecentActivity, normalizeStats } from '../../src/services/admin/dashboard'
import type { AdminDashboardStats } from '../../src/services/admin/dashboard'

// ── Property 2: Recent activity normalizer preserves items with null timestamps ──

describe('Property 2: Recent activity normalizer preserves items with null timestamps', () => {
  /**
   * For any array of audit log entries where each entry has an id, action,
   * entity_type, and a created_at that may be null, a string, or undefined,
   * normalizeRecentActivity() should return an array where no valid entry
   * is dropped solely because created_at is null. Entries with null
   * created_at should receive a fallback timestamp.
   *
   * **Validates: Requirements 2.3, 8.1**
   */

  /** Arbitrary for a valid ISO timestamp string */
  const isoTimestampArb = fc.date({
    min: new Date('2020-01-01'),
    max: new Date('2030-01-01'),
    noInvalidDate: true,
  }).map(d => d.toISOString())

  /** Arbitrary for created_at: null, valid string, or undefined */
  const createdAtArb = fc.oneof(
    fc.constant(null),
    isoTimestampArb,
    fc.constant(undefined),
  )

  /** Arbitrary for a single audit log entry with id, action, entity_type, created_at */
  const auditLogEntryArb = fc.record({
    id: fc.integer({ min: 1, max: 100000 }),
    action: fc.constantFrom('POST', 'PUT', 'PATCH', 'DELETE', 'login', 'status_change'),
    entity_type: fc.constantFrom('applications', 'users', 'documents', 'sessions'),
    created_at: createdAtArb,
  })

  it('entries with null created_at are not dropped and receive a fallback timestamp', () => {
    fc.assert(
      fc.property(
        fc.array(auditLogEntryArb, { minLength: 1, maxLength: 20 }),
        (entries) => {
          const result = normalizeRecentActivity(entries)

          // Count entries that have both a non-empty id and a non-empty action
          // (these are the entries that should survive normalization)
          const validInputCount = entries.filter(e => e.id && e.action).length

          // The output should contain at least as many items as valid inputs
          expect(result.length).toBeGreaterThanOrEqual(validInputCount)

          // Every output item must have a non-empty timestamp
          for (const activity of result) {
            expect(activity.timestamp).toBeTruthy()
            // Timestamp should be a valid ISO string
            expect(Number.isNaN(new Date(activity.timestamp).getTime())).toBe(false)
          }
        },
      ),
      { numRuns: 200 },
    )
  })

  it('entries with string created_at preserve the original timestamp', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 100000 }),
            action: fc.constantFrom('POST', 'PUT', 'DELETE'),
            entity_type: fc.constantFrom('applications', 'users'),
            created_at: isoTimestampArb,
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (entries) => {
          const result = normalizeRecentActivity(entries)

          // All entries have valid id, action, and string timestamp — none should be dropped
          expect(result.length).toBe(entries.length)

          // Each result timestamp should match the input created_at
          for (let i = 0; i < result.length; i++) {
            expect(result[i].timestamp).toBe(entries[i].created_at)
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('entries with null created_at get a fallback timestamp (not empty string)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 100000 }),
            action: fc.constantFrom('POST', 'PUT'),
            entity_type: fc.constantFrom('applications'),
            created_at: fc.constant(null),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (entries) => {
          const result = normalizeRecentActivity(entries)

          // None should be dropped — null created_at should get a fallback
          expect(result.length).toBe(entries.length)

          for (const activity of result) {
            expect(activity.timestamp).toBeTruthy()
            expect(typeof activity.timestamp).toBe('string')
            expect(activity.timestamp.length).toBeGreaterThan(0)
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('entries without any timestamp key and without message are filtered out', () => {
    // Items with no id, no action, and no timestamp key should be dropped
    const result = normalizeRecentActivity([
      { foo: 'bar' },
      {},
      null,
      42,
      'string',
    ])
    expect(result.length).toBe(0)
  })
})

// ── Property 1: Dashboard normalizer maps backend response to valid stats ──

describe('Property 1: Dashboard normalizer maps backend response to valid stats', () => {
  /**
   * For any valid backend dashboard response, normalizeStats() should produce
   * an AdminDashboardStats object where all numeric fields are finite numbers
   * (never NaN or undefined). When any field is null or missing, the
   * corresponding stat should default to 0.
   *
   * **Validates: Requirements 8.1, 8.7**
   */

  /** Arbitrary for a numeric value that could come from the backend: number, null, undefined, string-number */
  const backendNumericArb = fc.oneof(
    fc.integer({ min: 0, max: 10000 }),
    fc.double({ min: 0, max: 10000, noNaN: true }),
    fc.constant(null),
    fc.constant(undefined),
    fc.integer({ min: 0, max: 9999 }).map(n => String(n)),
    fc.constant('not-a-number'),
    fc.constant(NaN),
    fc.constant(Infinity),
    fc.constant(-Infinity),
  )

  /**
   * Arbitrary for read-health values.
   *
   * The vocabulary is the three states the backend **derives** from whether each
   * metric source answered (`operational` / `degraded` / `unknown`), which
   * replaced the four adjectives (`excellent`/`good`/`warning`/`critical`) the
   * backend never sent and the frontend defaulted to `'good'` (task 9.2,
   * ADM-02). The invalid inputs stay: what changed is that they now normalise to
   * `null`, not to the friendliest word in the enum.
   */
  const systemHealthArb = fc.oneof(
    fc.constantFrom('operational', 'degraded', 'unknown'),
    fc.constant(null),
    fc.constant(undefined),
    fc.constant('invalid'),
    fc.constant('good'),
    fc.constant(42),
  )

  /** Arbitrary for a backend stats-like object with snake_case and camelCase fields */
  const backendStatsArb = fc.record({
    total_applications: backendNumericArb,
    pending_applications: backendNumericArb,
    approved_applications: backendNumericArb,
    conditionally_approved_applications: backendNumericArb,
    enrolled_applications: backendNumericArb,
    accepted_applications: backendNumericArb,
    rejected_applications: backendNumericArb,
    total_programs: backendNumericArb,
    active_intakes: backendNumericArb,
    total_students: backendNumericArb,
    today_applications: backendNumericArb,
    week_applications: backendNumericArb,
    month_applications: backendNumericArb,
    avg_processing_time: backendNumericArb,
    avg_processing_time_hours: backendNumericArb,
    median_processing_time_hours: backendNumericArb,
    p95_processing_time_hours: backendNumericArb,
    decision_velocity_24h: backendNumericArb,
    active_users: backendNumericArb,
    active_users_last_7d: backendNumericArb,
    system_health: systemHealthArb,
  })

  /** All numeric keys on AdminDashboardStats */
  const NUMERIC_STAT_KEYS: (keyof AdminDashboardStats)[] = [
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
  ]

  it('all numeric fields are finite and never NaN', () => {
    fc.assert(
      fc.property(backendStatsArb, (rawStats) => {
        const stats = normalizeStats(rawStats as Record<string, unknown>)

        for (const key of NUMERIC_STAT_KEYS) {
          const value = stats[key]
          expect(typeof value).toBe('number')
          expect(Number.isFinite(value as number)).toBe(true)
          expect(Number.isNaN(value)).toBe(false)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('systemHealth is a derived state or null — never a defaulted adjective', () => {
    fc.assert(
      fc.property(backendStatsArb, (rawStats) => {
        const stats = normalizeStats(rawStats as Record<string, unknown>)

        // `null` is a first-class outcome: an unrecognised or absent health value
        // means the platform did not measure one, and saying so is the point
        // (task 9.2, ADM-02). What is no longer reachable is a *substituted*
        // grade.
        expect([null, 'operational', 'degraded', 'unknown']).toContain(stats.systemHealth)
        if (typeof rawStats.system_health !== 'string'
            || !['operational', 'degraded', 'unknown'].includes(rawStats.system_health)) {
          expect(stats.systemHealth).toBeNull()
        }
      }),
      { numRuns: 200 },
    )
  })

  it('null/undefined input produces zeroed numerics and NO health claim', () => {
    const statsFromUndefined = normalizeStats(undefined)
    const statsFromEmpty = normalizeStats({})

    // The legacy `stats` block is still numeric-typed, so its numbers still
    // default to 0 — but nothing on the dashboard reads it any more: the page
    // renders `metrics`, whose absent entries render "Unknown" (task 9.2).
    for (const key of NUMERIC_STAT_KEYS) {
      expect(statsFromUndefined[key]).toBe(0)
      expect(statsFromEmpty[key]).toBe(0)
    }

    expect(statsFromUndefined.systemHealth).toBeNull()
    expect(statsFromEmpty.systemHealth).toBeNull()
  })

  it('valid numeric values pass through correctly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10000 }),
        fc.integer({ min: 0, max: 10000 }),
        fc.integer({ min: 0, max: 10000 }),
        (total, pending, approved) => {
          const stats = normalizeStats({
            total_applications: total,
            pending_applications: pending,
            approved_applications: approved,
          } as Record<string, unknown>)

          expect(stats.totalApplications).toBe(total)
          expect(stats.pendingApplications).toBe(pending)
          expect(stats.approvedApplications).toBe(approved)
        },
      ),
      { numRuns: 100 },
    )
  })
})
