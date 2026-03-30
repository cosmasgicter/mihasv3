import type { UseFormReturn } from 'react-hook-form'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert'
import { CheckboxWithLabel } from '@/components/ui/checkbox'
import { SectionCard } from '@/components/ui/SectionCard'
import { animateClasses } from '@/lib/animations'
// eslint-disable-next-line no-restricted-imports -- type import from eligibilityEngine until API-backed replacement is ready
import type { EligibilityResult } from '@/lib/eligibilityEngine'
import { cn } from '@/lib/utils'

import type { Grade12Subject, SubjectGrade, WizardFormData } from '../types'

interface SubmitStepProps {
  title: string
  form: UseFormReturn<WizardFormData>
  subjects: Grade12Subject[]
  selectedGrades: SubjectGrade[]
  eligibilityCheck: EligibilityResult | null
  resultSlipFile: File | null
  extraKycFile: File | null
  proofOfPaymentFile: File | null
  confirmSubmission: boolean
  onConfirmChange: (value: boolean) => void
  selectedProgramName?: string
  selectedInstitutionLabel?: string
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
  proofOfPaymentFile,
  confirmSubmission,
  onConfirmChange,
  selectedProgramName,
  selectedInstitutionLabel
}: SubmitStepProps) => {
  const formValues = form.watch()
  const programLabel = selectedProgramName?.trim() || formValues.program
  const institutionLabel = selectedInstitutionLabel?.trim() || ''
  const isPayLater = formValues.payment_option === 'pay_later'
  const readinessChecks = [
    {
      label: 'Personal information completed',
      detail: formValues.full_name ? formValues.full_name : 'Full name is still missing',
      completed: Boolean(formValues.full_name),
    },
    {
      label: 'Minimum Grade 12 subjects added',
      detail: `${selectedGrades.length}/5 subjects recorded`,
      completed: selectedGrades.length >= 5,
    },
    {
      label: 'Result slip attached',
      detail: resultSlipFile ? resultSlipFile.name : 'Upload your result slip to complete this step',
      completed: Boolean(resultSlipFile),
    },
    {
      label: isPayLater ? 'Payment will be completed later' : 'Proof of payment attached',
      detail: isPayLater
        ? 'You chose to submit first and pay later from the dashboard.'
        : proofOfPaymentFile
          ? proofOfPaymentFile.name
          : 'Upload proof of payment or return to the payment step.',
      completed: isPayLater || Boolean(proofOfPaymentFile),
    },
  ]

  return (
    <div className={`space-y-6 ${animateClasses.fadeIn}`} data-testid="submit-step">
      <SectionCard
        title={title}
        description="Review the details below before you submit. Once the application is sent, you cannot edit it from this wizard."
        contentClassName="space-y-6"
      >
        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <section className="space-y-4" aria-labelledby="submit-readiness-heading">
            <div>
              <h3 id="submit-readiness-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Submission readiness
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Each item below should be complete before you submit.
              </p>
            </div>

            <ul className="space-y-3">
              {readinessChecks.map(item => (
                <li
                  key={item.label}
                  className={cn(
                    'rounded-xl border px-4 py-3',
                    item.completed ? 'border-success/20 bg-success/5' : 'border-warning/20 bg-warning/5'
                  )}
                >
                  <div className="flex items-start gap-3">
                    {item.completed ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" aria-hidden="true" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-5 w-5 text-warning" aria-hidden="true" />
                    )}
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">{item.label}</p>
                      <p className="text-sm text-muted-foreground">{item.detail}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-4" aria-labelledby="submit-summary-heading">
            <div>
              <h3 id="submit-summary-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Application summary
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Confirm the record exactly as admissions should review it.
              </p>
            </div>

            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/70 bg-muted/50 px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Full name</dt>
                <dd className="mt-1 text-sm font-medium text-foreground">{formValues.full_name || 'Not provided'}</dd>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/50 px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Programme</dt>
                <dd className="mt-1 text-sm font-medium text-foreground">{programLabel || 'Not selected'}</dd>
              </div>
              {institutionLabel && (
                <div className="rounded-xl border border-border/70 bg-muted/50 px-4 py-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Institution</dt>
                  <dd className="mt-1 text-sm font-medium text-foreground">{institutionLabel}</dd>
                </div>
              )}
              <div className="rounded-xl border border-border/70 bg-muted/50 px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Intake</dt>
                <dd className="mt-1 text-sm font-medium text-foreground">{formValues.intake || 'Not selected'}</dd>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/50 px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Documents</dt>
                <dd className="mt-1 text-sm font-medium text-foreground">
                  Result slip {resultSlipFile ? 'attached' : 'missing'}, identity document {extraKycFile ? 'attached' : 'not added'}
                </dd>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/50 px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment</dt>
                <dd className="mt-1 text-sm font-medium text-foreground">
                  {isPayLater ? 'Pay later selected' : proofOfPaymentFile ? 'Proof of payment attached' : 'Proof of payment missing'}
                </dd>
              </div>
            </dl>

            <div className="rounded-xl border border-border/70 bg-card px-4 py-4">
              <p className="text-sm font-semibold text-foreground">Subjects ({selectedGrades.length})</p>
              <ul className="mt-3 space-y-2 text-sm text-foreground">
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
    </div>
  )
}

export default SubmitStep
