/**
 * ECZ extraction consistency checks.
 *
 * Informational signals displayed as chips on the ExtractedResultsCard.
 * None of these block the student — they're trust-building indicators.
 */

import { isValidExamNumber } from './eczExamNumber'

export type CheckStatus = 'pass' | 'warn'

export interface ExtractionCheck {
  id: string
  label: string
  status: CheckStatus
}

interface AiSubject {
  name: string
  grade: number
}

const CORE_SUBJECTS = ['english language', 'mathematics', 'civic education']

export function computeExtractionChecks(
  subjects: AiSubject[],
  examNumber: string | null | undefined,
  year: string | number | null | undefined,
): ExtractionCheck[] {
  const checks: ExtractionCheck[] = []
  const currentYear = new Date().getFullYear()
  const numericYear = typeof year === 'number' ? year : parseInt(String(year ?? ''), 10)

  // Subject count in expected 5–9 range
  checks.push({
    id: 'subject_count',
    label: `${subjects.length} subjects detected`,
    status: subjects.length >= 5 && subjects.length <= 9 ? 'pass' : 'warn',
  })

  // All grades 1–9
  const allGradesValid = subjects.length > 0 && subjects.every(s => s.grade >= 1 && s.grade <= 9)
  checks.push({
    id: 'grades_valid',
    label: 'All grades 1–9',
    status: allGradesValid ? 'pass' : 'warn',
  })

  // Year within last 5 years
  const yearValid = !isNaN(numericYear) && numericYear >= currentYear - 5 && numericYear <= currentYear
  checks.push({
    id: 'year_recent',
    label: `Year ${numericYear || '?'} is recent`,
    status: yearValid ? 'pass' : 'warn',
  })

  // Exam number format valid
  checks.push({
    id: 'exam_number_format',
    label: 'Exam number format valid',
    status: isValidExamNumber(examNumber) ? 'pass' : 'warn',
  })

  // 3 core subjects present — exact match on canonical names only, to avoid
  // false hits like "Physical Education" matching "education" substring.
  const subjectNames = subjects.map(s => s.name.toLowerCase().trim())
  const corePresent = CORE_SUBJECTS.filter(c => subjectNames.includes(c)).length
  checks.push({
    id: 'core_subjects',
    label: `${corePresent}/3 core subjects`,
    status: corePresent === 3 ? 'pass' : 'warn',
  })

  return checks
}
