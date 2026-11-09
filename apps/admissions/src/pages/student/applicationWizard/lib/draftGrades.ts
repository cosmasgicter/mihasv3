/**
 * The grid, seen as the draft machine's grades channel sees it (SJR task 3.23,
 * R6-b).
 *
 * `rows` are the pairs the grades endpoint can store: a canonical subject id and
 * a grade of 1 to 9, the first of any duplicate subject. A row with no subject
 * chosen yet is not a pending change and not a problem: the student is still
 * filling it in. Any other row that cannot be sent (a subject that is not a
 * server identity, a grade outside 1 to 9) is `unsavable`, and the save status
 * says so instead of "Saved".
 */
import { isCanonicalSubjectId, syncableGrades } from '@/lib/canonicalSubjectId'
import type { SubjectGrade } from '../types'

export interface ProjectedWizardGrades {
  rows: Array<{ subject_id: string; grade: number }>
  unsavableRows: number
}

export function projectWizardGrades(grades: ReadonlyArray<SubjectGrade> | null | undefined): ProjectedWizardGrades {
  const list = Array.isArray(grades) ? grades : []
  const rows = syncableGrades(list)
  let unsavableRows = 0
  for (const row of list) {
    const subjectId = typeof row?.subject_id === 'string' ? row.subject_id.trim() : ''
    if (!subjectId) continue
    const grade = Number(row.grade)
    if (!isCanonicalSubjectId(subjectId) || !Number.isInteger(grade) || grade < 1 || grade > 9) {
      unsavableRows += 1
    }
  }
  return { rows, unsavableRows }
}
