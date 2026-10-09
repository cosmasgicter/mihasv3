/**
 * The student's authoritative readiness read (admissions-v2 task 11.1).
 *
 * Requirements: R13.1 ("THE dashboard SHALL order each student's next required
 * action before passive metrics and SHALL derive it from backend
 * allowed-next-action data"). Findings: STU-04.
 *
 * Task **6.5** built the contract; this is the first student surface to consume
 * it. `GET /api/v2/student/applications/{id}/readiness/` is produced by the same
 * evaluator `POST /applications/{id}/submit/` re-runs under its row locks, which
 * is the whole reason the dashboard reads it instead of guessing: before this,
 * the dashboard decided the student's next action from three booleans it derived
 * in the browser (`totalDraftCount > 0`, `hasPendingPayment`,
 * `hasScheduledInterview`) and could therefore say "finish your draft" while the
 * platform would have refused the submission for a reason the student never saw.
 *
 * This module adds no rules and no vocabulary. It reads one endpoint for one
 * application the caller already owns, and it answers `null` when the platform
 * declines to evaluate — a readiness that could not be produced is *unknown*,
 * never "nothing to do" (6.5/9.4's fail-closed-on-a-read rule, and the same
 * distinction `enrollmentReadinessOf` makes for the post-decision half).
 */
import { apiClient } from '@/services/client'
import type { ApplicationReadiness } from '@/types/database'

/** The V2 namespace path for one application's readiness (design §8.3). */
export function studentReadinessPath(applicationId: string): string {
  return `/api/v2/student/applications/${encodeURIComponent(applicationId)}/readiness/`
}

export const studentReadinessService = {
  /**
   * The readiness report for one of the caller's own applications.
   *
   * Returns `null` rather than throwing when the platform cannot answer —
   * `CONFIGURATION_UNAVAILABLE` (503) is a retryable refusal, and an out-of-scope
   * or unknown id is a masked 404. Neither is a state the dashboard should turn
   * into an error banner over an otherwise working page, and neither may be
   * rendered as "you have nothing left to do".
   */
  async get(applicationId: string): Promise<ApplicationReadiness | null> {
    if (!applicationId) return null
    const data = await apiClient.request<ApplicationReadiness>(
      studentReadinessPath(applicationId),
    )
    if (!data || typeof data !== 'object') return null
    if (!Array.isArray((data as ApplicationReadiness).allowed_next_actions)) return null
    return data as ApplicationReadiness
  },
}
