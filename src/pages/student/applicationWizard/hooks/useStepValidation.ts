import { useMemo } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import type { ApplicationFormData } from '../types'

export interface StepValidation {
  isValid: boolean
  completedFields: number
  totalFields: number
  missingFields: string[]
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
          { key: 'program_id', label: 'Program', value: values.program_id },
          { key: 'intake_id', label: 'Intake', value: values.intake_id },
          { key: 'first_name', label: 'First Name', value: values.first_name },
          { key: 'last_name', label: 'Last Name', value: values.last_name },
          { key: 'email', label: 'Email', value: values.email },
          { key: 'phone', label: 'Phone', value: values.phone },
          { key: 'nrc', label: 'NRC', value: values.nrc },
          { key: 'date_of_birth', label: 'Date of Birth', value: values.date_of_birth },
          { key: 'gender', label: 'Gender', value: values.gender },
          { key: 'address', label: 'Address', value: values.address }
        ]
        const completed = fields.filter(f => f.value && String(f.value).trim() !== '')
        const missing = fields.filter(f => !f.value || String(f.value).trim() === '').map(f => f.label)
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
        const completed = fields.filter(f => f.value && String(f.value).trim() !== '')
        const missing = fields.filter(f => !f.value || String(f.value).trim() === '').map(f => f.label)
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
