/**
 * Rendering the platform's own next action for a student (admissions-v2 task
 * 11.1).
 *
 * Requirements: R13.1, R16.1. Finding: STU-04.
 *
 * This module **adds no rules**. Every action verb, every label and every
 * blocker message arrives on a server payload:
 *
 * - pre-submission: task **6.5**'s readiness (`blockers`,
 *   `allowed_next_actions`, `can_submit`) — the same evaluator submission
 *   re-runs under its row locks;
 * - post-decision: task **10.3**'s enrollment readiness (`state`, `definition`,
 *   `blockers`, `allowed_actions`) — published on the application row itself and
 *   re-run under the enrollment lock;
 * - the fee still owed after submission: the canonical payment status through
 *   `normalizePaymentStatus`, routed to the surface task **8.3** gave ownership
 *   of post-submission collection (R12.3).
 *
 * What is genuinely local is **one** thing: an action verb is not a URL. The
 * server publishes `{action, label, blocker_code}` and cannot know this app's
 * routes, so {@link STUDENT_NEXT_ACTION_ROUTES} maps each verb onto a canonical
 * path built with the `routeRegistry` builders. That table is a route map, not a
 * decision: it never chooses *whether* an action applies, only where pressing it
 * goes. `studentNextActionServerVocabulary.test.ts` parses the two backend
 * modules and fails if the platform gains a verb this table does not answer for.
 *
 * Why this exists at all: before 11.1 the dashboard derived the student's next
 * action from three booleans computed in the browser — a draft exists, a payment
 * looks unpaid, an interview is scheduled — so it could tell a student to
 * "finish your saved application draft" while the platform would have refused
 * that submission for a missing NRC the student was never shown. Finding STU-04
 * is that the dashboard's most prominent claim was the one it was least
 * qualified to make.
 */
import type {
  Application,
  ApplicationReadiness,
  EnrollmentReadiness,
  ReadinessBlocker,
} from '@/types/database'
import { normalizePaymentStatus, requiresStudentPaymentAction } from '@/lib/paymentStatus'
import { enrollmentReadinessOf } from '@/lib/enrollmentReadiness'
import {
  studentApplicationLocalResumePath,
  studentApplicationResumePath,
  studentApplicationWorkspacePath,
} from '@/routes/routeRegistry'
import { PLATFORM_CONTACT_ROUTE } from '@/lib/tenantSupport'

/** Where an action goes, and whether pressing it leaves this page at all. */
export interface NextActionRoute {
  /** The canonical in-app path, or `null` when the action is not a navigation. */
  href: string | null
}

export interface NextActionRouteContext {
  /** The application the action belongs to. */
  applicationId: string
  /** True while the application is still an editable draft. */
  isDraft: boolean
  /**
   * The wizard step the *server* associated with this action (task 6.5 publishes
   * `step` on every `allowed_next_actions` entry), or `null` when it named none.
   *
   * Task 11.2 made the wizard honour `?step=`, so a pre-submission action can now
   * open the step that clears its blocker instead of dropping the student at
   * whatever step the resume machine picked. It stays advisory: the wizard clamps
   * an unreachable step to the assigned-school checkpoint and tells the student
   * why, which is why deep-linking is safe to do at all.
   */
  stepKey?: string | null
  /**
   * Another application named by the blocker's own payload — the duplicate
   * submission (`details.existing_id`) or the already-enrolled application
   * (`existing_enrollment.other_application_id`). Never guessed.
   */
  relatedApplicationId: string | null
}

