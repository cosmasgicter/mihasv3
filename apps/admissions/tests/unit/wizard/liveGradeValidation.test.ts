/**
 * Live-grade validation tests.
 *
 * Covers the validateLiveGrades() helper that replaces the old flow of
 * piping live user input through `normalizeDraftResumeGrades` (which is
 * meant for sanitising resumed server drafts, NOT for validating what
 * the student is actively typing into the education step).
 *
 * The original bug: a student with 6 selected subjects where 2 rows
 * had no grade yet was told "Minimum 5 unique subjects required
 * (4 selected — 2 rows have no subject selected)". That message is
 * doubly wrong: (a) those rows DID have a subject, they just had no
 * grade yet, and (b) the "silent drop" behaviour of the draft-resume
 * normaliser is hostile to in-progress input.
 *
 * validateLiveGrades() preserves every row and reports a per-row reason
 * for any row that isn't yet valid, so the UI can show precise inline
 * feedback and the aggregate error message can describe the real cause.
 */

import { describe, it, expect } from 'vitest'

import {
  validateLiveGrades,
  type RowDiagnostic,
} from '@/pages/student/applicationWizard/lib/liveGradeValidation'
import type { SubjectGrade } from '@/pages/student/applicationWizard/types'

// Small helpers — the wizard stores subject_id as a string and grade as a
// number where 0 is the "empty/unset" sentinel (Number('') || 0 ⇒ 0).
const row = (
  subject_id: string,
  grade: number,
  row_id?: string,
): SubjectGrade => ({
  row_id: row_id ?? `row-${subject_id || 'empty'}-${grade}`,
  subject_id,
  grade,
})

describe('validateLiveGrades — regression: the 6-subjects-but-blocked bug', () => {
  it('counts 6 rows correctly when 4 have subject+grade and 2 have subject-only (no grade yet)', () => {
    const rows: SubjectGrade[] = [
      row('subj-english', 3),
      row('subj-maths', 4),
      row('subj-biology', 5),
      row('subj-chemistry', 6),
      row('subj-geography', 0), // subject chosen, grade not yet entered
      row('subj-history', 0), // subject chosen, grade not yet entered
    ]

    const result = validateLiveGrades(rows)

    // The 4 rows with subject+grade count as valid
    expect(result.validCount).toBe(4)

    // Diagnostics track every row — valid rows have `issue: null`, the
    // two in-progress rows are flagged as missing_grade (NOT
    // missing_subject like the old buggy message claimed).
    expect(result.diagnostics).toHaveLength(6)
    const issuesByRow = Object.fromEntries(
      result.diagnostics.map((d) => [d.rowId, d.issue]),
    )
    expect(issuesByRow[rows[0]!.row_id!]).toBeNull()
    expect(issuesByRow[rows[1]!.row_id!]).toBeNull()
    expect(issuesByRow[rows[2]!.row_id!]).toBeNull()
    expect(issuesByRow[rows[3]!.row_id!]).toBeNull()
    expect(issuesByRow[rows[4]!.row_id!]).toBe('missing_grade')
    expect(issuesByRow[rows[5]!.row_id!]).toBe('missing_grade')

    // Accurate aggregate hint — mentions grade, NOT "no subject selected"
    expect(result.hintMessage).toBeTruthy()
    expect(result.hintMessage).toMatch(/grade/i)
    expect(result.hintMessage).not.toMatch(/no subject selected/i)
  })

  it('reports no issue when all 6 rows are valid', () => {
    const rows: SubjectGrade[] = [
      row('subj-english', 3),
      row('subj-maths', 4),
      row('subj-biology', 5),
      row('subj-chemistry', 6),
      row('subj-geography', 7),
      row('subj-history', 2),
    ]

    const result = validateLiveGrades(rows)

    expect(result.validCount).toBe(6)
    expect(result.diagnostics.every((d) => d.issue === null)).toBe(true)
    expect(result.hintMessage).toBeNull()
  })
})

