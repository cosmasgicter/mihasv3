import { normalizePaymentStatus } from '@/lib/paymentStatus'

import type { SubjectGrade } from '../types'

export interface DraftResumeApplicationState {
  full_name?: string | null
  program?: string | null
  payment_status?: string | null
}

export interface DraftResumeUploads {
  result_slip: boolean
  extra_kyc: boolean
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
    .filter((grade) => grade.subject_id.length > 0 && grade.grade >= 1 && grade.grade <= 9)
}

export function deriveDraftResumeUploads(_application: DraftResumeApplicationState) {
  return {
    result_slip: false,
    extra_kyc: false,
  }
}

export function resolveDraftResumeStepId(
  application: DraftResumeApplicationState,
  grades: SubjectGrade[],
  uploads?: DraftResumeUploads
): number {
  if (!application.program || !application.full_name) {
    return 1
  }

  const paymentStatus = normalizePaymentStatus(application.payment_status)
  if (paymentStatus === 'verified' || paymentStatus === 'deferred') {
    return 4
  }

  const resolvedUploads = uploads ?? { result_slip: false, extra_kyc: false }
  const hasEducationComplete = grades.length >= 5 && resolvedUploads.result_slip && resolvedUploads.extra_kyc

  return hasEducationComplete ? 3 : 2
}

