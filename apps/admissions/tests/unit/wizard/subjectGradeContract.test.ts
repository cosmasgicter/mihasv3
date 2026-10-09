/**
 * The canonical subject/grade contract on the client — task 7.1.
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` — task **7.1**.
 * Requirements: R11.4, R11.5
 * Findings:     STU-11
 * Design:       §9.2 (Grades — "Selectors contain only canonical UUIDs …
 *               Readiness counts unique persisted records, not local row
 *               contents.")
 *
 * STU-11 in the student's words: the education step offered subjects that were
 * not real, the progress meter counted them, and then they vanished when the
 * draft synced. This module is the client half of the fix — the selector can only
 * offer server IDs, and nothing that the server cannot persist is ever counted
 * as progress.
 *
 * Validates: Requirements R11.4, R11.5
 */

import { describe, expect, it } from 'vitest'

import { isCanonicalSubjectId } from '@/lib/canonicalSubjectId'
import {
  mergeWizardSubjects,
  resolveWizardSubjectId,
} from '@/pages/student/applicationWizard/lib/educationCatalog'
import { validateLiveGrades } from '@/pages/student/applicationWizard/lib/liveGradeValidation'
import { buildWizardReadiness } from '@/pages/student/applicationWizard/lib/wizardReadiness'
import { normalizeDraftResumeGrades } from '@/pages/student/applicationWizard/lib/draftResume'
import type { SubjectGrade } from '@/pages/student/applicationWizard/types'

const SERVER_SUBJECTS = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'English Language', code: 'ENG', curriculum_type: 'ecz' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Mathematics', code: 'MATH', curriculum_type: 'ecz' },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Biology', code: 'BIO', curriculum_type: 'ecz' },
  { id: '44444444-4444-4444-8444-444444444444', name: 'Commerce', code: 'COM', curriculum_type: 'ecz' },
  { id: '55555555-5555-4555-8555-555555555555', name: 'Science', code: 'SCI', curriculum_type: 'ecz' },
  { id: '66666666-6666-4666-8666-666666666666', name: 'Physics (A-Level)', code: 'AL-PHY', curriculum_type: 'a_level' },
]

const row = (subject_id: string, grade: number, row_id: string): SubjectGrade => ({
  row_id,
  subject_id,
  grade,
})

const gradesFor = (count: number): SubjectGrade[] =>
  SERVER_SUBJECTS.slice(0, count).map((subject, index) => row(subject.id, 2, `r${index}`))

const readiness = (selectedGrades: SubjectGrade[]) =>
  buildWizardReadiness({ values: {}, selectedGrades }).stepProgressByKey.education
    .missingItems.find(item => item.field === 'grades')

// ---------------------------------------------------------------------------
// 1. The selector contains only server-provided canonical IDs (R11.5)
// ---------------------------------------------------------------------------

describe('subject selector', () => {
  it('offers only the subjects the server returned', () => {
    const merged = mergeWizardSubjects(SERVER_SUBJECTS)

    expect(merged.map(subject => subject.id).sort()).toEqual(
      SERVER_SUBJECTS.map(subject => subject.id).sort()
    )
    for (const subject of merged) {
      expect(isCanonicalSubjectId(subject.id)).toBe(true)
    }
  })

  it('never offers a fabricated fallback subject', () => {
    const merged = mergeWizardSubjects(SERVER_SUBJECTS)
    expect(merged.some(subject => subject.id.startsWith('fallback-'))).toBe(false)
    expect(merged.some(subject => subject.name === 'Woodwork')).toBe(false)
  })

  it('is empty when the catalogue could not be loaded, rather than inventing one', () => {
    expect(mergeWizardSubjects([])).toEqual([])
  })

  it('ignores a non-canonical id the server could not have issued', () => {
    const merged = mergeWizardSubjects([
      ...SERVER_SUBJECTS,
      { id: 'fallback-woodwork', name: 'Woodwork', code: 'WW' },
      { id: '', name: 'Nameless', code: '' },
    ])
    expect(merged).toHaveLength(SERVER_SUBJECTS.length)
  })

  it('decorates each server subject with its display level and category', () => {
    const merged = mergeWizardSubjects(SERVER_SUBJECTS)
    const english = merged.find(subject => subject.code === 'ENG')
    const alevel = merged.find(subject => subject.code === 'AL-PHY')

    expect(english).toMatchObject({ category: 'core', level: 'grade12' })
    expect(alevel).toMatchObject({ category: 'sciences', level: 'alevel' })
  })
})

// ---------------------------------------------------------------------------
// 2. Legacy stored IDs are repaired to canonical IDs, never re-emitted
// ---------------------------------------------------------------------------

