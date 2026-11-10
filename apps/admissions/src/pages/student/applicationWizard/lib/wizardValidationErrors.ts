/**
 * The wizard's per-step validation summary (task 11.2, MAINT-01).
 *
 * Requirements: **R16.2** (errors are named, described and focusable),
 * **R10.2**. Findings: **MAINT-01**.
 *
 * Lifted **verbatim** out of `index.tsx`'s `collectStepValidationErrors` closure:
 * same branches, same field ids, same labels, same sentences, same order, same
 * `gradesHydrating` guard. Nothing here is improved, because two other lanes'
 * property tests read this behaviour and one of them
 * (`test_bug3_hydration_race.test.ts`) exists precisely to stop the hydration
 * guard being dropped — a grade count evaluated while the server's grades are
 * still loading tells a student they have zero subjects when they have five.
 *
 * The labels read as they always did ("Full Name", "City/Town", "NRC or
 * Passport"), even where the readiness rail words the same requirement
 * differently. Re-wording them would be a copy change disguised as a refactor; if
 * they should converge, that is a deliberate decision with its own diff.
 */
import { isPaymentResolvedForProgress } from '@/lib/paymentStatus'

import type { WizardValidationError } from '../components/WizardErrorSummary'
import type { StepKey } from '../steps/config'
import type { SubjectGrade, WizardFormData } from '../types'

export interface CollectWizardValidationErrorsInput {
  stepKey: StepKey
  formData: Partial<WizardFormData>
  selectedGrades: SubjectGrade[]
  /** True while the server's grades are still being hydrated (bug 3's guard). */
  gradesHydrating: boolean
  resultSlipFile: File | null
  extraKycFile: File | null
  uploadedFiles: Record<string, boolean>
  uploading: boolean
  paymentStatus: string | null
  confirmSubmission: boolean
  assignmentResolved: boolean
}

export function collectWizardValidationErrors({
  stepKey,
  formData,
  selectedGrades,
  gradesHydrating,
  resultSlipFile,
  extraKycFile,
  uploadedFiles,
  uploading,
  paymentStatus,
  confirmSubmission,
  assignmentResolved,
}: CollectWizardValidationErrorsInput): WizardValidationError[] {
  const errors: WizardValidationError[] = []

  if (stepKey === 'program') {
    if (!formData.program) {
      errors.push({ field: 'program', label: 'Programme', message: 'Please select a programme' })
    }
    if (!formData.intake) {
      errors.push({ field: 'intake', label: 'Intake', message: 'Please select an intake' })
    }
  }

  if (stepKey === 'assignedSchool' && !assignmentResolved) {
    errors.push({
      field: 'assignedSchool',
      label: 'Assigned school',
      message: 'Confirm your assigned school and fee before continuing',
    })
  }

  if (stepKey === 'personal') {
    const fieldChecks: Array<{ field: string; label: string; check: () => boolean; message: string }> = [
      { field: 'full_name', label: 'Full name', check: () => !!formData.full_name, message: 'Full name is required' },
      { field: 'date_of_birth', label: 'Date of Birth', check: () => !!formData.date_of_birth, message: 'Date of birth is required' },
      { field: 'sex', label: 'Sex', check: () => !!formData.sex, message: 'Please select your sex' },
      { field: 'phone', label: 'Phone', check: () => !!formData.phone, message: 'Phone number is required' },
      { field: 'email', label: 'Email', check: () => !!formData.email, message: 'Email address is required' },
      { field: 'residence_town', label: 'City/Town', check: () => !!formData.residence_town, message: 'City or town is required' },
    ]
    for (const { field, label, check, message } of fieldChecks) {
      if (!check()) {
        errors.push({ field, label, message })
      }
    }
    if (!formData.nrc_number && !formData.passport_number) {
      errors.push({
        field: 'nrc_number',
        label: 'NRC or Passport',
        message: 'Either NRC or Passport number is required',
      })
    }
  }

  if (stepKey === 'education') {
    if (!gradesHydrating) {
      const validGrades = selectedGrades.filter(
        grade => grade.subject_id && Number(grade.grade) >= 1 && Number(grade.grade) <= 9
      )
      const gradeCount = new Set(validGrades.map(grade => grade.subject_id)).size
      if (gradeCount < 5) {
        errors.push({
          field: 'grades',
          label: 'Subject grades',
          message: `Minimum 5 unique subjects required (${gradeCount} selected)`,
        })
      }
      if (validGrades.length !== gradeCount) {
        errors.push({
          field: 'grades',
          label: 'Subject grades',
          message: 'Each subject can only be selected once',
        })
      }
    }
    if (!resultSlipFile && !uploadedFiles.result_slip) {
      errors.push({ field: 'result_slip', label: 'Result slip', message: 'Result slip is required' })
    }
    if (!extraKycFile && !uploadedFiles.extra_kyc) {
      errors.push({
        field: 'extra_kyc',
        label: 'Identity document',
        message: 'An NRC or Passport document is required before proceeding',
      })
    }
  }

  if (stepKey === 'payment' && !isPaymentResolvedForProgress(paymentStatus)) {
    errors.push({
      field: 'payment',
      label: 'Payment',
      message: 'Complete payment confirmation before moving to the review step',
    })
  }

  if (stepKey === 'submit') {
    if (!isPaymentResolvedForProgress(paymentStatus)) {
      errors.push({
        field: 'payment',
        label: 'Payment',
        message: 'Payment must be confirmed before you can submit the application',
      })
    }
    if (uploading) {
      errors.push({
        field: 'result_slip',
        label: 'Uploads',
        message: 'A file is still uploading. Please wait for it to finish before submitting.',
      })
    }
    if (!confirmSubmission) {
      errors.push({
        field: 'confirmSubmission',
        label: 'Confirmation',
        message: 'Please confirm that all information is accurate',
      })
    }
  }

  return errors
}
