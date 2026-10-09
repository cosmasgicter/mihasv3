import { isCanonicalSubjectId } from '@/lib/canonicalSubjectId'
import { normalizePaymentStatus } from '@/lib/paymentStatus'

import type { SubjectGrade } from '../types'

export interface DraftResumeApplicationState {
  full_name?: string | null
  program?: string | null
  payment_status?: string | null
  result_slip_url?: string | null
  extra_kyc_url?: string | null
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
    .map((grade, index) => ({
      row_id: `restored-${index}-${typeof grade.subject_id === 'string' ? grade.subject_id.trim() : 'empty'}`,
      subject_id: typeof grade.subject_id === 'string' ? grade.subject_id.trim() : '',
      grade: Number(grade.grade) || 0,
    }))
    // R11.5 / STU-11: keep only rows the server can actually persist — a
    // canonical subject identity and an ECZ grade. The previous `fallback-`
    // denylist let any other malformed reference through to be dropped later.
    .filter((grade) => isCanonicalSubjectId(grade.subject_id) && grade.grade >= 1 && grade.grade <= 9)
}

export function deriveDraftResumeUploads(application: DraftResumeApplicationState) {
  return {
    result_slip: Boolean(application.result_slip_url?.trim()),
    extra_kyc: Boolean(application.extra_kyc_url?.trim()),
  }
}

export function mergeDraftResumeUploads(
  application: DraftResumeApplicationState,
  serverUploads?: Partial<DraftResumeUploads> | null
): DraftResumeUploads {
  const urlUploads = deriveDraftResumeUploads(application)

  return {
    result_slip: Boolean(urlUploads.result_slip || serverUploads?.result_slip),
    extra_kyc: Boolean(urlUploads.extra_kyc || serverUploads?.extra_kyc),
  }
}

/**
 * The personal answers the application **list** projection does not carry.
 *
 * `ApplicationListSerializer` (`backend/apps/applications/serializers.py`) is
 * deliberately lightweight: of the wizard's personal step it exposes `full_name`,
 * `email` and `phone`, and nothing else. Every field below is stored on the row and
 * absent from the list.
 *
 * This is the gap `docs/v2-evidence/11.2/README.md` §2.2 recorded as unfixed: a
 * resumed draft hydrated from a list item wrote `''` over answers the platform
 * already held, so a student who had entered an NRC, a date of birth and a town saw
 * three empty fields and had to type them again. Measured in the harness on the
 * unchanged tree, immediately after a resume and before any typing:
 * `{"nrc":"","town":""}` against a row that held both.
 */
export const DRAFT_PERSONAL_FIELDS_ABSENT_FROM_LIST = [
  'nrc_number',
  'passport_number',
  'date_of_birth',
  'sex',
  'residence_town',
  'country',
  'nationality',
  'next_of_kin_name',
  'next_of_kin_phone',
] as const

export type DraftPersonalFieldAbsentFromList = (typeof DRAFT_PERSONAL_FIELDS_ABSENT_FROM_LIST)[number]

/** A value the platform actually holds, as opposed to a projection's blank. */
function isPresent(value: unknown): boolean {
  return typeof value === 'string' ? value.trim() !== '' : value != null
}

/**
 * Fill only the answers the list cannot carry, only from the authoritative row,
 * and only where the list has nothing.
 *
 * Direction matters (R10.3): the online `Application(status='draft')` is
 * authoritative, so the record supplies what the projection omits — but the
 * projection still wins on everything it *does* carry (programme, intake,
 * institution, status, payment), because those are the fields the wizard's own
 * catalog resolution is written against. Nothing is ever overwritten with a blank.
 *
 * Pure and total: a missing record, a partial record, or a record with blanks all
 * return the list item unchanged rather than degrading it.
 */
export function fillDraftPersonalFieldsFromRecord<T extends Record<string, unknown>>(
  listItem: T,
  record: Record<string, unknown> | null | undefined,
): T {
  if (!record) return listItem

  let filled: Record<string, unknown> | null = null
  for (const field of DRAFT_PERSONAL_FIELDS_ABSENT_FROM_LIST) {
    if (isPresent(listItem[field])) continue
    const value = record[field]
    if (!isPresent(value)) continue
    filled ??= { ...listItem }
    filled[field] = value
  }

  return (filled ?? listItem) as T
}

export function resolveDraftResumeStepId(
  application: DraftResumeApplicationState,
  grades: SubjectGrade[],
  uploads?: DraftResumeUploads
): number {
  // Step ids match steps/config.ts:
  // 1 program, 2 assignedSchool, 3 personal, 4 education, 5 payment, 6 submit.
  // A persisted draft always has a chosen programme (it was created via the
  // program-first flow), so we resume at the personal step or later — never
  // before the assigned-school checkpoint.
  if (!application.program || !application.full_name) {
    return 3
  }

  const paymentStatus = normalizePaymentStatus(application.payment_status)
  if (paymentStatus === 'verified' || paymentStatus === 'deferred') {
    return 6
  }

  const resolvedUploads = uploads ?? { result_slip: false, extra_kyc: false }
  const hasEducationComplete = grades.length >= 5 && resolvedUploads.result_slip && resolvedUploads.extra_kyc

  return hasEducationComplete ? 5 : 4
}
