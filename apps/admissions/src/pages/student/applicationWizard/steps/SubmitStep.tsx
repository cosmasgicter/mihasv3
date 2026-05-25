import { useCallback, useEffect, useMemo, useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { AlertTriangle, CheckCircle2, RefreshCw, Sparkles } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert'
import { CheckboxWithLabel } from '@/components/ui/checkbox'
import { SectionCard } from '@/components/ui/SectionCard'
import { animateClasses } from '@/lib/animations'
import { apiClient } from '@/services/client'
// eslint-disable-next-line no-restricted-imports -- type import from eligibilityEngine until API-backed replacement is ready
import type { EligibilityResult } from '@/lib/eligibilityEngine'
import { cn } from '@/lib/utils'

import type { Grade12Subject, SubjectGrade, WizardFormData } from '../types'
import type { WizardReadiness } from '../lib/wizardReadiness'
import type { StepKey } from '../steps/config'

interface SubmitStepProps {
  title: string
  form: UseFormReturn<WizardFormData>
  subjects: Grade12Subject[]
  selectedGrades: SubjectGrade[]
  eligibilityCheck: EligibilityResult | null
  resultSlipFile: File | null
  extraKycFile: File | null
  uploadedFiles: Record<string, boolean>
  confirmSubmission: boolean
  onConfirmChange: (value: boolean) => void
  selectedProgramName?: string
  selectedIntakeLabel?: string
  selectedInstitutionLabel?: string
  paymentStatus?: 'pending' | 'successful' | 'failed' | 'deferred' | null
  wizardReadiness?: WizardReadiness
  applicationId?: string | null
  onNavigateToStep?: (stepKey: StepKey) => void
}

/** Exported for unit testing — determines if an AI/fallback summary is display-worthy. */
export const summaryLooksComplete = (s: string | null | undefined): boolean => {
  const trimmed = (s ?? '').trim()
  return trimmed.length >= 50 && /[.!?]$/.test(trimmed)
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

function buildFallbackPreviewSummary({
  fullName,
  program,
  intake,
  institution,
  subjectsCount,
  paymentStatus,
}: {
  fullName?: string | null
  program?: string | null
  intake?: string | null
  institution?: string | null
  subjectsCount: number
  paymentStatus?: 'pending' | 'successful' | 'failed' | 'deferred' | null
}) {
  const firstName = fullName?.trim()?.split(/\s+/)[0] || 'Student'
  const programLabel = program?.trim() || 'your chosen programme'
  const institutionLabel = institution?.trim() || 'MIHAS'
  const intakeLabel = intake?.trim()
  const paymentLine = paymentStatus === 'successful'
    ? 'Your payment has already been confirmed.'
    : paymentStatus === 'deferred'
      ? 'Your payment is marked as deferred, so you can submit now and pay later from the dashboard.'
      : paymentStatus === 'pending'
        ? 'Your payment is still being confirmed, so keep this page open while we check for updates.'
        : 'Complete payment in the previous step before you submit.'

  const parts = [
    `${firstName}, you are preparing an application to ${institutionLabel} for ${programLabel}.`,
    subjectsCount > 0
      ? `You currently have ${subjectsCount} recorded subject${subjectsCount === 1 ? '' : 's'} in this application.`
      : 'Your subjects will appear here once you finish the education step.',
    intakeLabel
      ? `The application will be reviewed for the ${intakeLabel} intake once you submit it.`
      : 'The admissions team will review the selected intake once you submit it.',
    paymentLine,
  ]

  return parts.join(' ')
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
  confirmSubmission,
  onConfirmChange,
  selectedProgramName,
  selectedIntakeLabel,
  selectedInstitutionLabel,
  paymentStatus,
  wizardReadiness,
  applicationId,
  onNavigateToStep
}: SubmitStepProps) => {
  const formValues = form.watch()
  const programLabel = selectedProgramName?.trim() || formValues.program
  const uniqueValidSubjectCount = useMemo(() => new Set(
    selectedGrades
      .filter(grade => grade.subject_id && Number(grade.grade) >= 1 && Number(grade.grade) <= 9)
      .map(grade => grade.subject_id)
  ).size, [selectedGrades])

  // AI-powered personalized summary
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiRetryNonce, setAiRetryNonce] = useState(0)
  const fallbackSummary = useMemo(() => buildFallbackPreviewSummary({
    fullName: formValues.full_name,
    program: programLabel,
    intake: selectedIntakeLabel || ((formValues as Record<string, unknown>).intake_name as string | undefined) || formValues.intake,
    institution: selectedInstitutionLabel,
    subjectsCount: uniqueValidSubjectCount,
    paymentStatus,
  }), [formValues.full_name, formValues.intake, paymentStatus, programLabel, uniqueValidSubjectCount, selectedInstitutionLabel, selectedIntakeLabel])

  const loadAiSummary = useCallback(async () => {
    if (!applicationId) return

    let finalError: string | null = null
    setAiLoading(true)
    setAiError(null)

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const data = await apiClient.request<{ summary: string | null; source?: string }>(`/applications/${applicationId}/preview-summary/`)
        const summary = data?.summary?.trim() || ''
        const looksComplete = summary.length >= 50 && /[.!?]$/.test(summary)
        if (looksComplete) {
          setAiSummary(summary)
          setAiError(null)
          setAiLoading(false)
          return
        }
        finalError = summary ? 'The personalized summary was incomplete.' : 'No personalized summary was returned.'
      } catch (error) {
        finalError = error instanceof Error ? error.message : 'Unable to load the personalized summary.'
      }

      if (attempt === 0) {
        await new Promise(resolve => window.setTimeout(resolve, 1200))
      }
    }

    setAiSummary(null)
    setAiError(finalError)
    setAiLoading(false)
  }, [applicationId])

  useEffect(() => {
    void loadAiSummary()
  }, [aiRetryNonce, loadAiSummary])
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
      stepKey: 'basicKyc' as StepKey,
    },
    {
      label: 'Minimum Grade 12 subjects added',
      detail: `${uniqueValidSubjectCount}/5 unique subjects recorded`,
      completed: isRequirementComplete('grades', uniqueValidSubjectCount >= 5),
      stepKey: 'education' as StepKey,
    },
    {
      label: 'Result slip attached',
      detail: resultSlipFile ? resultSlipFile.name : hasResultSlip ? 'Already uploaded' : 'Upload your result slip to complete this step',
      completed: isRequirementComplete('result_slip', hasResultSlip),
      stepKey: 'education' as StepKey,
    },
    {
      label: 'Identity document attached (NRC or Passport)',
      detail: extraKycFile ? extraKycFile.name : hasIdentityDocument ? 'Already uploaded' : 'Upload your NRC or passport to complete this step',
      completed: isRequirementComplete('extra_kyc', hasIdentityDocument),
      stepKey: 'education' as StepKey,
    },
    {
      label: isSuccessfulPayment
        ? 'Payment completed via Lenco'
        : isDeferredPayment
          ? 'Payment deferred'
          : 'Payment still required',
      detail: isSuccessfulPayment
        ? 'Payment confirmed through the secure Lenco gateway.'
        : isDeferredPayment
          ? 'You chose to pay later. You can pay from your dashboard after submission.'
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
        {/* AI-powered personalized summary */}
        {(aiSummary || fallbackSummary || aiLoading) && (
          <div className={`rounded-lg border border-primary/20 bg-primary/5 p-5 ${animateClasses.fadeIn}`}>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary/70">Application Preview</p>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground" role="status">
                  {fallbackSummary}
                </p>
                {aiSummary && (
                  <div className="mt-3 rounded-md border border-primary/15 bg-background/60 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary/70">Personalized note</p>
                    <p className="mt-1 text-sm leading-relaxed text-foreground">{aiSummary}</p>
                  </div>
                )}
                {aiLoading && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary/40 border-t-primary" />
                    <span>Personalizing your preview…</span>
                  </div>
                )}
                {aiError && !aiLoading && applicationId && (
                  <button
                    type="button"
                    onClick={() => setAiRetryNonce((count) => count + 1)}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary/80"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Load personalized preview
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

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
                      <p className="text-sm font-semibold text-foreground">{item.label}</p>
                      <p className="text-sm text-muted-foreground">{item.detail}</p>
                    </div>
                    {!item.completed && onNavigateToStep && (
                      <button
                        type="button"
                        onClick={() => onNavigateToStep(item.stepKey)}
                        className="mt-0.5 shrink-0 rounded-lg border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning-foreground transition-colors hover:bg-warning/20"
                      >
                        Go to step
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-4" aria-labelledby="submit-summary-heading">
            <div className="flex items-center justify-between">
              <div>
                <h3 id="submit-summary-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Application summary
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Confirm the record exactly as admissions should review it.
                </p>
              </div>
              {onNavigateToStep && (
                <button
                  type="button"
                  onClick={() => onNavigateToStep('basicKyc')}
                  className="shrink-0 rounded-lg border border-border/70 px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/5 min-h-[44px] flex items-center"
                >
                  Edit details
                </button>
              )}
            </div>

            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border/70 bg-muted/50 px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Full name</dt>
                <dd className="mt-1 text-sm font-medium text-foreground">{formValues.full_name || 'Not provided'}</dd>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/50 px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Programme</dt>
                <dd className="mt-1 text-sm font-medium text-foreground">{programLabel || 'Not selected'}</dd>
              </div>
              {institutionLabel && (
                <div className="rounded-lg border border-border/70 bg-muted/50 px-4 py-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Institution</dt>
                  <dd className="mt-1 text-sm font-medium text-foreground">{institutionLabel}</dd>
                </div>
              )}
              <div className="rounded-lg border border-border/70 bg-muted/50 px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Intake</dt>
                <dd className="mt-1 text-sm font-medium text-foreground">{selectedIntakeLabel || (formValues as Record<string, unknown>).intake_name as string || formValues.intake || 'Not selected'}</dd>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/50 px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Documents</dt>
                <dd className="mt-1 text-sm font-medium text-foreground">
                  Result slip {hasResultSlip ? 'attached' : 'missing'}, identity document {hasIdentityDocument ? 'attached' : 'not added'}
                </dd>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/50 px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment</dt>
                <dd className="mt-1 text-sm font-medium text-foreground">
                  {isSuccessfulPayment
                    ? 'Processed via Lenco payment gateway'
                    : isDeferredPayment
                      ? 'Deferred for later payment from the dashboard'
                      : 'Awaiting payment action'}
                </dd>
              </div>
            </dl>

            <div className="rounded-lg border border-border/70 bg-card px-4 py-4">
              <p className="text-sm font-semibold text-foreground">Subjects ({uniqueValidSubjectCount} unique)</p>
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
        {paymentStatus !== 'successful' && paymentStatus !== 'deferred' && (
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
