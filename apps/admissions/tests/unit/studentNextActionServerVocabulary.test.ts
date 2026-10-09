/**
 * Task 11.1 — the dashboard answers for every action verb the platform publishes.
 *
 * Requirements: R13.1. Finding: STU-04.
 *
 * The drift guard. `STUDENT_NEXT_ACTION_ROUTES` maps a server action verb onto a
 * canonical route, so the one thing that can silently break is the platform
 * gaining a verb this build does not know: the student would then be handed the
 * generic "contact admissions" fallback for an action that has a real destination.
 *
 * These cases parse the **backend** modules — `readiness_service.py` (task 6.5)
 * and `enrollment_service.py` (task 10.3) — and assert the frontend table is total
 * over their union. Same shape as the `payment_phase` mirror guard task 8.2 added,
 * for the same reason: a mirror that is not mechanically compared is a mirror that
 * drifts.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  STUDENT_NEXT_ACTION_FALLBACK_VERB,
  STUDENT_NEXT_ACTION_ROUTES,
  routeForStudentNextAction,
  resolveStudentNextAction,
  selectNextActionSubject,
} from '@/lib/studentNextAction'
import type { Application, ApplicationReadiness, EnrollmentReadiness } from '@/types/database'

const BACKEND = join(__dirname, '../../../../backend/apps/applications')

function backendSource(file: string): string {
  return readFileSync(join(BACKEND, file), 'utf8')
}

/**
 * Every `"action": "<verb>"` in a `_NEXT_ACTION_BY_CODE` map plus every verb the
 * module's own `build_next_actions` / `allowed_actions` appends directly.
 */
function serverActionVerbs(source: string): string[] {
  const verbs = new Set<string>()
  const pattern = /["']action["']\s*:\s*["']([a-z-]+)["']/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    if (match[1]) verbs.add(match[1])
  }
  return [...verbs].sort()
}

const READINESS_VERBS = serverActionVerbs(backendSource('readiness_service.py'))
const ENROLLMENT_VERBS = serverActionVerbs(backendSource('enrollment_service.py'))
const SERVER_VERBS = [...new Set([...READINESS_VERBS, ...ENROLLMENT_VERBS])].sort()

const CONTEXT = { applicationId: 'app-1', isDraft: true, relatedApplicationId: 'app-2' }

