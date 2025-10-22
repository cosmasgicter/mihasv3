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
  const values = form.watch()

  return useMemo(() => {
    const validations: Record<number, () => StepValidation> = {
      0: () => {
        const fields = [
          { key: 'program', label: 'Program', value: values.program },
          { key: 'intake', label: 'Intake', value: values.intake },
          { key: 'full_name', label: 'Full Name', value: values.full_name },
          { key: 'email', label: 'Email', value: values.email },
          { key: 'phone', label: 'Phone', value: values.phone },
          { key: 'nrc', label: 'NRC', value: values.nrc },
          { key: 'date_of_birth', label: 'Date of Birth', value: values.date_of_birth },
          { key: 'sex', label: 'Gender', value: values.sex },
          { key: 'residence_town', label: 'Address', value: values.residence_town }
        ]
        const completed = fields.filter(f => isFieldComplete(f.value))
        const missing = fields.filter(f => !isFieldComplete(f.value)).map(f => f.label)
        return {
          isValid: completed.length === fields.length,
          completedFields: completed.length,
          totalFields: fields.length,
          missingFields: missing
        }
      },
      1: () => {
        const fields = [
          { key: 'grades', label: 'At least 5 subjects', value: values.grades?.length >= 5 }
        ]
        const completed = fields.filter(f => f.value)
        const missing = fields.filter(f => !f.value).map(f => f.label)
        return {
          isValid: completed.length === fields.length,
          completedFields: completed.length,
          totalFields: fields.length,
          missingFields: missing
        }
      },
      2: () => {
        const fields = [
          { key: 'payment_method', label: 'Payment Method', value: values.payment_method },
          { key: 'payment_reference', label: 'Payment Reference', value: values.payment_reference }
        ]
        const completed = fields.filter(f => isFieldComplete(f.value))
        const missing = fields.filter(f => !isFieldComplete(f.value)).map(f => f.label)
        return {
          isValid: completed.length === fields.length,
          completedFields: completed.length,
          totalFields: fields.length,
          missingFields: missing
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
