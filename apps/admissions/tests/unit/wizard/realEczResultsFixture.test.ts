/**
 * End-to-end fixture test using a real ECZ Grade 12 OCR sample.
 *
 * Verifies the full chain: subject matching → validation → no blocking
 * diagnostics. This is the exact scenario that was broken before the
 * fallback-* validation fix.
 */
import { describe, it, expect } from 'vitest'

import { validateLiveGrades } from '@/pages/student/applicationWizard/lib/liveGradeValidation'
import { findBestSubjectId } from '@/lib/subjectMatcher'
import type { SubjectGrade } from '@/pages/student/applicationWizard/types'

// Real OCR output from a student's Grade 12 result slip
const OCR_SAMPLE = {
  exam_number: '190502150028',
  year: '2025',
  subjects: [
    { name: 'English Language', grade: 1 },
    { name: 'Civic Education', grade: 1 },
    { name: 'Mathematics', grade: 3 },
    { name: 'Biology', grade: 4 },
    { name: 'Science', grade: 2 },
    { name: 'Design & Technology', grade: 1 },
    { name: 'Commerce', grade: 3 },
  ],
}

// Simulated backend catalog (UUIDs) — what seed_subjects.py creates
const BACKEND_CATALOG = [
  { id: 'aaaaaaaa-0001-4000-8000-000000000001', name: 'English Language', code: 'ENG' },
  { id: 'aaaaaaaa-0002-4000-8000-000000000002', name: 'Mathematics', code: 'MATH' },
  { id: 'aaaaaaaa-0003-4000-8000-000000000003', name: 'Civic Education', code: 'CE' },
  { id: 'aaaaaaaa-0004-4000-8000-000000000004', name: 'Biology', code: 'BIO' },
  { id: 'aaaaaaaa-0005-4000-8000-000000000005', name: 'Science', code: 'SCI' },
  { id: 'aaaaaaaa-0006-4000-8000-000000000006', name: 'Design & Technology', code: 'DT' },
  { id: 'aaaaaaaa-0007-4000-8000-000000000007', name: 'Commerce', code: 'COM' },
  { id: 'aaaaaaaa-0008-4000-8000-000000000008', name: 'Chemistry', code: 'CHEM' },
  { id: 'aaaaaaaa-0009-4000-8000-000000000009', name: 'Physics', code: 'PHY' },
]

describe('Real ECZ OCR sample — end-to-end validation', () => {
  it('all 7 subjects match backend UUIDs via findBestSubjectId', () => {
    for (const { name } of OCR_SAMPLE.subjects) {
      const matchedId = findBestSubjectId(name, BACKEND_CATALOG)
      expect(matchedId, `"${name}" should match a backend UUID`).toBeTruthy()
      expect(matchedId).toMatch(/^[0-9a-f]{8}-/)
    }
  })

  it('validateLiveGrades returns validCount=7 with no blocking diagnostics', () => {
    // Simulate the flow: OCR names → findBestSubjectId → SubjectGrade rows
    const rows: SubjectGrade[] = OCR_SAMPLE.subjects.map((s, i) => ({
      row_id: `ocr-row-${i}`,
      subject_id: findBestSubjectId(s.name, BACKEND_CATALOG) || '',
      grade: s.grade,
    }))

    const result = validateLiveGrades(rows)

    expect(result.validCount).toBe(7)
    expect(result.hintMessage).toBeNull()
    expect(result.diagnostics.every(d => d.issue === null)).toBe(true)
  })

  it('validateLiveGrades works with fallback-* IDs when backend is empty', () => {
    // Simulate: backend subjects table empty, frontend uses fallback IDs
    const rows: SubjectGrade[] = OCR_SAMPLE.subjects.map((s, i) => ({
      row_id: `fallback-row-${i}`,
      subject_id: `fallback-${s.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      grade: s.grade,
    }))

    const result = validateLiveGrades(rows)

    expect(result.validCount).toBe(7)
    expect(result.hintMessage).toBeNull()
    expect(result.diagnostics.every(d => d.issue === null)).toBe(true)
  })
})
