/**
 * Enrollment-readiness invariants over every shape the server can publish.
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task 10.3.
 * Requirements: R13.2, R13.9, R14.1.
 * Finding:      STU-15.
 *
 * These are **task invariants**, not numbered spec properties — task 10.3 has no
 * property-based-testing sub-task, so nothing here is registered in the spec's
 * property register. They exist because the readiness payload is a product space
 * (four states × the blocker catalogue × a countdown that spans past and future ×
 * a payload that may be absent entirely), and the dangerous cases are the corners:
 * an absent readiness read as "nothing to do", and a negative countdown rendered
 * as time remaining. Both are the STU-15 defect shape.
 *
 * The invariants:
 *   1. A readiness is only recognised when the server actually published one —
 *      no shape is coerced into a synthetic "cannot confirm".
 *   2. `canConfirmEnrollment` is exactly the server's `can_confirm`, never
 *      inferred from a status string.
 *   3. The countdown phrase agrees with the sign of the server's own number: a
 *      spent deadline is never phrased as time remaining, and vice versa.
 *   4. There is always exactly one message, and it is the server's — the first
 *      blocker when blocked, the state definition otherwise.
 *   5. The helpers are pure: same payload, same answer.
 */
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  canConfirmEnrollment,
  enrollmentMessage,
  enrollmentReadinessOf,
  formatEnrollmentCountdown,
} from '@/lib/enrollmentReadiness'
import type { Application, EnrollmentReadiness } from '@/types/database'

const BLOCKER_CODES = [
  'INVALID_STATUS_FOR_ENROLLMENT',
  'CONDITIONS_NOT_MET',
  'DEADLINE_PASSED',
  'PROGRAM_CAPACITY_REACHED',
  'ALREADY_ENROLLED',
  'DUPLICATE_ENROLLMENT',
] as const

const blocker = fc.record({
  code: fc.constantFrom(...BLOCKER_CODES),
  category: fc.constant('enrollment'),
  message: fc.string({ minLength: 1, maxLength: 120 }).map(s => `${s}.`),
  retryable: fc.constant(false),
  fields: fc.constant([] as string[]),
  details: fc.constant({} as Record<string, unknown>),
})

/** A year either side of "now", in seconds — so past and future are both dense. */
const secondsRemaining = fc.oneof(
  fc.constant(null),
  fc.integer({ min: -400 * 86400, max: 400 * 86400 })
)

const readinessPayload: fc.Arbitrary<EnrollmentReadiness> = fc
  .record({
    state: fc.constantFrom('confirmable', 'blocked', 'confirmed', 'not_applicable'),
    canConfirm: fc.boolean(),
    definition: fc.string({ minLength: 1, maxLength: 160 }),
    deadline: fc.oneof(fc.constant(null), fc.constant('2026-09-30T23:59:59Z')),
    seconds: secondsRemaining,
    blockers: fc.array(blocker, { maxLength: 4 }),
    outstanding: fc.integer({ min: 0, max: 5 }),
    limit: fc.oneof(fc.constant(null), fc.integer({ min: 0, max: 200 })),
  })
  .map(parts => ({
    application_id: 'app-1',
    status: 'approved',
    state: parts.state,
    definition: parts.definition,
    deadline: parts.deadline,
    deadline_passed: parts.seconds !== null && parts.seconds <= 0,
    seconds_remaining: parts.seconds,
    days_remaining: parts.seconds === null ? null : Math.floor(parts.seconds / 86400),
    conditions: {
      total: parts.outstanding,
      accepted: 0,
      expired: 0,
      outstanding: parts.outstanding,
      outstanding_conditions: [],
      satisfied: parts.outstanding === 0,
    },
    capacity: {
      canonical: true,
      limit: parts.limit,
      occupied: 0,
      seats_available: parts.limit,
      satisfied: parts.limit === null || parts.limit > 0,
      code: null,
    },
    existing_enrollment: {
      this_application: parts.state === 'confirmed',
      other_application_id: null,
      canonical: true,
    },
    blockers: parts.blockers,
    can_confirm: parts.canConfirm,
    allowed_actions: parts.blockers.map(b => ({
      action: 'contact-admissions',
      label: 'Contact admissions for help',
      blocker_code: b.code,
    })),
    evaluated_at: '2026-09-01T00:00:00Z',
  }))