/**
 * Every action verb the platform publishes, mapped to where it goes.
 *
 * The keys are the union of `readiness_service._NEXT_ACTION_BY_CODE`'s actions
 * plus `submit-application`, and `enrollment_service._NEXT_ACTION_BY_CODE`'s
 * actions plus `confirm-enrollment`. Two rules decide every entry:
 *
 * 1. **A pre-submission action goes to the draft, at the step the server named.**
 *    The wizard owns editing, and it owns pre-submission pay-or-defer (R12.3).
 *    Task 11.1 deliberately did *not* deep-link a step, because the wizard only
 *    honoured `?step=` on history navigation and "a link that silently lands on the
 *    wrong step is worse than one that lands where the student left off". Task
 *    **11.2** made the wizard honour `?step=` on a first load *and* clamp an
 *    unreachable step to the assigned-school checkpoint with an explanation, so the
 *    objection no longer holds and the server's own `step` is passed through.
 * 2. **A post-submission action goes to the one canonical workspace** (task
 *    10.6, R13.13) — except a fee, which goes to `/student/payment`, the surface
 *    that owns post-submission collection.
 */
export const STUDENT_NEXT_ACTION_ROUTES: Record<
  string,
  (context: NextActionRouteContext) => NextActionRoute
> = {
  // ── Pre-submission (task 6.5 readiness) ────────────────────────────────
  'complete-profile': (ctx) => ({ href: draftHref(ctx) }),
  'add-grades': (ctx) => ({ href: draftHref(ctx) }),
  'review-eligibility': (ctx) => ({ href: draftHref(ctx) }),
  'upload-identity-document': (ctx) => ({ href: draftHref(ctx) }),
  'upload-required-documents': (ctx) => ({ href: draftHref(ctx) }),
  'change-selection': (ctx) => ({ href: draftHref(ctx) }),
  'confirm-and-submit': (ctx) => ({ href: draftHref(ctx) }),
  'submit-application': (ctx) => ({ href: draftHref(ctx) }),
  'open-existing-application': (ctx) => ({
    href: ctx.relatedApplicationId
      ? studentApplicationWorkspacePath(ctx.relatedApplicationId)
      : null,
  }),

  // ── The fee (R12.3's ownership split) ──────────────────────────────────
  // A draft's fee is the wizard's pay-or-defer step; a submitted application's
  // fee is `/student/payment`. Same verb, two owners, and the split is the
  // reason `isDraft` is in the context at all.
  'complete-payment': (ctx) => ({
    href: ctx.isDraft ? draftHref(ctx) : studentPaymentPath(ctx.applicationId),
  }),

  // ── Post-decision (task 10.3 enrollment readiness) ─────────────────────
  'confirm-enrollment': (ctx) => ({ href: studentApplicationWorkspacePath(ctx.applicationId) }),
  'resolve-conditions': (ctx) => ({ href: studentApplicationWorkspacePath(ctx.applicationId) }),
  'view-enrolled-application': (ctx) => ({
    href: ctx.relatedApplicationId
      ? studentApplicationWorkspacePath(ctx.relatedApplicationId)
      : studentApplicationWorkspacePath(ctx.applicationId),
  }),
  'view-status': (ctx) => ({ href: studentApplicationWorkspacePath(ctx.applicationId) }),

  // ── Neither a step nor a decision ──────────────────────────────────────
  // `retry` answers `CONFIGURATION_UNAVAILABLE`: the platform could not evaluate
  // the application's configuration and says so is temporary. There is nowhere
  // to send the student, so the panel renders the refusal with the page's own
  // refresh instead of a link that reloads the same failure.
  retry: () => ({ href: null }),
  'contact-admissions': () => ({ href: PLATFORM_CONTACT_ROUTE }),
}

/**
 * The verb used when the platform publishes one this build does not know. The
 * server does the same thing for a blocker with no mapping, so an unknown verb
 * degrades to a human rather than to a blank card.
 */
export const STUDENT_NEXT_ACTION_FALLBACK_VERB = 'contact-admissions'

/**
 * The wizard, resuming this exact draft — or the workspace when the application
 * is no longer a draft.
 *
 * The second half is a guard the property suite asked for rather than a case that
 * occurs today: every wizard-step verb is published by task 6.5's readiness, which
 * only ever evaluates an editable application. But the route table is a *total*
 * function over the platform's whole verb vocabulary, and if a wizard-step verb
 * ever arrived for a submitted application the honest destination is the workspace:
 * the wizard cannot edit it, which is what `APPLICATION_NOT_EDITABLE` says.
 *
 * Resuming is always addressed by id (`?mode=resume&draftId=…`) and never by a
 * bare wizard visit, so the wizard cannot pick a different draft by timestamp —
 * the draft-lifecycle rule in `enterprise-tenancy.md`.
 */
