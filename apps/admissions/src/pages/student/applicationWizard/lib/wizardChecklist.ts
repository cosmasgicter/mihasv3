/**
 * The wizard's per-step checklist (admissions-v2 task 11.2, R16.1, MAINT-01).
 *
 * Extracted **verbatim** from the 1,371-line `index.tsx`, where it was a closure
 * over eight render-scope variables and could therefore only be exercised by
 * rendering the whole wizard. The behaviour is unchanged — same items, same
 * order, same completion rules, same document contract — and the extraction is
 * what makes the checklist renderable on a phone (finding **STU-03**: "mobile
 * loses the desktop checklist/context") without duplicating its rules into a
 * second component.
 *
 * It is a **view projection**, not a gate. What may be submitted is task 6.5's
 * server readiness, re-evaluated under row locks at submit; what a student has
 * left to type on *this step* is this. The two are different questions, and
 * `WizardProgressSummary` renders the first while this renders the second.
 */
import { isPaymentResolvedForProgress } from '@/lib/paymentStatus'
import type { RequiredDocumentsContract } from '@/lib/requiredDocuments'

import { documentChecklistItems, type LegacyDocumentState } from './requiredDocumentSurfaces'
import type { StepKey } from '../steps/config'
import type { SubjectGrade } from '../types'

export interface WizardChecklistItem {
  label: string
  completed: boolean
}

export interface BuildWizardChecklistInput {
  stepKey: StepKey
  /** The form's current values. Read defensively: a test may render without them. */
  values: Record<string, unknown>
  selectedGrades: SubjectGrade[]
  assignmentResolved: boolean
  confirmSubmission: boolean
  paymentStatus: string | null
  /** The versioned required-document contract, or `null` when it could not be read. */
  requiredDocumentsContract: RequiredDocumentsContract | null
  legacyDocumentState: LegacyDocumentState
}

/**
 * The payment row's label on the payment step.
 *
 * A deferral is named as the student's own choice rather than as a failure, and a
 * settled fee names the gateway that settled it — both were in `index.tsx` and both
 * are kept, because they are the difference between "you still owe this" and "you
 * chose to pay this later".
 */
export function paymentChecklistLabel(paymentStatus: string | null): string {
  if (paymentStatus === 'deferred') return 'Payment deferred for later'
  if (paymentStatus === 'successful') return 'Payment processed via Lenco gateway'
  return 'Payment action completed'
}

/** The same fee, read from the review step, where "still outstanding" is the point. */
export function submitPaymentChecklistLabel(paymentStatus: string | null): string {
  if (paymentStatus === 'deferred') return 'Payment deferred and still outstanding'
  if (paymentStatus === 'successful') return 'Payment confirmed'
  return 'Payment not yet resolved'
}

const isFilled = (value: unknown): boolean => Boolean(value)

export function buildWizardChecklist({
  stepKey,
  values,
  selectedGrades,
  assignmentResolved,
  confirmSubmission,
  paymentStatus,
  requiredDocumentsContract,
  legacyDocumentState,
}: BuildWizardChecklistInput): WizardChecklistItem[] {
  const uniqueGradeCount = new Set(
    selectedGrades
      .filter(grade => grade.subject_id && Number(grade.grade) >= 1 && Number(grade.grade) <= 9)
      .map(grade => grade.subject_id),
  ).size

  switch (stepKey) {
    case 'program':
      return [
        { label: 'Program selected', completed: isFilled(values.program) },
        { label: 'Intake selected', completed: isFilled(values.intake) },
      ]
    case 'assignedSchool':
      return [{ label: 'Assigned school confirmed', completed: assignmentResolved }]
    case 'personal':
      return [
        {
          label: 'Personal details complete',
          completed: Boolean(values.full_name && values.date_of_birth && values.sex),
        },
        {
          label: 'Contact information provided',
          completed: Boolean(values.phone && values.email),
        },
        {
          label: 'NRC or Passport provided',
          completed: Boolean(values.nrc_number || values.passport_number),
        },
        { label: 'Address details added', completed: isFilled(values.residence_town) },
      ]
    case 'education':
      return [
        {
          label: `${uniqueGradeCount} unique subjects added (min 5)`,
          completed: uniqueGradeCount >= 5,
        },
        // Documents come from the versioned contract (task 7.2, R11.6), so the
        // checklist names the tenant's own requirements instead of two fixed types.
        ...documentChecklistItems(requiredDocumentsContract, legacyDocumentState),
      ]
    case 'payment':
      return [
        {
          label: paymentChecklistLabel(paymentStatus),
          completed: isPaymentResolvedForProgress(paymentStatus),
        },
      ]
    case 'submit':
      return [
        {
          label: submitPaymentChecklistLabel(paymentStatus),
          completed: isPaymentResolvedForProgress(paymentStatus),
        },
        { label: 'Terms accepted', completed: confirmSubmission },
      ]
    default:
      return []
  }
}
