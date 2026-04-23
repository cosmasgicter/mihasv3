import { useMemo } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import type { ApplicationFormData, SubjectGrade } from '../types'
import { buildWizardReadiness } from '../lib/wizardReadiness'

export interface OverallProgress {
  percentage: number
  completedFields: number
  totalFields: number
  stepProgress: { step: number; completed: number; total: number }[]
}

interface OverallProgressOptions {
  selectedGrades?: SubjectGrade[]
  uploadedFiles?: Record<string, boolean>
  hasResultSlipFile?: boolean
  hasIdentityFile?: boolean
  paymentStatus?: 'pending' | 'successful' | 'failed' | 'deferred' | null
  confirmSubmission?: boolean
}

export const useOverallProgress = (
  form: UseFormReturn<ApplicationFormData>,
  optionsOrGrades: OverallProgressOptions | SubjectGrade[] = {}
): OverallProgress => {
  const values = (() => {
    try {
      return typeof form?.watch === 'function' 
        ? (form.watch() as Partial<ApplicationFormData> ?? {}) 
        : {}
    } catch {
      return {}
    }
  })()

  return useMemo(() => {
    const options = Array.isArray(optionsOrGrades)
      ? { selectedGrades: optionsOrGrades }
      : optionsOrGrades
    const selectedGrades = options.selectedGrades ?? values.grades ?? []
    const readiness = buildWizardReadiness({
      values,
      selectedGrades,
      uploadedFiles: options.uploadedFiles,
      hasResultSlipFile: options.hasResultSlipFile,
      hasIdentityFile: options.hasIdentityFile,
      paymentStatus: options.paymentStatus,
      confirmSubmission: options.confirmSubmission,
    })

    return {
      percentage: readiness.percentage,
      completedFields: readiness.completedItems,
      totalFields: readiness.totalItems,
      stepProgress: readiness.stepProgress.map((step, index) => ({
        step: index,
        completed: step.completed,
        total: step.total,
      }))
    }
  }, [values, optionsOrGrades])
}