function draftHref(ctx: NextActionRouteContext): string {
  if (!ctx.applicationId) return studentApplicationLocalResumePath()
  if (!ctx.isDraft) return studentApplicationWorkspacePath(ctx.applicationId)
  return studentApplicationResumePath(ctx.applicationId, ctx.stepKey ?? null)
}

function studentPaymentPath(applicationId: string): string {
  return `/student/payment?applicationId=${encodeURIComponent(applicationId)}`
}

/** Which server contract answered. Rendered as provenance, not as a rule. */
export type StudentNextActionSource = 'readiness' | 'enrollment' | 'payment'

export interface StudentNextAction {
  /** The server's action verb. */
  action: string
  /** The server's own label for it. Never re-authored here. */
  label: string
  /** Where pressing it goes, or `null` when the action is not a navigation. */
  href: string | null
  /** The application the action belongs to. */
  applicationId: string
  /** The application's canonical status, for the row the panel names. */
  applicationStatus: string
  /** The server's stable blocker code, when the action clears one. */
  blockerCode: string | null
  /** The server's own sentence for that blocker. */
  blockerMessage: string | null
  /** Which contract answered. */
  source: StudentNextActionSource
  /** Every other action the platform offered, in its order. */
  otherActions: Array<{ action: string; label: string; href: string | null }>
}

export interface ResolveStudentNextActionInput {
  application: Application | null | undefined
  /** Task 6.5's readiness for `application`, when it is a draft and one was read. */
  readiness?: ApplicationReadiness | null
}

function blockerFor(
  code: string | null,
  blockers: ReadinessBlocker[] | EnrollmentReadiness['blockers'] | undefined,
): { code: string | null; message: string | null } {
  if (!code || !Array.isArray(blockers)) return { code, message: null }
  const match = blockers.find((blocker) => blocker?.code === code)
  return { code, message: match?.message ?? null }
}

/**
 * Where an action verb goes. An unknown verb degrades to the same human the
 * server's own unmapped-blocker fallback names, rather than to a dead control.
 */
export function routeForStudentNextAction(
  action: string,
  context: NextActionRouteContext,
): string | null {
  const resolver = STUDENT_NEXT_ACTION_ROUTES[action]
  if (resolver) return resolver(context).href
  const fallback = STUDENT_NEXT_ACTION_ROUTES[STUDENT_NEXT_ACTION_FALLBACK_VERB]
  return fallback ? fallback(context).href : null
}

/** One server action list, in the server's order, turned into rendered actions. */
function fromServerActions(
  actions: Array<{ action: string; label: string; blocker_code: string | null; step?: string }>,
  blockers: ReadinessBlocker[] | EnrollmentReadiness['blockers'] | undefined,
  context: NextActionRouteContext,
  application: { status: string },
  source: StudentNextActionSource,
  fallbackDetail: string | null,
): StudentNextAction | null {
  const primary = actions[0]
  if (!primary) return null
  const blocker = blockerFor(primary.blocker_code, blockers)
  return {
    action: primary.action,
    label: primary.label,
    href: routeForStudentNextAction(primary.action, { ...context, stepKey: primary.step ?? null }),
    applicationId: context.applicationId,
    applicationStatus: application.status,
    blockerCode: blocker.code,
    blockerMessage: blocker.message ?? fallbackDetail,
    source,
    otherActions: actions.slice(1).map((entry) => ({
      action: entry.action,
      label: entry.label,
      href: routeForStudentNextAction(entry.action, { ...context, stepKey: entry.step ?? null }),
    })),
  }
}