describe('validateLiveGrades — per-row diagnostic branches', () => {
  it('flags a row with a grade but no subject as missing_subject', () => {
    const rows: SubjectGrade[] = [row('', 5, 'r1')]
    const result = validateLiveGrades(rows)
    expect(result.validCount).toBe(0)
    expect(result.diagnostics[0]?.issue).toBe('missing_subject')
  })

  it('flags a row with a subject but no grade (grade=0) as missing_grade', () => {
    const rows: SubjectGrade[] = [row('subj-english', 0, 'r1')]
    const result = validateLiveGrades(rows)
    expect(result.validCount).toBe(0)
    expect(result.diagnostics[0]?.issue).toBe('missing_grade')
  })

  it('flags a row with grade 10 as invalid_grade_range', () => {
    const rows: SubjectGrade[] = [row('subj-english', 10, 'r1')]
    const result = validateLiveGrades(rows)
    expect(result.validCount).toBe(0)
    expect(result.diagnostics[0]?.issue).toBe('invalid_grade_range')
  })

  it('flags a row with negative grade as invalid_grade_range', () => {
    const rows: SubjectGrade[] = [row('subj-english', -1, 'r1')]
    const result = validateLiveGrades(rows)
    expect(result.validCount).toBe(0)
    expect(result.diagnostics[0]?.issue).toBe('invalid_grade_range')
  })

  it('flags a row whose subject_id still starts with "fallback-" as fallback_subject', () => {
    const rows: SubjectGrade[] = [row('fallback-english', 3, 'r1')]
    const result = validateLiveGrades(rows)
    expect(result.validCount).toBe(0)
    expect(result.diagnostics[0]?.issue).toBe('fallback_subject')
  })

  it('flags the second occurrence of the same subject_id as duplicate', () => {
    const rows: SubjectGrade[] = [
      row('subj-english', 3, 'r1'),
      row('subj-english', 4, 'r2'),
    ]
    const result = validateLiveGrades(rows)
    // Only the FIRST occurrence counts — duplicates never add to validCount
    expect(result.validCount).toBe(1)
    expect(result.diagnostics[0]?.issue).toBeNull()
    expect(result.diagnostics[1]?.issue).toBe('duplicate')
  })

  it('treats a fully-empty row (no subject, no grade) as empty_row (not shouted about)', () => {
    const rows: SubjectGrade[] = [row('', 0, 'r1')]
    const result = validateLiveGrades(rows)
    expect(result.validCount).toBe(0)
    // empty_row is intentionally a soft diagnostic — a blank row in the
    // UI is what the user sees when they haven't started filling that
    // slot. The hint message should not loudly complain about it unless
    // there are no other problems.
    expect(result.diagnostics[0]?.issue).toBe('empty_row')
  })

  it('returns empty results when given an empty array', () => {
    const result = validateLiveGrades([])
    expect(result.validCount).toBe(0)
    expect(result.diagnostics).toEqual([])
    expect(result.hintMessage).toBeNull()
  })
})

describe('validateLiveGrades — aggregate hintMessage wording', () => {
  it('describes missing grades precisely (singular)', () => {
    const rows: SubjectGrade[] = [
      row('subj-english', 3),
      row('subj-maths', 4),
      row('subj-biology', 5),
      row('subj-chemistry', 6),
      row('subj-geography', 0), // one missing grade
    ]
    const result = validateLiveGrades(rows)
    expect(result.hintMessage).toBeTruthy()
    expect(result.hintMessage).toMatch(/1 row needs a grade/i)
  })

  it('describes missing grades precisely (plural)', () => {
    const rows: SubjectGrade[] = [
      row('subj-english', 3),
      row('subj-maths', 4),
      row('subj-biology', 0),
      row('subj-chemistry', 0),
    ]
    const result = validateLiveGrades(rows)
    expect(result.hintMessage).toMatch(/2 rows need a grade/i)
  })

  it('describes missing subjects precisely', () => {
    const rows: SubjectGrade[] = [
      row('', 3, 'r1'),
      row('', 4, 'r2'),
    ]
    const result = validateLiveGrades(rows)
    expect(result.hintMessage).toMatch(/2 rows need a subject/i)
  })

  it('combines multiple issue types with a semicolon', () => {
    const rows: SubjectGrade[] = [
      row('', 3, 'r1'), // missing subject
      row('subj-maths', 0, 'r2'), // missing grade
      row('subj-biology', 10, 'r3'), // invalid grade
    ]
    const result = validateLiveGrades(rows)
    expect(result.hintMessage).toMatch(/needs a subject/i)
    expect(result.hintMessage).toMatch(/needs a grade/i)
    expect(result.hintMessage).toContain(';')
  })

  it('returns null hint when everything is valid', () => {
    const rows: SubjectGrade[] = [
      row('a', 1),
      row('b', 2),
      row('c', 3),
      row('d', 4),
      row('e', 5),
    ]
    const result = validateLiveGrades(rows)
    expect(result.hintMessage).toBeNull()
  })
})

describe('validateLiveGrades — RowDiagnostic exported shape', () => {
  it('exports the RowDiagnostic type with rowId and issue', () => {
    const rows: SubjectGrade[] = [row('subj-english', 3, 'my-row')]
    const result = validateLiveGrades(rows)
    const diag: RowDiagnostic | undefined = result.diagnostics[0]
    expect(diag?.rowId).toBe('my-row')
    expect(diag?.issue).toBeNull()
  })
})