describe('the server action vocabulary is fully answered', () => {
  it('reads a non-trivial vocabulary out of both backend modules', () => {
    // A parse that silently found nothing would make every case below vacuous.
    expect(READINESS_VERBS.length).toBeGreaterThanOrEqual(10)
    expect(ENROLLMENT_VERBS.length).toBeGreaterThanOrEqual(4)
    expect(READINESS_VERBS).toContain('submit-application')
    expect(ENROLLMENT_VERBS).toContain('confirm-enrollment')
  })

  it('has a route entry for every verb either service can publish', () => {
    const unmapped = SERVER_VERBS.filter((verb) => !(verb in STUDENT_NEXT_ACTION_ROUTES))
    expect(unmapped).toEqual([])
  })

  it('maps no verb the platform does not publish', () => {
    const extra = Object.keys(STUDENT_NEXT_ACTION_ROUTES).filter(
      (verb) => !SERVER_VERBS.includes(verb),
    )
    expect(extra).toEqual([])
  })

  it('answers a first-party route or an honest null for each one', () => {
    for (const verb of SERVER_VERBS) {
      const href = routeForStudentNextAction(verb, CONTEXT)
      if (href === null) {
        // Only `retry` has nowhere to go, and the panel renders it as a reload.
        expect(verb).toBe('retry')
        continue
      }
      expect(href, verb).toMatch(/^\//)
      expect(href, verb).not.toMatch(/^\/\//)
    }
  })

  it('falls back to a human for a verb this build has never seen', () => {
    const href = routeForStudentNextAction('teleport-to-campus', CONTEXT)
    expect(href).toBe(routeForStudentNextAction(STUDENT_NEXT_ACTION_FALLBACK_VERB, CONTEXT))
  })
})

describe('the fee verb honours the ownership split (R12.3)', () => {
  it('sends a draft to the wizard', () => {
    const href = routeForStudentNextAction('complete-payment', { ...CONTEXT, isDraft: true })
    expect(href).toContain('/student/application-wizard')
  })

  it('sends a submitted application to the payment surface', () => {
    const href = routeForStudentNextAction('complete-payment', { ...CONTEXT, isDraft: false })
    expect(href).toBe('/student/payment?applicationId=app-1')
  })
})

describe('a related application comes from the payload, never from a guess', () => {
  it('routes to the id the duplicate blocker named', () => {
    expect(routeForStudentNextAction('open-existing-application', CONTEXT)).toBe(
      '/student/application/app-2/status',
    )
  })

  it('offers no navigation when the payload named none', () => {
    expect(
      routeForStudentNextAction('open-existing-application', {
        ...CONTEXT,
        relatedApplicationId: null,
      }),
    ).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// The resolver picks a contract; it does not invent one
// ---------------------------------------------------------------------------

function draft(overrides: Partial<Application> = {}): Application {
  return { id: 'app-1', user_id: 'u-1', status: 'draft', ...overrides } as Application
}

function readiness(overrides: Partial<ApplicationReadiness> = {}): ApplicationReadiness {
  return {
    application_id: 'app-1',
    status: 'draft',
    version: 1,
    blockers: [],
    can_submit: false,
    allowed_next_actions: [],
    summary: {},
    evaluated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  }
}

function enrollment(overrides: Partial<EnrollmentReadiness> = {}): EnrollmentReadiness {
  return {
    application_id: 'app-1',
    status: 'approved',
    state: 'confirmable',
    definition: 'Your place is being held.',
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
    existing_enrollment: { this_application: false, other_application_id: null, canonical: true },
    blockers: [],
    can_confirm: true,
    allowed_actions: [],
    evaluated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  }
}

describe('resolveStudentNextAction reads the governing contract', () => {
  it('uses the readiness for a draft, with the server label and blocker sentence', () => {
    const resolved = resolveStudentNextAction({
      application: draft(),
      readiness: readiness({
        blockers: [
          {
            code: 'MINIMUM_GRADES_REQUIRED',
            category: 'grades',
            message: 'At least five subject results are required.',
            retryable: false,
            fields: [],
            details: {},
          },
        ],
        allowed_next_actions: [
          {
            action: 'add-grades',
            label: 'Add your Grade 12 results',
            step: 'education',
            blocker_code: 'MINIMUM_GRADES_REQUIRED',
          },
        ],
      }),
    })
    expect(resolved?.source).toBe('readiness')
    expect(resolved?.label).toBe('Add your Grade 12 results')
    expect(resolved?.blockerMessage).toBe('At least five subject results are required.')
    // The `&step=education` is admissions-v2 task **11.2**: task 11.1 recorded that
    // it deliberately did *not* deep-link a wizard step, because the wizard only
    // honoured `?step=` on history navigation. 11.2 made the wizard honour it on a
    // first load and clamp an unreachable step to the assigned-school checkpoint
    // with an explanation, so the server's own `step` is now carried through. The
    // draft is still addressed by its own id, which is the part that must not change.
    expect(resolved?.href).toBe(
      '/student/application-wizard?mode=resume&draftId=app-1&step=education',
    )
  })

  it('uses the enrollment readiness for a decided application', () => {
    const resolved = resolveStudentNextAction({
      application: draft({
        status: 'conditionally_approved',
        enrollment: enrollment({
          status: 'conditionally_approved',
          state: 'blocked',
          can_confirm: false,
          definition: 'There is something to resolve before you can confirm your enrollment.',
          blockers: [
            {
              code: 'CONDITIONS_NOT_MET',
              category: 'conditions',
              message: 'One condition is still outstanding.',
              retryable: false,
              fields: [],
              details: {},
            },
          ],
          allowed_actions: [
            {
              action: 'resolve-conditions',
              label: 'Send the evidence your conditions ask for',
              blocker_code: 'CONDITIONS_NOT_MET',
            },
          ],
        }),
      }),
    })
    expect(resolved?.source).toBe('enrollment')
    expect(resolved?.label).toBe('Send the evidence your conditions ask for')
    expect(resolved?.href).toBe('/student/application/app-1/status')
  })

  it('does not present a confirmed enrollment as something the student must do', () => {
    const resolved = resolveStudentNextAction({
      application: draft({
        status: 'enrolled',
        payment_status: 'successful',
        enrollment: enrollment({
          status: 'enrolled',
          state: 'confirmed',
          can_confirm: false,
          allowed_actions: [
            { action: 'view-status', label: 'Your place is confirmed', blocker_code: null },
          ],
        }),
      }),
    })
    expect(resolved).toBeNull()
  })

  it('reads a deferred fee on a submitted application as outstanding', () => {
    const resolved = resolveStudentNextAction({
      application: draft({ status: 'submitted', payment_status: 'deferred' }),
    })
    expect(resolved?.source).toBe('payment')
    expect(resolved?.label).toBe('Complete deferred payment')
    expect(resolved?.href).toBe('/student/payment?applicationId=app-1')
  })

  it('is silent when a submitted application is with admissions', () => {
    const resolved = resolveStudentNextAction({
      application: draft({ status: 'under_review', payment_status: 'successful' }),
    })
    expect(resolved).toBeNull()
  })

  it('is silent, rather than guessing, when a draft has no readiness', () => {
    // The hook reports `readinessUnavailable` for this case and the panel says so.
    expect(resolveStudentNextAction({ application: draft(), readiness: null })).toBeNull()
  })

  it('never re-authors a server label', () => {
    const resolved = resolveStudentNextAction({
      application: draft(),
      readiness: readiness({
        can_submit: true,
        allowed_next_actions: [
          {
            action: 'submit-application',
            label: 'Submit your application',
            step: 'submit',
            blocker_code: null,
          },
        ],
      }),
    })
    expect(resolved?.label).toBe('Submit your application')
    expect(resolved?.blockerCode).toBeNull()
    expect(resolved?.blockerMessage).toBeNull()
  })
})

describe('selectNextActionSubject prefers the work the student started', () => {
  it('picks the draft over a submitted application', () => {
    const subject = selectNextActionSubject([
      draft({ id: 'submitted-1', status: 'under_review' }),
      draft({ id: 'draft-1' }),
    ])
    expect(subject?.id).toBe('draft-1')
  })

  it('falls back to the most recently active application', () => {
    const subject = selectNextActionSubject([
      draft({ id: 'recent', status: 'approved' }),
      draft({ id: 'older', status: 'rejected' }),
    ])
    expect(subject?.id).toBe('recent')
  })

  it('answers null for a student with nothing', () => {
    expect(selectNextActionSubject([])).toBeNull()
  })
})
