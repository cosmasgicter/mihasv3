/**
 * The one scoped draft-deletion command (admissions-v2 task 11.1).
 *
 * Requirements: R10.10, R16.5, R16.6. Findings: STU-04, STU-12.
 *
 * Deleting a draft addresses exactly **one user and one application**. That is
 * finding STU-12's fourth clause and task 6.3's rule, and before this the student
 * had no way to do it from the dashboard: the only destructive control there was
 * a "Delete" that called `draftManager.clearAllDrafts(userId)` — a *global* wipe
 * that removed every draft the student had, plus a sweep of every draft key in
 * `localStorage`. A student with two applications who wanted to abandon one had
 * to lose both, and the button that did it sat beside "Continue application".
 *
 * So this command:
 *
 * 1. deletes **one** application through the canonical scoped endpoint;
 * 2. clears **only** that `(user, application)` local snapshot, through task
 *    6.3's `clearWizardDraftCache` — never another draft's snapshot and never any
 *    payment-recovery record;
 * 3. treats a 404 as already-gone, so a double press is not an error;
 * 4. surfaces the platform's payment-linked refusal (`DRAFT_HAS_PAYMENT_ACTIVITY`)
 *    as a refusal rather than as a failure, because a draft with money attached to
 *    it is *protected*, not broken;
 * 5. dispatches the canonical `draftCleared` event carrying only the id it
 *    addressed, so every draft surface converges on the same truth.
 *
 * Both scoped draft-management surfaces call this — the dashboard's draft list and
 * the wizard's draft drawer — so there is one implementation of the command and
 * one confirmation vocabulary. Neither uses `window.confirm` (R16.6).
 */
import { applicationService } from '@/services/applications'
import { clearWizardDraftCache } from '@/lib/draftLocalCache'
import {
  isApplicationMissingError,
  isProtectedDraftPaymentError,
} from '@/lib/applicationSession'
import { sanitizeForLog } from '@/lib/sanitize'
import { logApiError } from '@/lib/apiErrorLogger'
import { useDraftStore } from '@/stores/draftStore'

export type StudentDraftDeleteCode = 'DELETED' | 'DRAFT_HAS_PAYMENT_ACTIVITY' | 'DELETE_FAILED'

export interface StudentDraftDeleteResult {
  success: boolean
  code: StudentDraftDeleteCode
  /** The id that was addressed. Never a list — one command, one draft. */
  applicationId: string
  /** A student-readable reason, present only when `success` is false. */
  error?: string
}

export interface DeleteStudentDraftParams {
  /** The owner. Used only to address the local snapshot, never to widen scope. */
  userId: string | null | undefined
  applicationId: string
}

/** The refusal copy for a payment-linked draft. Names the protection, not a fault. */
export const PROTECTED_DRAFT_MESSAGE =
  'This draft has a payment against it, so it cannot be deleted. Continue the application, or contact admissions if you need help.'

export async function deleteStudentDraft({
  userId,
  applicationId,
}: DeleteStudentDraftParams): Promise<StudentDraftDeleteResult> {
  const id = String(applicationId ?? '')
  if (!id) {
    return {
      success: false,
      code: 'DELETE_FAILED',
      applicationId: id,
      error: 'No draft was selected.',
    }
  }

  try {
    await applicationService.delete(id)
  } catch (error) {
    if (isProtectedDraftPaymentError(error)) {
      return {
        success: false,
        code: 'DRAFT_HAS_PAYMENT_ACTIVITY',
        applicationId: id,
        error: PROTECTED_DRAFT_MESSAGE,
      }
    }
    if (!isApplicationMissingError(error)) {
      logApiError('student-draft-cleanup', '/api/v1/applications/{id}/ (delete)', error)
      return {
        success: false,
        code: 'DELETE_FAILED',
        applicationId: id,
        error:
          error instanceof Error
            ? sanitizeForLog(error.message)
            : 'We could not delete this draft. Please try again.',
      }
    }
    // A draft that is already gone is the outcome the student asked for.
  }

  // Task 6.3 (R10.10): one `(user, application)` snapshot. This never touches
  // another draft's key and never touches `beanola-payment-recovery`.
  //
  // `notify: false` because the cache's own event carries `{applicationId}` while
  // every draft surface listens for `{deletedIds, blockedIds}`. One deletion
  // dispatches one event, in the shape the listeners already read, so a row
  // disappears on the command rather than on the reload that follows it.
  clearWizardDraftCache({ userId: userId ?? null, applicationId: id }, { notify: false })

  try {
    useDraftStore.getState().markCleared()
  } catch {
    // The store may be unavailable outside React.
  }
  try {
    window.dispatchEvent(
      new CustomEvent('draftCleared', { detail: { deletedIds: [id], blockedIds: [] } }),
    )
  } catch {
    // Best-effort UI sync; the caller already has the result.
  }

  return { success: true, code: 'DELETED', applicationId: id }
}
