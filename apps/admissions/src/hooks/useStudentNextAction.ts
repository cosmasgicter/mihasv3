/**
 * The dashboard's next action, read from the platform (admissions-v2 task 11.1).
 *
 * Requirements: R13.1, R16.1. Finding: STU-04.
 *
 * One query, for one application: the readiness of the draft the student is
 * actually working on. It is deliberately not a query per application —
 * `GET /api/v2/student/applications/{id}/readiness/` runs the whole submission
 * evaluation (assignment resolution, canonical grades, versioned document
 * requirements, capacity, duplicates, the intake window), so fanning it out over
 * a page of applications would make the dashboard the most expensive read in the
 * product to answer a question only the subject application has.
 *
 * Every other lifecycle point already answers without a second request: task
 * 10.3's enrollment readiness is published *on* the application row, and the fee
 * state is the row's canonical payment status. So the dashboard costs exactly one
 * extra call, and only while a draft exists.
 */
import { useQuery } from '@tanstack/react-query'

import type { Application } from '@/types/database'
import { studentReadinessService } from '@/services/studentReadiness'
import {
  resolveStudentNextAction,
  selectNextActionSubject,
  type StudentNextAction,
} from '@/lib/studentNextAction'

export interface UseStudentNextActionResult {
  /** The platform's next action, or `null` when nothing is outstanding. */
  nextAction: StudentNextAction | null
  /** The application the action belongs to. */
  subject: Application | null
  /** True while the subject draft's readiness is still being read. */
  isLoading: boolean
  /**
   * True when the subject is a draft whose readiness could not be read. The
   * panel says so instead of presenting a browser-derived guess as the
   * platform's answer — an unreadable readiness is unknown, not "nothing to do".
   */
  readinessUnavailable: boolean
}

export function useStudentNextAction(
  applications: Application[],
  options: { enabled?: boolean } = {},
): UseStudentNextActionResult {
  const enabled = options.enabled !== false
  const subject = selectNextActionSubject(applications)
  const subjectIsDraft = subject?.status === 'draft'
  const readinessId = subjectIsDraft ? String(subject?.id ?? '') : ''

  const {
    data: readiness,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['application-readiness', readinessId],
    queryFn: () => studentReadinessService.get(readinessId),
    enabled: enabled && readinessId.length > 0,
    staleTime: 30_000,
    retry: 1,
  })

  const nextAction = resolveStudentNextAction({ application: subject, readiness })

  return {
    nextAction,
    subject: subject ?? null,
    isLoading: Boolean(readinessId) && isLoading,
    readinessUnavailable: Boolean(readinessId) && (isError || (!isLoading && !readiness)),
  }
}
