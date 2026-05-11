import { describe, it, expect } from 'vitest'
import { computeExtractionChecks } from '@/lib/eczExtractionChecks'

const GOOD_SUBJECTS = [
  { name: 'English Language', grade: 1 },
  { name: 'Civic Education', grade: 1 },
  { name: 'Mathematics', grade: 3 },
  { name: 'Biology', grade: 4 },
  { name: 'Science', grade: 2 },
  { name: 'Design & Technology', grade: 1 },
  { name: 'Commerce', grade: 3 },
]

describe('computeExtractionChecks', () => {
  it('returns all pass for a valid sample', () => {
    const checks = computeExtractionChecks(GOOD_SUBJECTS, '190502150028', '2025')
    expect(checks).toHaveLength(5)
    expect(checks.every(c => c.status === 'pass')).toBe(true)
  })

  it('warns when subject count is below 5', () => {
    const checks = computeExtractionChecks(GOOD_SUBJECTS.slice(0, 3), '190502150028', '2025')
    const countCheck = checks.find(c => c.id === 'subject_count')
    expect(countCheck?.status).toBe('warn')
  })

  it('warns when subject count exceeds 9', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ name: `Subject ${i}`, grade: i % 9 + 1 }))
    const checks = computeExtractionChecks(many, '190502150028', '2025')
    const countCheck = checks.find(c => c.id === 'subject_count')
    expect(countCheck?.status).toBe('warn')
  })

  it('warns when a grade is out of range', () => {
    const bad = [...GOOD_SUBJECTS.slice(0, 6), { name: 'Commerce', grade: 10 }]
    const checks = computeExtractionChecks(bad, '190502150028', '2025')
    const gradeCheck = checks.find(c => c.id === 'grades_valid')
    expect(gradeCheck?.status).toBe('warn')
  })

  it('warns when year is too old', () => {
    const checks = computeExtractionChecks(GOOD_SUBJECTS, '190502150028', '2015')
    const yearCheck = checks.find(c => c.id === 'year_recent')
    expect(yearCheck?.status).toBe('warn')
  })

  it('warns when exam number is invalid', () => {
    const checks = computeExtractionChecks(GOOD_SUBJECTS, 'BADNUM', '2025')
    const numCheck = checks.find(c => c.id === 'exam_number_format')
    expect(numCheck?.status).toBe('warn')
  })

  it('warns when core subjects are missing', () => {
    const noCore = [
      { name: 'Biology', grade: 2 },
      { name: 'Chemistry', grade: 3 },
      { name: 'Physics', grade: 4 },
      { name: 'Geography', grade: 5 },
      { name: 'History', grade: 6 },
    ]
    const checks = computeExtractionChecks(noCore, '190502150028', '2025')
    const coreCheck = checks.find(c => c.id === 'core_subjects')
    expect(coreCheck?.status).toBe('warn')
    expect(coreCheck?.label).toContain('0/3')
  })

  it('handles null/undefined exam number and year gracefully', () => {
    const checks = computeExtractionChecks(GOOD_SUBJECTS, null, undefined)
    const numCheck = checks.find(c => c.id === 'exam_number_format')
    const yearCheck = checks.find(c => c.id === 'year_recent')
    expect(numCheck?.status).toBe('warn')
    expect(yearCheck?.status).toBe('warn')
  })
})
