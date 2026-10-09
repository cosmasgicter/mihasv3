/**
 * The wizard's current blockers, read from the platform (admissions-v2 task 11.2).
 *
 * Requirements: **R16.1** (the student surface leads with the work that is
 * actually outstanding), **R10.6** (submission re-evaluates everything under row
 * locks). Findings: **STU-03**.
 *
 * ── Why this exists at all ──────────────────────────────────────────────────
 *
 * The wizard used to print its "current blockers" from `buildWizardReadiness` — a
 * list computed in the browser out of form fields — as *"Missing: Assigned school,
 * NRC or passport +8 more"*. That is the same defect task 11.1 removed from the
 * dashboard: the browser cannot see the platform's gates (capacity, duplicates,
 * the intake window, a fee that is not configured, the versioned document
 * contract), so the sentence a student reads and the decision the platform makes
 * can disagree.
 *
 * So the blockers come from task **6.5**'s
 * `GET /api/v2/student/applications/{id}/readiness/` — produced by the very
 * evaluator `POST /applications/{id}/submit/` re-runs under its locks — through
 * task 11.1's `studentReadinessService`, on the **same query key** the dashboard
 * uses, so a student who arrives from the dashboard's next-action panel does not
 * pay for a second identical read.
 *
 * What this hook does **not** do:
 *
 * - it does not replace `buildWizardReadiness`. That is per-field form validation
 *   and it is what keeps the wizard usable with no network; it stays exactly where
 *   it was, gating the step controls. The distinction is deliberate: *what may be
 *   submitted* is the platform's answer, *what is left to type on this step* is the
 *   form's.
 * - it does not turn an unreadable readiness into "nothing is blocking you".
 *   `unavailable` is a third state, said out loud, for the same reason 11.1's panel
 *   keeps "we could not check" apart from "nothing needs you".
 * - it never fires without an online draft id, so a wizard on step 1 (no draft
 *   yet) costs nothing.
 */
import { useQuery } from '@tanstack/react-query'

import { studentReadinessService } from '@/services/studentReadiness'
import type { ApplicationReadiness, ReadinessBlocker } from '@/types/database'

export interface WizardServerReadiness {
  /** The platform's blockers, in the platform's order. Empty when it published none. */
  blockers: ReadinessBlocker[]
  /** The platform's own answer to "may this be submitted". `null` while unknown. */
  canSubmit: boolean | null
  /** The whole payload, for surfaces that need more than the blocker list. */
  readiness: ApplicationReadiness | null
  isLoading: boolean
  /** True when there is a draft to evaluate but the platform did not answer. */
  unavailable: boolean
  refetch: () => void
}

export function useWizardReadiness(
  applicationId: string | null | undefined,
  options: { enabled?: boolean } = {},
): WizardServerReadiness {
  const id = typeof applicationId === 'string' ? applicationId.trim() : ''
  const enabled = options.enabled !== false && id.length > 0

  const { data, isLoading, isError, refetch } = useQuery({
    // Deliberately the same key as `useStudentNextAction` (task 11.1): one
    // application's readiness is one cache entry, whichever surface asked for it.
    queryKey: ['application-readiness', id],
    queryFn: () => studentReadinessService.get(id),
    enabled,
    staleTime: 30_000,
    retry: 1,
  })

  const readiness = data ?? null

  return {
    blockers: Array.isArray(readiness?.blockers) ? readiness!.blockers : [],
    canSubmit: readiness ? Boolean(readiness.can_submit) : null,
    readiness,
    isLoading: enabled && isLoading,
    unavailable: enabled && !isLoading && (isError || !readiness),
    refetch: () => {
      void refetch()
    },
  }
}