/** Anything a row's `enrollment` key could hold, including things it should not. */
const enrollmentField = fc.oneof(
  readinessPayload,
  fc.constant(null),
  fc.constant(undefined),
  fc.constant({}),
  fc.constant({ state: 42 }),
  fc.constant('confirmable'),
  fc.constant(0)
)

function applicationWith(enrollment: unknown): Application {
  return { id: 'app-1', user_id: 'user-1', status: 'approved', enrollment } as Application
}

describe('enrollment readiness invariants (task 10.3)', () => {
  it('1. only a payload the server actually published is recognised', () => {
    fc.assert(
      fc.property(enrollmentField, field => {
        const resolved = enrollmentReadinessOf(applicationWith(field))
        if (resolved === null) return true
        // A recognised readiness is the very object handed in, unmodified — the
        // helper never fabricates one, so "unknown" stays distinguishable from
        // "blocked". Collapsing them is how an unevaluable configuration gets
        // rendered as "nothing to do" (STU-13/STU-15's shared shape).
        expect(resolved).toBe(field)
        expect(typeof resolved.state).toBe('string')
        return true
      }),
      { numRuns: 400 }
    )
  })

  it('2. confirmability is the server\u2019s answer and nothing else', () => {
    fc.assert(
      fc.property(enrollmentField, field => {
        const application = applicationWith(field)
        const resolved = enrollmentReadinessOf(application)
        expect(canConfirmEnrollment(application)).toBe(resolved?.can_confirm === true)
        return true
      }),
      { numRuns: 400 }
    )
  })

  it('3. the countdown phrase never contradicts the sign of the server number', () => {
    fc.assert(
      fc.property(readinessPayload, readiness => {
        const phrase = formatEnrollmentCountdown(readiness)
        if (readiness.seconds_remaining === null) {
          expect(phrase).toBeNull()
          return true
        }
        expect(phrase).not.toBeNull()
        const spent = readiness.seconds_remaining <= 0
        // A spent deadline is described as spent; time remaining is described as
        // remaining. Never the other way round, at any magnitude.
        expect(/passed/i.test(phrase as string)).toBe(spent)
        expect(/left to confirm/i.test(phrase as string)).toBe(!spent)
        return true
      }),
      { numRuns: 500 }
    )
  })

  it('4. there is exactly one message, and it comes from the server', () => {
    fc.assert(
      fc.property(readinessPayload, readiness => {
        const note = enrollmentMessage(readiness)
        expect(note).not.toBeNull()
        const { message, blockerCode } = note as { message: string; blockerCode: string | null }
        if (readiness.blockers.length > 0) {
          expect(blockerCode).toBe(readiness.blockers[0].code)
          expect(message).toBe(readiness.blockers[0].message)
        } else {
          expect(blockerCode).toBeNull()
          expect(message).toBe(readiness.definition)
        }
        return true
      }),
      { numRuns: 400 }
    )
  })

  it('5. the helpers are pure', () => {
    fc.assert(
      fc.property(readinessPayload, readiness => {
        const snapshot = JSON.stringify(readiness)
        const first = [
          formatEnrollmentCountdown(readiness),
          JSON.stringify(enrollmentMessage(readiness)),
          canConfirmEnrollment(applicationWith(readiness)),
        ]
        const second = [
          formatEnrollmentCountdown(readiness),
          JSON.stringify(enrollmentMessage(readiness)),
          canConfirmEnrollment(applicationWith(readiness)),
        ]
        expect(second).toEqual(first)
        expect(JSON.stringify(readiness)).toBe(snapshot)
        return true
      }),
      { numRuns: 300 }
    )
  })
})
