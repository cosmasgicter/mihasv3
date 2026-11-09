import { useCallback, type MutableRefObject } from 'react'
import { logApiError } from '@/lib/apiErrorLogger'
import { applicationService } from '@/services/applications'
import { isApplicationMissingError } from '@/lib/applicationSession'
import { resolveWizardSubjectId } from '../../lib/educationCatalog'
import { normalizeDraftResumeGrades } from '../../lib/draftResume'
import type { SubjectGrade } from '../../types'
import { createGradeRowId } from './wizardControllerUtils'

export interface UseWizardGradesParams {
  subjects: Array<{ id: string; name: string; code: string }>
  selectedGradesRef: MutableRefObject<SubjectGrade[]>
  setSelectedGrades: React.Dispatch<React.SetStateAction<SubjectGrade[]>>
  showSuccess: (message: string) => void
  clearStaleApplicationReference: (staleApplicationId: string, message?: string) => void
}

export function useWizardGrades(params: UseWizardGradesParams) {
  const {
    subjects,
    selectedGradesRef,
    setSelectedGrades,
    showSuccess,
    clearStaleApplicationReference,
  } = params

  const normalizeSelectedGrades = useCallback((grades: SubjectGrade[]): SubjectGrade[] => {
    return normalizeDraftResumeGrades(
      grades.map(grade => ({
        ...grade,
        subject_id: resolveWizardSubjectId(grade.subject_id, subjects),
      }))
    )
  }, [subjects])

  const hydrateServerGrades = useCallback(async (draftApplicationId: string): Promise<SubjectGrade[]> => {
    try {
      const response = await applicationService.getGrades(draftApplicationId)
      const normalized = normalizeSelectedGrades(
        (Array.isArray(response) ? response : []).map((grade) => {
          const record = grade as { subject_id?: unknown; grade?: unknown }
          return {
            subject_id: typeof record.subject_id === 'string' ? record.subject_id : '',
            grade: Number(record.grade) || 0,
          }
        })
      )
      // The ref moves with the state: the draft machine reads the grid through it
      // the moment hydration completes, which is before the next render.
      selectedGradesRef.current = normalized
      setSelectedGrades(normalized)
      return normalized
    } catch (gradeError) {
      logApiError('application-wizard', `/applications/${draftApplicationId}/grades/`, gradeError)
      if (isApplicationMissingError(gradeError)) {
        clearStaleApplicationReference(draftApplicationId)
      }
      return []
    }
  }, [clearStaleApplicationReference, normalizeSelectedGrades, selectedGradesRef, setSelectedGrades])

  const addGrade = useCallback(() => {
    setSelectedGrades(prev => (prev.length < 10 ? [...prev, { row_id: createGradeRowId(), subject_id: '', grade: 1 }] : prev))
  }, [setSelectedGrades])

  const removeGrade = useCallback((index: number) => {
    setSelectedGrades(prev => prev.filter((_, i) => i !== index))
  }, [setSelectedGrades])

  const updateGrade = useCallback((index: number, field: keyof SubjectGrade, value: string | number) => {
    setSelectedGrades(prev => {
      const next = [...prev]
      next[index] = { ...next[index]!, [field]: field === 'grade' ? Number(value) : value }
      return next
    })
  }, [setSelectedGrades])

  const getUsedSubjects = useCallback(() => selectedGradesRef.current.map(grade => grade.subject_id).filter(Boolean), [selectedGradesRef])

  /**
   * Apply grades the student has EXPLICITLY confirmed from the deterministic OCR
   * suggestion panel (task 7.5, R11.4).
   *
   * Two rules, in order of importance:
   *  1. a manually entered subject is never overwritten — the manual value wins,
   *     always, even against a confirmed suggestion for the same subject;
   *  2. nothing arrives here unconfirmed. `useOcrGradeExtraction` no longer calls
   *     back on its own; the only caller is the education step's confirm action.
   */
  const handleOcrGrades = useCallback((grades: Array<{ subject_id: string; grade: number }>) => {
    if (grades.length === 0) return

    // Read from ref to get the absolute latest grades (avoids stale closure)
    const currentGrades = selectedGradesRef.current
    const hadManualGrades = currentGrades.length > 0

    // Merge: OCR fills empty slots, never overwrites manually entered grades
    const manualSubjectIds = new Set(currentGrades.map(g => g.subject_id))
    const newGrades = grades
      .filter(g => !manualSubjectIds.has(g.subject_id))
      .map(g => ({ ...g, row_id: createGradeRowId() }))
    const merged = [...currentGrades, ...newGrades]
    setSelectedGrades(merged)

    if (hadManualGrades && newGrades.length > 0) {
      showSuccess(`Added ${newGrades.length} confirmed subject${newGrades.length === 1 ? '' : 's'} — your ${currentGrades.length} existing entr${currentGrades.length === 1 ? 'y was' : 'ies were'} kept unchanged. Please check each grade.`)
    } else if (hadManualGrades && newGrades.length === 0) {
      showSuccess('Those subjects were already entered, so nothing changed. Please check each grade.')
    } else {
      showSuccess(`Added ${newGrades.length} confirmed subject${newGrades.length === 1 ? '' : 's'} from your result slip. Please check each grade is correct.`)
    }

    // No direct sync (SJR R6-b): the merge is an edit like any other, and the draft
    // machine saves it within the debounce and holds it in the outbox until then.
  }, [showSuccess, selectedGradesRef, setSelectedGrades])

  return {
    normalizeSelectedGrades,
    hydrateServerGrades,
    addGrade,
    removeGrade,
    updateGrade,
    getUsedSubjects,
    handleOcrGrades,
  }
}
