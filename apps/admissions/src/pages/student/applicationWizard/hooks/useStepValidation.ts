import { useMemo } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import type { ApplicationFormData } from '../types'

export interface StepValidation {
  isValid: boolean
  completedFields: number
  totalFields: number
  missingFields: string[]
}

const isFieldComplete = (value: unknown): boolean => {
  try {
    return value != null && String(value).trim() !== ''
  } catch {
    return false
  }
}

export const useStepValidation = (
  form: UseFormReturn<ApplicationFormData>,
  currentStep: number
): StepValidation => {
  const values = (() => {
    try {
      return typeof form?.watch === 'function' ? (form.watch() as Partial<ApplicationFormData> ?? {}) : {}
    } catch {
      return {}
    }
  })()

  return useMemo(() => {
    const validations: Record<number, () => StepValidation> = {
      0: () => {
        const hasNrcOrPassport = isFieldComplete(values.nrc_number) || isFieldComplete(values.passport_number)
        const fields = [
          { label: 'Program', complete: isFieldComplete(values.program) },
          { label: 'Intake', complete: isFieldComplete(values.intake) },
          { label: 'Full Name', complete: isFieldComplete(values.full_name) },
          { label: 'Email', complete: isFieldComplete(values.email) },
          { label: 'Phone', complete: isFieldComplete(values.phone) },
          { label: 'NRC or Passport', complete: hasNrcOrPassport },
          { label: 'Date of Birth', complete: isFieldComplete(values.date_of_birth) },
          { label: 'Gender', complete: isFieldComplete(values.sex) },
          { label: 'Address', complete: isFieldComplete(values.residence_town) }
        ]
        const completed = fields.filter(f => f.complete)
        const missing = fields.filter(f => !f.complete).map(f => f.label)
        return {
          isValid: completed.length === fields.length,
          completedFields: completed.length,
          totalFields: fields.length,
          missingFields: missing
        }
      },
      1: () => {
        const validGrades = values.grades?.filter(g => g.subject_id && g.grade >= 1 && g.grade <= 9) || []
        const hasEnoughGrades = validGrades.length >= 5
        const hasAnyGrades = validGrades.length > 0
        return {
          isValid: hasEnoughGrades,
          completedFields: hasAnyGrades ? validGrades.length : 0,
          totalFields: 5,
          missingFields: hasEnoughGrades ? [] : hasAnyGrades ? [`${5 - validGrades.length} more subject${5 - validGrades.length > 1 ? 's' : ''} needed`] : ['At least 5 subjects']
        }
      },
      2: () => {
        // Payment is handled by the Lenco widget — always valid from the form perspective
        return {
          isValid: true,
          completedFields: 1,
          totalFields: 1,
          missingFields: []
        }
      },
      3: () => {
        return {
          isValid: true,
          completedFields: 1,
          totalFields: 1,
          missingFields: []
        }
      }
    }

    return validations[currentStep]?.() || {
      isValid: false,
      completedFields: 0,
      totalFields: 0,
      missingFields: []
    }
  }, [values, currentStep])
}
