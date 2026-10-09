/**
 * Task 11.1 — invariants of the student next-action mapper.
 *
 * Requirements: R13.1, R16.1. Finding: STU-04.
 *
 * These are **task** invariants, not numbered spec properties: task 11.1 has no
 * property-based-testing sub-task, and the design document registers no property
 * for this mapper. They are here because `resolveStudentNextAction` has a real
 * input space — any application status crossed with any payment status crossed with
 * any readiness payload — and the claims worth making about it are universal
 * rather than exemplary.
 *
 * Every generator produces payloads shaped like the platform's, because a mapper
 * asserted against a fixture of its own assumptions proves nothing.
 */
import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  STUDENT_NEXT_ACTION_ROUTES,
  resolveStudentNextAction,
  routeForStudentNextAction,
} from '@/lib/studentNextAction'
import type { Application, ApplicationReadiness, EnrollmentReadiness } from '@/types/database'

const SERVER_VERBS = Object.keys(STUDENT_NEXT_ACTION_ROUTES)

const APPLICATION_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'waitlisted',
  'conditionally_approved',
  'approved',
  'enrolled',
  'rejected',
  'withdrawn',
  'expired',
  'enrollment_expired',
] as const

const PAYMENT_STATUSES = [
  'pending',
  'pending_review',
  'verified',
  'paid',
  'successful',
  'force_approved',
  'failed',
  'rejected',
  'deferred',
  'expired',
  null,
] as const

const idArb = fc.stringMatching(/^[a-z0-9-]{1,24}$/)

const blockerArb = fc.record({
  code: fc.stringMatching(/^[A-Z_]{3,32}$/),
  category: fc.constantFrom('state', 'profile', 'grades', 'documents', 'payment', 'capacity'),
  message: fc.string({ minLength: 1, maxLength: 120 }),
  retryable: fc.boolean(),
  fields: fc.array(fc.stringMatching(/^[a-z_]{1,16}$/), { maxLength: 3 }),
  details: fc.constant({} as Record<string, unknown>),
})

const nextActionArb = fc.record({
  action: fc.constantFrom(...SERVER_VERBS),
  label: fc.string({ minLength: 1, maxLength: 60 }),
  step: fc.constantFrom('personal', 'education', 'program', 'payment', 'submit'),
  blocker_code: fc.option(fc.stringMatching(/^[A-Z_]{3,32}$/), { nil: null }),
})

/**
 * An action list shaped like the platform's: at least one entry (both
 * `build_next_actions` and `EnrollmentReadiness.allowed_actions` guarantee a
 * non-empty list so a student is never dead-ended) and **no repeated verb** (both
 * dedupe with `if mapped["action"] in seen: continue`).
 *
 * Generating a repeated verb would be generating a payload the server cannot
 * send, and it would make the "never asks a student to pay twice" claim a test of
 * the generator rather than of the mapper.
 */
function uniqueActionListArb<T extends { action: string }>(
  entry: fc.Arbitrary<T>,
  maxLength: number,
): fc.Arbitrary<T[]> {
  return fc.uniqueArray(entry, {
    minLength: 1,
    maxLength,
    selector: (item) => item.action,
  })
}

const readinessArb: fc.Arbitrary<ApplicationReadiness> = fc.record({
  application_id: idArb,
  status: fc.constant('draft'),
  version: fc.integer({ min: 1, max: 50 }),
  blockers: fc.array(blockerArb, { maxLength: 4 }),
  can_submit: fc.boolean(),
  allowed_next_actions: uniqueActionListArb(nextActionArb, 5),
  summary: fc.constant({} as ApplicationReadiness['summary']),
  evaluated_at: fc.constant('2026-08-01T00:00:00Z'),
})

const enrollmentArb: fc.Arbitrary<EnrollmentReadiness> = fc
  .record({
    state: fc.constantFrom('confirmable', 'blocked', 'confirmed', 'not_applicable'),
    blockers: fc.array(blockerArb, { maxLength: 3 }),
    allowed_actions: uniqueActionListArb(
      fc.record({
        action: fc.constantFrom(...SERVER_VERBS),
        label: fc.string({ minLength: 1, maxLength: 60 }),
        blocker_code: fc.option(fc.stringMatching(/^[A-Z_]{3,32}$/), { nil: null }),
      }),
      4,
    ),
    otherApplicationId: fc.option(idArb, { nil: null }),
  })
  .map(({ state, blockers, allowed_actions, otherApplicationId }) => ({
    application_id: 'app-1',
    status: 'approved',
    state,
    definition: 'The platform\u2019s own words for this state.',
    deadline: null,
    deadline_passed: false,
    seconds_remaining: null,
    days_remaining: null,
    conditions: {
      total: 0,
      accepted: 0,
      expired: 0,
      outstanding: 0,
      outstanding_conditions: [],
      satisfied: true,
    },
    capacity: {
      canonical: true,
      limit: null,
      occupied: null,
      seats_available: null,
      satisfied: true,
      code: null,
    },
    existing_enrollment: {
      this_application: false,
      other_application_id: otherApplicationId,
      canonical: true,
    },
    blockers,
    can_confirm: state === 'confirmable',
    allowed_actions,
    evaluated_at: '2026-08-01T00:00:00Z',
  }))

