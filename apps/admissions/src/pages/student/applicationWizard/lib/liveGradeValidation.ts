/**
 * Live grade validation — used by the Education step when the student
 * is actively typing subjects/grades, and when they click Next.
 *
 * This is intentionally distinct from `normalizeDraftResumeGrades`
 * (lib/draftResume.ts), which is a *sanitiser* for drafts resumed from
 * the server: that one silently drops invalid rows, which is correct
 * behaviour for stored data but hostile to live input because in-progress
 * rows (subject picked, grade not yet typed) get thrown away, the
 * student sees a cryptic "Minimum 5 unique subjects required (4 selected
 * — 2 rows have no subject selected)" message, and nothing explains
 * the real problem.
 *
 * validateLiveGrades preserves every row, emits a per-row diagnostic
 * describing exactly why each incomplete row is incomplete, and builds
 * an accurate aggregate hint that surfaces the real causes.
 */

import type { SubjectGrade } from '../types'

/**
 * Per-row diagnostic. `issue: null` means the row is valid (not a
 * duplicate of an earlier row, real subject, grade 1-9).
 *
 * Every value here maps one-to-one to a user-facing explanation in
 * the EducationStep UI, so new issue types should be added with care.
 */
export interface RowDiagnostic {
  rowId: string
  issue:
    | 'missing_subject' // grade entered (or partially) but no subject picked
    | 'missing_grade' // subject picked but grade is 0 / missing
    | 'invalid_grade_range' // grade is outside 1-9
    | 'duplicate' // same subject as an earlier row in the same submission
    | 'empty_row' // neither subject nor grade — benign, shown only as soft hint
    | null // valid
  // NOTE: 'fallback_subject' was removed May 2026. Fallback-* IDs are
  // legitimate client-side placeholders that resolve at sync time via
  // resolveWizardSubjectId. Blocking them here was a regression that
  // prevented valid selections from counting.
}

export interface ValidateLiveGradesResult {
  /** Number of rows that are valid and unique (first occurrence of each subject). */
  validCount: number
  /** Parallel array of diagnostics, same length as the input rows. */
  diagnostics: RowDiagnostic[]
  /**
   * A concise, human-readable summary of problems detected across
   * rows, or null if everything is clean. Suitable for use as the
   * parenthetical hint in an aggregate error like:
   *   "Minimum 5 unique subjects required (3 selected — 2 rows need a grade)".
   */
  hintMessage: string | null
}

/** A subject_id is a "real" pick (not empty). Fallback-* IDs are valid
 *  client-side placeholders that resolve at sync time. */
function isRealSubjectId(subjectId: string): boolean {
  return subjectId.length > 0
}

/** Is the grade value one of the 9 canonical Zambian O-level grades? */
function isValidGrade(grade: number): boolean {
  return Number.isFinite(grade) && grade >= 1 && grade <= 9
}

/**
 * Describe a single row in isolation (without considering other rows).
 * Duplicate detection is layered on top by the caller, since it's a
 * pair-wise concern.
 */
function classifyRow(row: SubjectGrade): Exclude<RowDiagnostic['issue'], 'duplicate'> {
  const subjectId = (row.subject_id ?? '').trim()
  const grade = Number(row.grade) || 0

  const hasSubject = isRealSubjectId(subjectId)
  const hasGrade = grade !== 0

  if (!hasSubject && !hasGrade) return 'empty_row'
  if (!hasSubject) return 'missing_subject'
  if (!hasGrade) return 'missing_grade'
  if (!isValidGrade(grade)) return 'invalid_grade_range'
  return null
}

/**
 * Build the aggregate hint message from the per-row diagnostics. Only
 * mentions issue types that actually occur; multiple types are joined
 * with "; ". Returns null when nothing is wrong.
 */
function buildHintMessage(diagnostics: RowDiagnostic[]): string | null {
  const counts = new Map<NonNullable<RowDiagnostic['issue']>, number>()

  for (const d of diagnostics) {
    if (d.issue === null || d.issue === 'empty_row') continue
    counts.set(d.issue, (counts.get(d.issue) ?? 0) + 1)
  }

  if (counts.size === 0) return null

  const parts: string[] = []
  const rowWord = (n: number) => (n === 1 ? 'row needs' : 'rows need')

  const missingSubject = counts.get('missing_subject') ?? 0
  if (missingSubject > 0) {
    parts.push(`${missingSubject} ${rowWord(missingSubject)} a subject`)
  }

  const missingGrade = counts.get('missing_grade') ?? 0
  if (missingGrade > 0) {
    parts.push(`${missingGrade} ${rowWord(missingGrade)} a grade`)
  }

  const invalidRange = counts.get('invalid_grade_range') ?? 0
  if (invalidRange > 0) {
    parts.push(
      `${invalidRange} ${rowWord(invalidRange)} a grade between 1 and 9`,
    )
  }

  const duplicates = counts.get('duplicate') ?? 0
  if (duplicates > 0) {
    const rowsWord = duplicates === 1 ? 'row' : 'rows'
    parts.push(`${duplicates} duplicate ${rowsWord}`)
  }

  return parts.join('; ')
}

/**
 * Validate a live array of subject+grade rows.
 *
 * Contract:
 * - Does NOT drop rows. Every input row produces exactly one diagnostic
 *   at the same index.
 * - Flags the second+ occurrence of any subject_id as 'duplicate'.
 * - Only the first occurrence of a unique, valid row is counted
 *   towards `validCount`.
 */
export function validateLiveGrades(
  rows: readonly SubjectGrade[],
): ValidateLiveGradesResult {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { validCount: 0, diagnostics: [], hintMessage: null }
  }

  const diagnostics: RowDiagnostic[] = []
  const seenSubjects = new Set<string>()
  let validCount = 0

  rows.forEach((row, index) => {
    const rowId = row.row_id ?? `row-${index}`
    const base = classifyRow(row)

    if (base === null) {
      const subjectId = (row.subject_id ?? '').trim()
      if (seenSubjects.has(subjectId)) {
        // A valid-shaped row but the subject was already counted.
        diagnostics.push({ rowId, issue: 'duplicate' })
        return
      }
      seenSubjects.add(subjectId)
      diagnostics.push({ rowId, issue: null })
      validCount += 1
      return
    }

    diagnostics.push({ rowId, issue: base })
  })

  return {
    validCount,
    diagnostics,
    hintMessage: buildHintMessage(diagnostics),
  }
}
