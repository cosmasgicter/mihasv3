/**
 * The wizard's review-and-submit step.
 *
 * **No generative summary (admissions-v2 task 11.5, R16.5 / MAINT-02).** This
 * step used to open with a "Application Preview" card under a `Sparkles` icon
 * that fetched `GET /applications/{id}/preview-summary/` on every mount, retried
 * once after 1.2 s, spun a "Personalizing your preview…" indicator, and offered a
 * "Load personalized preview" button that fired the same request again.
 *
 * Task **7.4** deleted that endpoint together with the rest of admissions
 * generative AI (`backend/config/settings/base.py` retired the
 * `ai_student_preview` throttle scope with it), so every one of those requests
 * was a 404 and the card always rendered the locally-built fallback sentence.
 * That sentence restated the programme, the intake, the subject count and the
 * payment state — each of which the **Submission readiness** checklist directly
 * below states as its own row, with a completion state and a link to the step
 * that fixes it. AI framing over a dead route, wrapped around a duplicate of the
 * checklist.
 *
 * The checklist is what remains. This is the student-side counterpart of what
 * tasks 7.4 / 9.4 did on the admin side, where `AISummaryPanel` became the
 * deterministic `ReviewReadinessPanel`.
 *
 * The jobs-ops AI surfaces (`apps/jobs-ops`, `AI_GATEWAY_API_KEY`) are a
 * different application with a different boundary and are untouched.
 */
import { useMemo } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert'
import { CheckboxWithLabel } from '@/components/ui/checkbox'
import { SectionCard } from '@/components/ui/SectionCard'
import { animateClasses } from '@/lib/animations'
import { isPaymentResolvedForProgress } from '@/lib/paymentStatus'
import type { EligibilityResult } from '@/lib/eligibilityEngine'
import { cn } from '@/lib/utils'

import type { Grade12Subject, SubjectGrade, WizardFormData } from '../types'
import type { WizardReadiness } from '../lib/wizardReadiness'
import type { StepKey } from '../steps/config'
import {
  documentReviewChecks,
  type DocumentReviewCheck,
} from '../lib/requiredDocumentSurfaces'

interface SubmitStepProps {
  title: string
  form: UseFormReturn<WizardFormData>
  subjects: Grade12Subject[]
  selectedGrades: SubjectGrade[]
  eligibilityCheck: EligibilityResult | null
  resultSlipFile: File | null
  extraKycFile: File | null
  uploadedFiles: Record<string, boolean>
  /**
   * Review rows for this application's required documents, derived from the
   * versioned requirement contract (task 7.2, R11.6, finding STU-13). Omitted
   * only by a caller with no contract access, which keeps the legacy two-row
   * fallback.
   */
  documentChecks?: DocumentReviewCheck[]
  confirmSubmission: boolean
  onConfirmChange: (value: boolean) => void
  selectedProgramName?: string
  selectedIntakeLabel?: string
  selectedInstitutionLabel?: string
  paymentStatus?: 'pending' | 'successful' | 'failed' | 'deferred' | null
  wizardReadiness?: WizardReadiness
  onNavigateToStep?: (stepKey: StepKey) => void
}

const gradeLabelMap: Record<number, string> = {
  1: 'A+',
  2: 'A',
  3: 'B+',
  4: 'B',
  5: 'C+',
  6: 'C',
  7: 'D+',
  8: 'D',
  9: 'F'
}

