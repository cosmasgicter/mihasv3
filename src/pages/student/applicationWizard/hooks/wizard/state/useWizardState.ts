import { useState, useCallback } from 'react'
import type { SubjectGrade } from '../../../types'
import type { SubmittedApplicationSummary } from '../../useApplicationSlip'

export const useWizardState = () => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [applicationId, setApplicationId] = useState<string | null>(null)
  const [submittedApplication, setSubmittedApplication] = useState<SubmittedApplicationSummary | null>(null)
  const [selectedGrades, setSelectedGrades] = useState<SubjectGrade[]>([])
  const [isDraftSaving, setIsDraftSaving] = useState(false)
  const [draftSaved, setDraftSaved] = useState(false)
  const [restoringDraft, setRestoringDraft] = useState(false)
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [confirmSubmission, setConfirmSubmission] = useState(false)

  const addGrade = useCallback(() => {
    setSelectedGrades(prev => (prev.length < 10 ? [...prev, { subject_id: '', grade: 1 }] : prev))
  }, [])

  const removeGrade = useCallback((index: number) => {
    setSelectedGrades(prev => prev.filter((_, i) => i !== index))
  }, [])

  const updateGrade = useCallback((index: number, field: keyof SubjectGrade, value: string | number) => {
    setSelectedGrades(prev => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }, [])

  const getUsedSubjects = useCallback(() => selectedGrades.map(g => g.subject_id).filter(Boolean), [selectedGrades])

  return {
    currentStepIndex,
    setCurrentStepIndex,
    loading,
    setLoading,
    error,
    setError,
    success,
    setSuccess,
    applicationId,
    setApplicationId,
    submittedApplication,
    setSubmittedApplication,
    selectedGrades,
    setSelectedGrades,
    isDraftSaving,
    setIsDraftSaving,
    draftSaved,
    setDraftSaved,
    restoringDraft,
    setRestoringDraft,
    draftLoaded,
    setDraftLoaded,
    confirmSubmission,
    setConfirmSubmission,
    addGrade,
    removeGrade,
    updateGrade,
    getUsedSubjects
  }
}
