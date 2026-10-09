/**
 * Rendering the server's enrollment readiness (admissions-v2 task 10.3).
 *
 * Requirements: R13.2, R13.9. Finding: STU-15.
 *
 * This module adds **no** vocabulary and **no** rules. Every state name, every
 * definition, every blocker code and the whole permitted-action list arrive on
 * the response from `EnrollmentService.evaluate_enrollment_readiness` — the same
 * evaluation `POST /applications/{id}/confirm-enrollment/` re-runs under its row
 * locks. What is here is the two things a browser genuinely owns:
 *
 * 1. `enrollmentReadinessOf` — read the contract off an application row, and
 *    answer `null` when the server did not publish one. A missing readiness is
 *    *unknown*, never "nothing to do": that distinction is 6.5/9.4's
 *    fail-closed-on-a-read rule, and rendering an absent evaluation as a green
 *    tick is exactly the class of defect STU-15 describes.
 * 2. `formatEnrollmentCountdown` — turn the server's own `seconds_remaining`
 *    into a phrase. The number is the platform's; only the wording is local, and
 *    it is derived from that number rather than recomputed from the deadline
 *    against the browser clock (which is how a device with a wrong clock talks a
 *    student out of a place they still have).
 */

import type { Application, EnrollmentReadiness } from '@/types/database'

/**
 * The readiness the server published for this application, or `null`.
 *
 * `null` means "the platform did not answer", which the caller must render as
 * unknown. It is deliberately not collapsed into a synthetic
 * `can_confirm: false` object: a caller that cannot tell "blocked" from
 * "unevaluable" will eventually present one as the other.
 */
export function enrollmentReadinessOf(
  application: Pick<Application, 'enrollment'> | null | undefined
): EnrollmentReadiness | null {
  const readiness = application?.enrollment
  if (!readiness || typeof readiness !== 'object') return null
  if (typeof (readiness as EnrollmentReadiness).state !== 'string') return null
  return readiness as EnrollmentReadiness
}

/** True only when the platform says the student may confirm right now. */
export function canConfirmEnrollment(
  application: Pick<Application, 'enrollment'> | null | undefined
): boolean {
  return enrollmentReadinessOf(application)?.can_confirm === true
}

/**
 * A human phrase for the server's countdown, or `null` when there is no
 * deadline to describe.
 *
 * Reads `seconds_remaining` — the server's measurement against the server's
 * clock — and never re-derives it from `deadline` locally. The overdue case is a
 * real phrase rather than a clamp to zero, because "0 days left" and "the
 * deadline passed" are different facts and only one of them is true.
 */
export function formatEnrollmentCountdown(
  readiness: EnrollmentReadiness | null | undefined
): string | null {
  if (!readiness || readiness.seconds_remaining === null) return null
  const seconds = readiness.seconds_remaining

  if (seconds <= 0) {
    const overdueDays = Math.floor(-seconds / 86400)
    if (overdueDays >= 1) {
      return `Deadline passed ${overdueDays} ${overdueDays === 1 ? 'day' : 'days'} ago`
    }
    return 'Deadline has passed'
  }

  const days = Math.floor(seconds / 86400)
  if (days >= 1) return `${days} ${days === 1 ? 'day' : 'days'} left to confirm`

  const hours = Math.floor(seconds / 3600)
  if (hours >= 1) return `${hours} ${hours === 1 ? 'hour' : 'hours'} left to confirm`

  return 'Less than an hour left to confirm'
}

/**
 * The single message to put in front of the student, and where it came from.
 *
 * Precedence is the **server's** blocker order — the refusal precedence declared
 * once in `enrollment_service._raise_for` — so the browser shows the same reason
 * the command would give. When nothing is blocking, the state's own definition
 * is the message.
 */
export function enrollmentMessage(
  readiness: EnrollmentReadiness | null | undefined
): { message: string; blockerCode: string | null } | null {
  if (!readiness) return null
  const blocker = readiness.blockers[0]
  if (blocker) return { message: blocker.message, blockerCode: blocker.code }
  return { message: readiness.definition, blockerCode: null }
}
