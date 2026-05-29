import { useCallback, type MutableRefObject } from 'react'
import { logApiError } from '@/lib/apiErrorLogger'
import { toError } from '@/lib/toError'
import { logger } from '@/lib/logger'
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
  applicationId: string | null
  syncGrades: { mutateAsync: (args: { id: string; grades: SubjectGrade[] }) => Promise<unknown> }
  showSuccess: (message: string) => void
  clearStaleApplicationReference: (staleApplicationId: string, message?: string) => void
}

export function useWizardGrades(params: UseWizardGradesParams) {
  const {
    subjects,
    selectedGradesRef,
    setSelectedGrades,
    applicationId,
    syncGrades,
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
      setSelectedGrades(normalized)
      return normalized
    } catch (gradeError) {
      logApiError('application-wizard', `/applications/${draftApplicationId}/grades/`, gradeError)
      if (isApplicationMissingError(gradeError)) {
        clearStaleApplicationReference(draftApplicationId)
      }
      return []
    }
  }, [clearStaleApplicationReference, normalizeSelectedGrades, setSelectedGrades])

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

  // OCR merge rule: OCR only fills empty slots, never overwrites manual entries
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
      showSuccess(`\u2728 AI detected ${grades.length} subjects \u2014 added ${newGrades.length} new subjects (your ${currentGrades.length} existing entries were kept). Please verify.`)
    } else if (hadManualGrades && newGrades.length === 0) {
      showSuccess(`\u2728 AI detected ${grades.length} subjects, but all were already entered. Please verify your grades.`)
    } else {
      showSuccess(`\u2728 AI detected ${grades.length} subjects from your result slip! Please verify the grades are correct.`)
    }

    if (applicationId) {
      const syncable = merged.filter(g => !g.subject_id.startsWith('fallback-'))
      if (syncable.length > 0) {
        syncGrades.mutateAsync({ id: applicationId, grades: syncable }).catch((err) => logger.warn('Grade sync failed', toError(err)))
      }
    }
  }, [applicationId, syncGrades, showSuccess, selectedGradesRef, setSelectedGrades])

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