/**
 * The one next action for one application, taken from whichever server contract
 * governs its current lifecycle point — or `null` when the platform published no
 * outstanding action for it.
 *
 * `null` means "this application is waiting on the school, not on the student".
 * It never means "readiness was unavailable": an unevaluable draft still yields
 * the platform's own `retry` action, because 6.5 answers
 * `CONFIGURATION_UNAVAILABLE` as a *blocker*, not as silence.
 */
export function resolveStudentNextAction({
  application,
  readiness,
}: ResolveStudentNextActionInput): StudentNextAction | null {
  if (!application?.id) return null

  const applicationId = String(application.id)
  const applicationStatus = String(application.status ?? '')
  const isDraft = applicationStatus === 'draft'

  // ── Pre-submission: the readiness the platform published ───────────────
  if (isDraft && readiness) {
    const resolved = fromServerActions(
      readiness.allowed_next_actions,
      readiness.blockers,
      { applicationId, isDraft, relatedApplicationId: existingIdFromBlockers(readiness.blockers) },
      { status: applicationStatus },
      'readiness',
      null,
    )
    if (resolved) return resolved
  }

  // ── Post-decision: the enrollment readiness on the row ─────────────────
  // `confirmed` and `not_applicable` are excluded because neither is waiting on
  // the student: one is done and the other has not started. Their `allowed_actions`
  // are informational ("Your place is confirmed"), and presenting one as the
  // student's next required action is the inverse of the STU-15 defect.
  const enrollment = enrollmentReadinessOf(application)
  if (enrollment && enrollment.state !== 'not_applicable' && enrollment.state !== 'confirmed') {
    const resolved = fromServerActions(
      enrollment.allowed_actions,
      enrollment.blockers,
      {
        applicationId,
        isDraft,
        relatedApplicationId: enrollment.existing_enrollment?.other_application_id ?? null,
      },
      { status: applicationStatus },
      'enrollment',
      enrollment.definition ?? null,
    )
    if (resolved) return resolved
  }

  // ── A fee still owed after submission (R12.3, task 8.3) ────────────────
  // The status is the platform's; `requiresStudentPaymentAction` only reads it.
  // A draft is deliberately excluded: an unpaid draft's fee is the wizard's step,
  // and it is already covered by the readiness branch above (`PAYMENT_REQUIRED`).
  if (!isDraft && requiresStudentPaymentAction(application.payment_status)) {
    const context: NextActionRouteContext = { applicationId, isDraft, relatedApplicationId: null }
    const deferred = normalizePaymentStatus(application.payment_status) === 'deferred'
    return {
      action: 'complete-payment',
      label: deferred ? 'Complete deferred payment' : 'Pay the application fee',
      href: routeForStudentNextAction('complete-payment', context),
      applicationId,
      applicationStatus,
      blockerCode: 'PAYMENT_REQUIRED',
      blockerMessage: deferred
        ? 'You chose to pay this fee later. It is still outstanding.'
        : 'The application fee has not been settled yet.',
      source: 'payment',
      otherActions: [],
    }
  }

  return null
}

function existingIdFromBlockers(blockers: ReadinessBlocker[] | undefined): string | null {
  if (!Array.isArray(blockers)) return null
  for (const blocker of blockers) {
    const candidate = blocker?.details?.existing_id
    if (typeof candidate === 'string' && candidate.length > 0) return candidate
  }
  return null
}

/**
 * The application whose next action the dashboard shows, out of everything the
 * student has.
 *
 * This is a **selection**, not a derivation: it decides whose server payload is
 * rendered, and it does not decide what that payload says. The order is the
 * order of the student's own commitment — an editable draft is work they have
 * started and can finish now, then the applications the school has, most
 * recently active first. `applications` is expected in the activity order
 * `sortApplicationsByActivity` already produces.
 */
export function selectNextActionSubject(
  applications: Application[],
): Application | null {
  if (!Array.isArray(applications) || applications.length === 0) return null
  return applications.find((app) => app.status === 'draft') ?? applications[0] ?? null
}
