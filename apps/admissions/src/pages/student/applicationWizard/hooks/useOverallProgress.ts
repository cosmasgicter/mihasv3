import { useMemo } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import type { ApplicationFormData, SubjectGrade } from '../types'

export interface OverallProgress {
  percentage: number
  completedFields: number
  totalFields: number
  stepProgress: { step: number; completed: number; total: number }[]
}

const isFieldComplete = (value: unknown): boolean => {
  try {
    return value != null && String(value).trim() !== ''
  } catch {
    return false
  }
}

export const useOverallProgress = (
  form: UseFormReturn<ApplicationFormData>,
  selectedGrades: SubjectGrade[] = []
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
    // Step 0: Basic KYC (9 fields)
    const hasNrcOrPassport = isFieldComplete(values.nrc_number) || isFieldComplete(values.passport_number)
    const step0Fields = [
      isFieldComplete(values.program),
      isFieldComplete(values.intake),
      isFieldComplete(values.full_name),
      isFieldComplete(values.email),
      isFieldComplete(values.phone),
      hasNrcOrPassport,
      isFieldComplete(values.date_of_birth),
      isFieldComplete(values.sex),
      isFieldComplete(values.residence_town)
    ]
    const step0Completed = step0Fields.filter(Boolean).length

    // Step 1: Education (5 subjects minimum)
    const validGrades = (
      selectedGrades.length > 0
        ? selectedGrades
        : values.grades ?? []
    ).filter(g => g.subject_id && g.grade >= 1 && g.grade <= 9)
    const step1Completed = Math.min(validGrades.length, 5)
    const step1Total = 5

    // Step 2: Payment — handled by Lenco widget, always counts as 1 field
    const step2Completed = 1
    const step2Total = 1

    // Step 3: Review (always 1/1 when reached)
    const step3Total = 1
    const step3Completed = step0Completed === 9 && step1Completed >= 5 ? 1 : 0

    const stepProgress = [
      { step: 0, completed: step0Completed, total: step0Fields.length },
      { step: 1, completed: step1Completed, total: step1Total },
      { step: 2, completed: step2Completed, total: step2Total },
      { step: 3, completed: step3Completed, total: step3Total }
    ]

    const totalFields = step0Fields.length + step1Total + step2Total + step3Total
    const completedFields = step0Completed + step1Completed + step2Completed + step3Completed
    const percentage = Math.round((completedFields / totalFields) * 100)

    return {
      percentage,
      completedFields,
      totalFields,
      stepProgress
    }
  }, [values, selectedGrades])
}
