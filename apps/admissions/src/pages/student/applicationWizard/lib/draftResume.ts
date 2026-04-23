import { normalizePaymentStatus } from '@/lib/paymentStatus'

import type { SubjectGrade } from '../types'

export interface DraftResumeApplicationState {
  full_name?: string | null
  program?: string | null
  payment_status?: string | null
}

export function normalizeDraftResumeGrades(grades: unknown[] | null | undefined): SubjectGrade[] {
  if (!Array.isArray(grades)) {
    return []
  }

  return grades
    .filter((grade): grade is { subject_id?: unknown; grade?: unknown } => Boolean(grade) && typeof grade === 'object')
    .map((grade) => ({
      subject_id: typeof grade.subject_id === 'string' ? grade.subject_id.trim() : '',
      grade: Number(grade.grade) || 0,
    }))
    .filter((grade) => grade.subject_id.length > 0 && Number.isInteger(grade.grade) && grade.grade >= 1 && grade.grade <= 9)
}

export function deriveDraftResumeUploads(_application: DraftResumeApplicationState) {
  return {
    result_slip: false,
    extra_kyc: false,
  }
}

export function resolveDraftResumeStepId(
  application: DraftResumeApplicationState,
  grades: SubjectGrade[]
): number {
  if (!application.program || !application.full_name) {
    return 1
  }

  if (normalizePaymentStatus(application.payment_status) === 'verified') {
    return 4
  }

  const uploads = deriveDraftResumeUploads(application)
  const hasEducationComplete = grades.length >= 5 && uploads.result_slip && uploads.extra_kyc

  return hasEducationComplete ? 3 : 2
}