const SubmitStep = ({
  title,
  form,
  subjects,
  selectedGrades,
  eligibilityCheck,
  resultSlipFile,
  extraKycFile,
  uploadedFiles,
  documentChecks,
  confirmSubmission,
  onConfirmChange,
  selectedProgramName,
  selectedIntakeLabel,
  selectedInstitutionLabel,
  paymentStatus,
  wizardReadiness,
  onNavigateToStep
}: SubmitStepProps) => {
  const formValues = form.watch()
  const programLabel = selectedProgramName?.trim() || formValues.program
  const uniqueValidSubjectCount = useMemo(() => new Set(
    selectedGrades
      .filter(grade => grade.subject_id && Number(grade.grade) >= 1 && Number(grade.grade) <= 9)
      .map(grade => grade.subject_id)
  ).size, [selectedGrades])

  const institutionLabel = selectedInstitutionLabel?.trim() || ''
  const hasResultSlip = Boolean(resultSlipFile || uploadedFiles.result_slip)
  const hasIdentityDocument = Boolean(extraKycFile || uploadedFiles.extra_kyc)
  const isDeferredPayment = paymentStatus === 'deferred'
  const isSuccessfulPayment = paymentStatus === 'successful'
  const readinessItemsByField = new Map(
    wizardReadiness?.stepProgress.flatMap(step => step.missingItems.map(item => [item.field, item])) ?? []
  )
  const isRequirementComplete = (field: string, fallback: boolean) =>
    wizardReadiness ? !readinessItemsByField.has(field) : fallback
  const readinessChecks = [
    {
      label: 'Personal information completed',
      detail: formValues.full_name ? formValues.full_name : 'Full name is still missing',
      completed: isRequirementComplete('full_name', Boolean(formValues.full_name)),
      stepKey: 'personal' as StepKey,
    },
    {
      label: 'Minimum Grade 12 subjects added',
      detail: `${uniqueValidSubjectCount}/5 unique subjects recorded`,
      completed: isRequirementComplete('grades', uniqueValidSubjectCount >= 5),
      stepKey: 'education' as StepKey,
    },
    // Documents come from the versioned requirement contract (task 7.2, R11.6).
    // The contract state is the persisted state, so it is authoritative over the
    // advisory client readiness — the review must never ask for a document the
    // server already holds, nor stay silent about one the tenant requires.
    ...(documentChecks ??
      documentReviewChecks(null, {
        hasResultSlip,
        hasIdentityDocument,
        resultSlipName: resultSlipFile?.name ?? null,
        identityName: extraKycFile?.name ?? null,
      })
    ).map(check => ({
      label: check.label,
      detail: check.detail,
      completed: documentChecks
        ? check.completed
        : isRequirementComplete(check.field, check.completed),
      stepKey: 'education' as StepKey,
    })),
    {
      label: isSuccessfulPayment
        ? 'Payment completed via Lenco'
        : isDeferredPayment
          ? 'Payment deferred'
          : 'Payment still required',
      detail: isSuccessfulPayment
        ? 'Payment confirmed through the secure Lenco gateway.'
        : isDeferredPayment
          ? 'You chose to pay later. You can pay from the payment page after submission.'
          : 'Please complete payment in the payment step before submitting.',
      completed: isRequirementComplete('payment', isSuccessfulPayment || isDeferredPayment),
      stepKey: 'payment' as StepKey,
    },
  ]

  return (
    <div className={`space-y-6 ${animateClasses.fadeIn}`} data-testid="submit-step">
      <fieldset className="border-none p-0 m-0 space-y-6">
        <legend className="sr-only">Review and Submit</legend>
        <SectionCard
        description="Review the details below before you submit. Once the application is sent, you cannot edit it from this wizard."
        contentClassName="space-y-6"
      >
        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <section className="space-y-4" aria-labelledby="submit-readiness-heading">
            <div>
              <h3 id="submit-readiness-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Submission readiness
              </h3>
              <p className="mt-1 text-base sm:text-sm text-muted-foreground">
                Each item below should be complete before you submit.
              </p>
            </div>

            <ul className="space-y-3">
              {readinessChecks.map(item => (
                <li
                  key={item.label}
                  className={cn(
                    'rounded-lg border px-4 py-3.5 transition-all duration-300',
                    item.completed ? 'border-success/20 bg-success/5' : 'border-warning/20 bg-warning/5'
                  )}
                >
                  <div className="flex items-start gap-3">
                    {item.completed ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" aria-hidden="true" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-5 w-5 text-warning" aria-hidden="true" />
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-base sm:text-sm font-semibold text-foreground">{item.label}</p>
                      <p className="text-base sm:text-sm text-muted-foreground">{item.detail}</p>
                    </div>
                    {!item.completed && onNavigateToStep && (
                      <button
                        type="button"
                        onClick={() => onNavigateToStep(item.stepKey)}
                        className="mt-0.5 shrink-0 rounded-lg border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-warning/20 min-h-touch flex items-center"
                      >
                        Go to step
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {wizardReadiness && !wizardReadiness.canSubmit && wizardReadiness.missingItems.length > 0 && (
              <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3.5">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-base sm:text-sm font-semibold text-foreground">
                      Complete these {wizardReadiness.missingItems.length} item{wizardReadiness.missingItems.length === 1 ? '' : 's'} to enable submission
                    </p>
                    <ul className="space-y-1.5">
                      {wizardReadiness.missingItems.map(item => (
                        <li key={`${item.stepKey}-${item.field}`} className="flex items-start justify-between gap-3 text-base sm:text-sm">
                          <span className="text-muted-foreground">
                            <span className="font-medium text-foreground">{item.label}:</span> {item.message}
                          </span>
                          {onNavigateToStep && (
                            <button
                              type="button"
                              onClick={() => onNavigateToStep(item.stepKey)}
                              className="shrink-0 rounded-lg border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-warning/20 min-h-touch flex items-center"
                            >
                              Fix
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="space-y-4" aria-labelledby="submit-summary-heading">
            <div className="flex items-center justify-between">
              <div>
                <h3 id="submit-summary-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Application summary
                </h3>
                <p className="mt-1 text-base sm:text-sm text-muted-foreground">
                  Confirm the record exactly as admissions should review it.
                </p>
              </div>
              {onNavigateToStep && (
                <button
                  type="button"
                  onClick={() => onNavigateToStep('personal')}
                  className="shrink-0 rounded-lg border border-border/70 px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/5 min-h-[44px] flex items-center"
                >
                  Edit details
                </button>
              )}
            </div>

            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border/70 bg-muted/50 px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Full name</dt>
                <dd className="mt-1 text-base sm:text-sm font-medium text-foreground">{formValues.full_name || 'Not provided'}</dd>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/50 px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Programme</dt>
                <dd className="mt-1 text-base sm:text-sm font-medium text-foreground">{programLabel || 'Not selected'}</dd>
              </div>
              {institutionLabel && (
                <div className="rounded-lg border border-border/70 bg-muted/50 px-4 py-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Institution</dt>
                  <dd className="mt-1 text-base sm:text-sm font-medium text-foreground">{institutionLabel}</dd>
                </div>
              )}
              <div className="rounded-lg border border-border/70 bg-muted/50 px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Intake</dt>
                <dd className="mt-1 text-base sm:text-sm font-medium text-foreground">{selectedIntakeLabel || (formValues as Record<string, unknown>).intake_name as string || formValues.intake || 'Not selected'}</dd>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/50 px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Documents</dt>
                <dd className="mt-1 text-base sm:text-sm font-medium text-foreground">
                  Result slip {hasResultSlip ? 'attached' : 'missing'}, identity document {hasIdentityDocument ? 'attached' : 'not added'}
                </dd>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/50 px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment</dt>
                <dd className="mt-1 text-base sm:text-sm font-medium text-foreground">
                  {isSuccessfulPayment
                    ? 'Processed via Lenco payment gateway'
                    : isDeferredPayment
                      ? 'Deferred for later payment from the dashboard'
                      : 'Awaiting payment action'}
                </dd>
              </div>
            </dl>

            <div className="rounded-lg border border-border/70 bg-card px-4 py-4">
              <p className="text-base sm:text-sm font-semibold text-foreground">Subjects ({uniqueValidSubjectCount} unique)</p>
              <ul className="mt-3 space-y-2 text-base sm:text-sm text-foreground">
                {selectedGrades.map((grade, index) => {
                  const subject = subjects.find(subjectItem => subjectItem.id === grade.subject_id)
                  const subjectName = subject?.name || grade.subject_id || 'Loading...'
                  const gradeLabel = gradeLabelMap[grade.grade] || grade.grade

                  return (
                    <li key={index} className="flex items-start justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2">
                      <span>{subjectName}</span>
                      <span className="font-medium text-muted-foreground">{gradeLabel} ({grade.grade})</span>
                    </li>
                  )
                })}
                {selectedGrades.length === 0 && (
                  <li className="rounded-lg bg-muted/50 px-3 py-2 text-muted-foreground">
                    No subjects selected
                  </li>
                )}
              </ul>
            </div>

            {eligibilityCheck && (
              <Alert variant={eligibilityCheck.eligible ? 'success' : 'warning'}>
                <AlertTitle className="text-foreground">
                  {eligibilityCheck.eligible ? 'Eligibility check passed' : 'Eligibility advisory'}
                  {eligibilityCheck.score ? ` (${eligibilityCheck.score}%)` : ''}
                </AlertTitle>
                <AlertDescription className="text-muted-foreground">
                  {eligibilityCheck.eligible ? 'Your recorded subjects meet the current admissions criteria for this programme.' : eligibilityCheck.message}
                </AlertDescription>
              </Alert>
            )}
          </section>
        </div>
      </SectionCard>

      <SectionCard
        title="Final confirmation"
        description="You must confirm that the application is accurate before the submit button is enabled."
        padding="sm"
      >
        {!isPaymentResolvedForProgress(paymentStatus) && (
          <Alert variant="warning" className="mb-4">
            <AlertTitle className="text-foreground">Payment required</AlertTitle>
            <AlertDescription className="text-muted-foreground">
              Please go back to the payment step and complete your application fee payment before submitting.
            </AlertDescription>
          </Alert>
        )}
        <CheckboxWithLabel
          id="confirm"
          checked={confirmSubmission}
          onCheckedChange={checked => onConfirmChange(checked === true)}
          label="I confirm that all information provided is accurate and complete."
          description="This confirmation becomes part of your submitted admissions record."
          required
        />

        {!confirmSubmission && (
          <Alert variant="warning">
            <AlertTitle className="text-foreground">Confirmation required</AlertTitle>
            <AlertDescription className="text-muted-foreground">
              Check the confirmation box to enable final submission.
            </AlertDescription>
          </Alert>
        )}
      </SectionCard>
      </fieldset>
    </div>
  )
}

export default SubmitStep