const applicationArb: fc.Arbitrary<Application> = fc
  .record({
    id: idArb,
    status: fc.constantFrom(...APPLICATION_STATUSES),
    payment_status: fc.constantFrom(...PAYMENT_STATUSES),
    enrollment: fc.option(enrollmentArb, { nil: null }),
  })
  .map(({ id, status, payment_status, enrollment }) =>
    ({
      id,
      user_id: 'u-1',
      status,
      payment_status: payment_status ?? undefined,
      enrollment,
    }) as Application,
  )

describe('[PBT] the next action is the platform\u2019s, for every input', () => {
  it('never invents a label the payload did not carry', () => {
    fc.assert(
      fc.property(applicationArb, fc.option(readinessArb, { nil: null }), (application, readiness) => {
        const resolved = resolveStudentNextAction({ application, readiness })
        if (!resolved || resolved.source === 'payment') return
        const serverLabels =
          resolved.source === 'readiness'
            ? (readiness?.allowed_next_actions ?? []).map((a) => a.label)
            : (application.enrollment?.allowed_actions ?? []).map((a) => a.label)
        expect(serverLabels).toContain(resolved.label)
      }),
      { numRuns: 300 },
    )
  })

  it('never invents a blocker sentence: it is a payload message, the state definition, or null', () => {
    fc.assert(
      fc.property(applicationArb, fc.option(readinessArb, { nil: null }), (application, readiness) => {
        const resolved = resolveStudentNextAction({ application, readiness })
        if (!resolved || resolved.blockerMessage === null) return
        if (resolved.source === 'payment') return
        const allowed = [
          ...(readiness?.blockers ?? []).map((b) => b.message),
          ...(application.enrollment?.blockers ?? []).map((b) => b.message),
          application.enrollment?.definition,
        ].filter((value): value is string => typeof value === 'string')
        expect(allowed).toContain(resolved.blockerMessage)
      }),
      { numRuns: 300 },
    )
  })

  it('is pure — the same input always answers the same way, and mutates nothing', () => {
    fc.assert(
      fc.property(applicationArb, fc.option(readinessArb, { nil: null }), (application, readiness) => {
        const snapshot = JSON.stringify({ application, readiness })
        const first = resolveStudentNextAction({ application, readiness })
        const second = resolveStudentNextAction({ application, readiness })
        expect(JSON.stringify(first)).toBe(JSON.stringify(second))
        expect(JSON.stringify({ application, readiness })).toBe(snapshot)
      }),
      { numRuns: 200 },
    )
  })

  it('answers a same-origin path or an honest null, never a foreign or malformed URL', () => {
    fc.assert(
      fc.property(applicationArb, fc.option(readinessArb, { nil: null }), (application, readiness) => {
        const resolved = resolveStudentNextAction({ application, readiness })
        if (!resolved) return
        for (const href of [resolved.href, ...resolved.otherActions.map((a) => a.href)]) {
          if (href === null) continue
          expect(href.startsWith('/')).toBe(true)
          expect(href.startsWith('//')).toBe(false)
          expect(href).not.toMatch(/^\/?javascript:/i)
        }
      }),
      { numRuns: 300 },
    )
  })

  it('encodes the application id into every path it builds', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-zA-Z0-9./_-]{1,20}$/),
        fc.constantFrom(...SERVER_VERBS),
        fc.boolean(),
        (rawId, verb, isDraft) => {
          const href = routeForStudentNextAction(verb, {
            applicationId: rawId,
            isDraft,
            relatedApplicationId: rawId,
          })
          if (href === null) return
          // A `..` segment must never survive into a path segment.
          expect(href.split('?')[0]?.split('/')).not.toContain('..')
        },
      ),
      { numRuns: 300 },
    )
  })

  /**
   * This one found a real gap rather than confirming one. `draftHref` returned the
   * wizard's resume URL for any wizard-step verb, so a verb arriving for a
   * non-draft application would have routed the student into a wizard that cannot
   * edit it. The route table is now total over the whole verb vocabulary crossed
   * with both draft states, and this is the claim that keeps it that way.
   */
  it('never routes a non-draft application into the wizard', () => {
    fc.assert(
      fc.property(
        applicationArb.filter((app) => app.status !== 'draft'),
        fc.option(readinessArb, { nil: null }),
        (application, readiness) => {
          const resolved = resolveStudentNextAction({ application, readiness })
          if (!resolved) return
          for (const href of [resolved.href, ...resolved.otherActions.map((a) => a.href)]) {
            expect(href ?? '').not.toContain('/student/application-wizard')
          }
        },
      ),
      { numRuns: 300 },
    )
  })

  it('always resumes a draft by its own id, never by a bare wizard visit', () => {
    fc.assert(
      fc.property(
        applicationArb.filter((app) => app.status === 'draft'),
        readinessArb,
        (application, readiness) => {
          const resolved = resolveStudentNextAction({ application, readiness })
          if (!resolved) return
          for (const href of [resolved.href, ...resolved.otherActions.map((a) => a.href)]) {
            if (!href?.includes('/student/application-wizard')) continue
            expect(href).toMatch(/[?&](mode=resume&draftId=|localDraft=true|mode=new)/)
          }
        },
      ),
      { numRuns: 300 },
    )
  })

  it('never asks a student to pay twice for one application', () => {
    fc.assert(
      fc.property(applicationArb, fc.option(readinessArb, { nil: null }), (application, readiness) => {
        const resolved = resolveStudentNextAction({ application, readiness })
        if (!resolved) return
        const all = [resolved, ...resolved.otherActions]
        const payments = all.filter((entry) => entry.action === 'complete-payment')
        expect(payments.length).toBeLessThanOrEqual(1)
      }),
      { numRuns: 300 },
    )
  })
})
