import { useMemo } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { isPaymentResolvedForProgress } from '@/lib/paymentStatus'
import type { ApplicationFormData, SubjectGrade } from '../types'

export interface StepValidation {
  isValid: boolean
  completedFields: number
  totalFields: number
  missingFields: string[]
}

interface StepValidationOptions {
  paymentStatus?: 'pending' | 'successful' | 'failed' | 'deferred' | null
  confirmSubmission?: boolean
  selectedGrades?: SubjectGrade[]
  hasResultSlip?: boolean
  hasIdentityDocument?: boolean
  uploading?: boolean
  /** True once the backend has resolved the assigned school + fee (R10.2/R10.3). */
  assignmentResolved?: boolean
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
  currentStep: number,
  options: StepValidationOptions = {}
): StepValidation => {
  const {
    paymentStatus = null,
    confirmSubmission = false,
    selectedGrades = [],
    hasResultSlip = false,
    hasIdentityDocument = false,
    uploading = false,
    assignmentResolved = false,
  } = options
  const values = (() => {
    try {
      return typeof form?.watch === 'function' ? (form.watch() as Partial<ApplicationFormData> ?? {}) : {}
    } catch {
      return {}
    }
  })()

  return useMemo(() => {
    // Step indices match steps/config.ts:
    // 0 program, 1 assignedSchool, 2 personal, 3 education, 4 payment, 5 submit.
    const validations: Record<number, () => StepValidation> = {
      0: () => {
        const fields = [
          { label: 'Program', complete: isFieldComplete(values.program) },
          { label: 'Intake', complete: isFieldComplete(values.intake) },
        ]
        const completed = fields.filter(f => f.complete)
        const missing = fields.filter(f => !f.complete).map(f => f.label)
        return {
          isValid: completed.length === fields.length,
          completedFields: completed.length,
          totalFields: fields.length,
          missingFields: missing,
        }
      },
      1: () => ({
        isValid: assignmentResolved,
        completedFields: assignmentResolved ? 1 : 0,
        totalFields: 1,
        missingFields: assignmentResolved ? [] : ['Confirm your assigned school and fee'],
      }),
      2: () => {
        const hasNrcOrPassport = isFieldComplete(values.nrc_number) || isFieldComplete(values.passport_number)
        const fields = [
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
      3: () => {
        const validGrades = (
          selectedGrades.length > 0
            ? selectedGrades
            : values.grades ?? []
        ).filter(g => g.subject_id && g.grade >= 1 && g.grade <= 9)
        const uniqueGradeCount = new Set(validGrades.map(g => g.subject_id)).size
        const hasDuplicateGrades = validGrades.length !== uniqueGradeCount
        const hasEnoughGrades = uniqueGradeCount >= 5 && !hasDuplicateGrades
        const hasAnyGrades = validGrades.length > 0
        const fields = [
          { label: 'At least 5 unique subjects', complete: hasEnoughGrades },
          { label: 'Result slip', complete: hasResultSlip },
          { label: 'Identity document', complete: hasIdentityDocument },
          { label: 'Uploads finished', complete: !uploading },
        ]
        const completedFields = fields.filter(f => f.complete).length
        const missingFields = fields.filter(f => !f.complete).map(f => f.label)

        return {
          isValid: missingFields.length === 0,
          completedFields,
          totalFields: fields.length,
          missingFields: hasEnoughGrades
            ? missingFields
            : hasDuplicateGrades
              ? ['Remove duplicate subjects', ...missingFields.slice(1)]
              : hasAnyGrades
                ? [`${5 - uniqueGradeCount} more unique subject${5 - uniqueGradeCount > 1 ? 's' : ''} needed`, ...missingFields.slice(1)]
              : missingFields
        }
      },
      4: () => {
        const paymentComplete = isPaymentResolvedForProgress(paymentStatus)
        return {
          isValid: paymentComplete,
          completedFields: paymentComplete ? 1 : 0,
          totalFields: 1,
          missingFields: paymentComplete ? [] : ['Complete payment or choose pay later']
        }
      },
      5: () => {
        const paymentComplete = isPaymentResolvedForProgress(paymentStatus)
        const confirmationComplete = confirmSubmission
        const missing: string[] = []
        if (!paymentComplete) {
          missing.push('Payment completion or deferment')
        }
        if (!confirmationComplete) {
          missing.push('Final confirmation checkbox')
        }
        return {
          isValid: paymentComplete && confirmationComplete,
          completedFields: Number(paymentComplete) + Number(confirmationComplete),
          totalFields: 2,
          missingFields: missing
        }
      }
    }

    return validations[currentStep]?.() || {
      isValid: false,
      completedFields: 0,
      totalFields: 0,
      missingFields: []
    }
  }, [values, currentStep, paymentStatus, confirmSubmission, selectedGrades, hasResultSlip, hasIdentityDocument, uploading, assignmentResolved])
}
