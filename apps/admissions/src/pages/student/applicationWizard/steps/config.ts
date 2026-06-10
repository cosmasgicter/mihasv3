import { FileText, GraduationCap, CreditCard, Send, BookOpen, School, type LucideIcon } from 'lucide-react'

export type StepKey = 'program' | 'assignedSchool' | 'personal' | 'education' | 'payment' | 'submit'

export interface WizardStepConfig {
  id: number
  key: StepKey
  progressTitle: string
  title: string
  description: string
  icon: LucideIcon
  nextButtonLabel: string
}

/**
 * Program-first wizard step order (Requirement R10.1):
 *   1. program + intake
 *   2. assigned-school review (school + fee + required documents + contact)
 *   3. personal details
 *   4. education and documents
 *   5. payment
 *   6. review and submit
 *
 * The assigned-school checkpoint (step 2) sits strictly before payment so the
 * payment step is unreachable until the backend has resolved the assigned
 * school and fee (R10.3). See `isAssignedSchoolReachable` / `isPaymentReachable`
 * below for the pure step-gating guards.
 */
export const wizardSteps: WizardStepConfig[] = [
  {
    id: 1,
    key: 'program',
    progressTitle: 'Programme',
    title: 'Programme and intake',
    description: 'Choose the programme and intake you are applying for.',
    icon: BookOpen,
    nextButtonLabel: 'Next Step'
  },
  {
    id: 2,
    key: 'assignedSchool',
    progressTitle: 'Assigned school',
    title: 'Your assigned school',
    description: 'Review your assigned school, fee, and required documents before continuing.',
    icon: School,
    nextButtonLabel: 'Next Step'
  },
  {
    id: 3,
    key: 'personal',
    progressTitle: 'Personal',
    title: 'Personal details',
    description: 'Confirm your personal and contact details.',
    icon: FileText,
    nextButtonLabel: 'Next Step'
  },
  {
    id: 4,
    key: 'education',
    progressTitle: 'Education',
    title: 'Education',
    description: 'Add grades and upload documents.',
    icon: GraduationCap,
    nextButtonLabel: 'Next Step'
  },
  {
    id: 5,
    key: 'payment',
    progressTitle: 'Payment',
    title: 'Payment',
    description: 'Pay the application fee.',
    icon: CreditCard,
    nextButtonLabel: 'Next Step'
  },
  {
    id: 6,
    key: 'submit',
    progressTitle: 'Review',
    title: 'Review',
    description: 'Confirm and submit.',
    icon: Send,
    nextButtonLabel: 'Submit Application'
  }
]

export const saveNowLabel = 'Save Now'
export const previousButtonLabel = 'Previous'

export const getStepIndexById = (stepId: number): number =>
  wizardSteps.findIndex(step => step.id === stepId)

export const getStepByKey = (key: StepKey): WizardStepConfig | undefined =>
  wizardSteps.find(step => step.key === key)

export const getStepIndexByKey = (key: StepKey): number =>
  wizardSteps.findIndex(step => step.key === key)

/**
 * Pure step-gating guard (R10.3): the assigned-school checkpoint is the gate
 * for payment. `assignmentResolved` is true once the backend has returned an
 * assigned school AND a resolved fee for the chosen program + intake.
 *
 * These guards are intentionally pure and derivable from wizard state so the
 * "payment unreachable before the assigned-school checkpoint" invariant is
 * testable in isolation (see task 21.3 / programFirstWizard.property.test.ts).
 */
export const PROGRAM_STEP_INDEX = getStepIndexByKey('program')
export const ASSIGNED_SCHOOL_STEP_INDEX = getStepIndexByKey('assignedSchool')
export const PAYMENT_STEP_INDEX = getStepIndexByKey('payment')

/** A step is reachable when every gate up to and including it is satisfied. */
export interface StepGateState {
  /** Backend has resolved the assigned school + fee for the chosen program+intake. */
  assignmentResolved: boolean
}

/**
 * Returns true when the wizard may navigate to `targetIndex` given the current
 * gate state. Steps at or before the assigned-school checkpoint are always
 * reachable; every step strictly after the checkpoint (personal, education,
 * payment, submit) requires a resolved assignment.
 */
export const isStepReachable = (targetIndex: number, gate: StepGateState): boolean => {
  if (targetIndex <= ASSIGNED_SCHOOL_STEP_INDEX) return true
  return gate.assignmentResolved
}

/** R10.3: payment is unreachable until assignment + fee resolve. */
export const isPaymentReachable = (gate: StepGateState): boolean =>
  isStepReachable(PAYMENT_STEP_INDEX, gate)
