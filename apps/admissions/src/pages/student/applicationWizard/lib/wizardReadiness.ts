import { normalizePaymentStatus } from '@/lib/paymentStatus'
import { normalizeResidenceTown } from '@/lib/residenceTown'
import type { SubjectGrade, WizardFormData } from '../types'
import type { StepKey } from '../steps/config'

export interface WizardReadinessItem {
  stepKey: StepKey
  field: string
  label: string
  message: string
  completed: boolean
}

export interface WizardStepReadiness {
  stepKey: StepKey
  completed: number
  total: number
  percentage: number
  isComplete: boolean
  missingItems: WizardReadinessItem[]
}

export interface WizardReadiness {
  percentage: number
  completedItems: number
  totalItems: number
  canSubmit: boolean
  missingItems: WizardReadinessItem[]
  stepProgress: WizardStepReadiness[]
  stepProgressByKey: Record<StepKey, WizardStepReadiness>
}

export interface BuildWizardReadinessInput {
  values: Partial<WizardFormData>
  selectedGrades?: SubjectGrade[]
  uploadedFiles?: Record<string, boolean>
  hasResultSlipFile?: boolean
  hasIdentityFile?: boolean
  paymentStatus?: 'pending' | 'successful' | 'failed' | 'deferred' | null
  confirmSubmission?: boolean
  /** True once the backend has resolved the assigned school + fee (R10.2/R10.3). */
  assignmentResolved?: boolean
}

const isCompleteValue = (value: unknown): boolean => {
  if (value == null) return false
  try {
    return String(value).trim().length > 0
  } catch {
    return false
  }
}

const isValidGrade = (grade: SubjectGrade): boolean =>
  Boolean(grade.subject_id) && Number(grade.grade) >= 1 && Number(grade.grade) <= 9

const createItem = (
  stepKey: StepKey,
  field: string,
  label: string,
  completed: boolean,
  message: string
): WizardReadinessItem => ({
  stepKey,
  field,
  label,
  completed,
  message,
})

const buildStep = (stepKey: StepKey, items: WizardReadinessItem[]): WizardStepReadiness => {
  const completed = items.filter(item => item.completed).length
  const total = items.length
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100)
  const missingItems = items.filter(item => !item.completed)

  return {
    stepKey,
    completed,
    total,
    percentage,
    isComplete: missingItems.length === 0,
    missingItems,
  }
}

export const buildWizardReadiness = ({
  values,
  selectedGrades = [],
  uploadedFiles = {},
  hasResultSlipFile = false,
  hasIdentityFile = false,
  paymentStatus = null,
  confirmSubmission = false,
  assignmentResolved = false,
}: BuildWizardReadinessInput): WizardReadiness => {
  const validGrades = selectedGrades.filter(isValidGrade)
  const validGradeCount = new Set(validGrades.map(grade => grade.subject_id)).size
  const hasDuplicateGrades = validGrades.length !== validGradeCount
  const hasNrcOrPassport = isCompleteValue(values.nrc_number) || isCompleteValue(values.passport_number)
  const hasResultSlip = hasResultSlipFile || uploadedFiles.result_slip === true
  const hasIdentityDocument = hasIdentityFile || uploadedFiles.extra_kyc === true

  const programItems = [
    createItem('program', 'program', 'Programme', isCompleteValue(values.program), 'Select a programme.'),
    createItem('program', 'intake', 'Intake', isCompleteValue(values.intake), 'Select an intake.'),
  ]

  const assignedSchoolItems = [
    createItem(
      'assignedSchool',
      'assignedSchool',
      'Assigned school',
      assignmentResolved,
      'Confirm your assigned school and fee before continuing.'
    ),
  ]

  const personalItems = [
    createItem('personal', 'full_name', 'Full name', isCompleteValue(values.full_name), 'Enter your full name.'),
    createItem('personal', 'email', 'Email', isCompleteValue(values.email), 'Enter a valid email address.'),
    createItem('personal', 'phone', 'Phone number', isCompleteValue(values.phone), 'Enter your phone number.'),
    createItem('personal', 'nrc_number', 'NRC or passport', hasNrcOrPassport, 'Enter either your NRC or passport number.'),
    createItem('personal', 'date_of_birth', 'Date of birth', isCompleteValue(values.date_of_birth), 'Enter your date of birth.'),
    createItem('personal', 'sex', 'Sex', isCompleteValue(values.sex), 'Select your sex.'),
    createItem(
      'personal',
      'residence_town',
      'Residence town',
      normalizeResidenceTown(String(values.residence_town ?? '')).length >= 2,
      'Enter your residence town.'
    ),
  ]

  const educationItems = [
    createItem(
      'education',
      'grades',
      'Grade 12 subjects',
      validGradeCount >= 5 && !hasDuplicateGrades,
      hasDuplicateGrades
        ? 'Each subject can only be selected once.'
        : `Add at least 5 unique Grade 12 subjects (${validGradeCount}/5 selected).`
    ),
    createItem('education', 'result_slip', 'Result slip', hasResultSlip, 'Upload your result slip.'),
    createItem('education', 'extra_kyc', 'Identity document', hasIdentityDocument, 'Upload your NRC or passport document.'),
  ]

  const paymentItems = [
    createItem(
      'payment',
      'payment',
      'Payment or deferment',
      normalizePaymentStatus(paymentStatus) === 'verified' || paymentStatus === 'deferred',
      'Complete payment or defer it before continuing.'
    ),
  ]

  const submitItems = [
    createItem('submit', 'confirmSubmission', 'Final confirmation', confirmSubmission, 'Confirm that the application is accurate.'),
  ]

  const stepProgress = [
    buildStep('program', programItems),
    buildStep('assignedSchool', assignedSchoolItems),
    buildStep('personal', personalItems),
    buildStep('education', educationItems),
    buildStep('payment', paymentItems),
    buildStep('submit', submitItems),
  ]

  const completedItems = stepProgress.reduce((sum, step) => sum + step.completed, 0)
  const totalItems = stepProgress.reduce((sum, step) => sum + step.total, 0)
  const missingItems = stepProgress.flatMap(step => step.missingItems)
  const percentage = totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100)

  return {
    percentage,
    completedItems,
    totalItems,
    canSubmit: missingItems.length === 0,
    missingItems,
    stepProgress,
    stepProgressByKey: stepProgress.reduce((acc, step) => {
      acc[step.stepKey] = step
      return acc
    }, {} as Record<StepKey, WizardStepReadiness>),
  }
}