describe('legacy subject id repair', () => {
  it('maps a retired fallback slug onto the canonical server id', () => {
    const subjects = mergeWizardSubjects(SERVER_SUBJECTS)
    expect(resolveWizardSubjectId('fallback-english', subjects)).toBe(SERVER_SUBJECTS[0]!.id)
    expect(resolveWizardSubjectId('fallback-commerce', subjects)).toBe(SERVER_SUBJECTS[3]!.id)
  })

  it('drops a legacy slug the server catalogue does not carry', () => {
    const subjects = mergeWizardSubjects(SERVER_SUBJECTS)
    expect(resolveWizardSubjectId('fallback-woodwork', subjects)).toBe('')
    expect(resolveWizardSubjectId('fallback-ordinary-mathematics', subjects)).toBe('')
  })

  it('maps a written subject name through the alias catalogue', () => {
    const subjects = mergeWizardSubjects(SERVER_SUBJECTS)
    expect(resolveWizardSubjectId('Maths', subjects)).toBe(SERVER_SUBJECTS[1]!.id)
    expect(resolveWizardSubjectId('Combined Science', subjects)).toBe(SERVER_SUBJECTS[4]!.id)
  })

  it('never returns a non-canonical id', () => {
    const subjects = mergeWizardSubjects(SERVER_SUBJECTS)
    for (const candidate of ['fallback-english', 'fallback-woodwork', 'Maths', 'nonsense', '']) {
      const resolved = resolveWizardSubjectId(candidate, subjects)
      expect(resolved === '' || isCanonicalSubjectId(resolved)).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// 3. Client readiness: 0 / 4 / 5 / duplicate / fake / unknown
// ---------------------------------------------------------------------------

describe('client grade readiness', () => {
  it('reports zero of five with no grades', () => {
    expect(readiness([])?.message).toContain('(0/5 selected)')
  })

  it('still blocks at four canonical grades', () => {
    expect(readiness(gradesFor(4))?.message).toContain('(4/5 selected)')
  })

  it('is satisfied at five canonical grades', () => {
    expect(readiness(gradesFor(5))).toBeUndefined()
  })

  it('does not count a duplicated subject twice', () => {
    const rows = [...gradesFor(4), row(SERVER_SUBJECTS[0]!.id, 5, 'dup')]
    expect(readiness(rows)?.message).toBe('Each subject can only be selected once.')
  })

  it('does not count a fabricated fallback subject id', () => {
    const rows = [...gradesFor(4), row('fallback-woodwork', 3, 'fake')]
    expect(readiness(rows)?.message).toContain('(4/5 selected)')
  })

  it('does not count an unknown non-canonical subject id', () => {
    const rows = [...gradesFor(4), row('not-a-uuid', 3, 'unknown')]
    expect(readiness(rows)?.message).toContain('(4/5 selected)')
  })

  it('explains that an unresolved row needs a subject from the list', () => {
    const rows = [...gradesFor(4), row('fallback-woodwork', 3, 'fake')]
    const message = readiness(rows)?.message ?? ''
    expect(message.toLowerCase()).toContain('subject')
  })
})

// ---------------------------------------------------------------------------
// 4. Live row diagnostics name the real problem
// ---------------------------------------------------------------------------

describe('live grade diagnostics', () => {
  it('flags a non-canonical subject id as unresolved rather than valid', () => {
    const result = validateLiveGrades([row('fallback-english', 3, 'r1')])
    expect(result.validCount).toBe(0)
    expect(result.diagnostics[0]?.issue).toBe('unresolved_subject')
    expect(result.hintMessage).toContain('subject')
  })

  it('accepts a canonical subject id', () => {
    const result = validateLiveGrades([row(SERVER_SUBJECTS[0]!.id, 3, 'r1')])
    expect(result.validCount).toBe(1)
    expect(result.diagnostics[0]?.issue).toBeNull()
    expect(result.hintMessage).toBeNull()
  })

  it('keeps naming missing subject, missing grade, range and duplicate issues', () => {
    const result = validateLiveGrades([
      row('', 3, 'r1'),
      row(SERVER_SUBJECTS[0]!.id, 0, 'r2'),
      row(SERVER_SUBJECTS[1]!.id, 12, 'r3'),
      row(SERVER_SUBJECTS[2]!.id, 3, 'r4'),
      row(SERVER_SUBJECTS[2]!.id, 4, 'r5'),
    ])
    expect(result.diagnostics.map(diagnostic => diagnostic.issue)).toEqual([
      'missing_subject',
      'missing_grade',
      'invalid_grade_range',
      null,
      'duplicate',
    ])
    expect(result.validCount).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// 5. Persisted-draft sanitising uses the same allowlist
// ---------------------------------------------------------------------------

describe('draft resume sanitising', () => {
  it('keeps canonical rows and drops everything the server cannot persist', () => {
    const restored = normalizeDraftResumeGrades([
      { subject_id: SERVER_SUBJECTS[0]!.id, grade: 2 },
      { subject_id: 'fallback-english', grade: 2 },
      { subject_id: 'not-a-uuid', grade: 2 },
      { subject_id: SERVER_SUBJECTS[1]!.id, grade: 0 },
      { subject_id: '', grade: 3 },
    ])

    expect(restored).toHaveLength(1)
    expect(restored[0]!.subject_id).toBe(SERVER_SUBJECTS[0]!.id)
  })
})
