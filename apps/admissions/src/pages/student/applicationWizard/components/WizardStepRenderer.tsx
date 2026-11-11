/**
 * One state of the wizard's machine, rendered (task 11.2, MAINT-01).
 *
 * Requirements: **R10.2** ("ONE frontend state machine SHALL own … other modules
 * SHALL be pure adapters or views"), **R14.3-R14.5**. Findings: **MAINT-01**.
 *
 * This is the step `switch` lifted out of `index.tsx` unchanged: same six branches,
 * same order, same props, same per-step `ErrorBoundary` with the same `reportError`
 * tag. It takes the controller's whole result rather than forty individual props,
 * which is exactly why it is a *relocation* and not a rewrite — there is no new
 * prop contract to get subtly wrong, and the characterisation suite
 * (`applicationWizardCharacterisation.test.ts` plus
 * `student-wizard-characterisation.spec.ts`, both green before this move) is what
 * proves it.
 *
 * The renderer decides nothing. It selects which step component is on screen from
 * `currentStepConfig.key`; every gate, every validation rule and every save belongs
 * to the controller.
 */
import { CheckCircle } from 'lucide-react'
import type { UseFormReturn } from 'react-hook-form'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { reportError } from '@/lib/errorReporter'

import AssignedSchoolStep from '../steps/AssignedSchoolStep'
import BasicKycStep from '../steps/BasicKycStep'
import EducationStep from '../steps/EducationStep'
import PaymentStep from '../steps/PaymentStep'
import ProgramStep from '../steps/ProgramStep'
import SubmitStep from '../steps/SubmitStep'
import { getStepIndexByKey, type StepKey } from '../steps/config'
import type { UseWizardControllerResult } from '../hooks/useWizardController'
import type { DocumentReviewCheck } from '../lib/requiredDocumentSurfaces'
import type { SubjectGrade, WizardFormData } from '../types'

export interface WizardStepRendererProps {
  wizard: UseWizardControllerResult
  /** Field-level `aria-describedby` wiring owned by the page (R16.2). */
  getFieldAriaDescribedBy: (fieldName: string) => string | undefined
  /** Grade handlers that clear the page-level error before delegating. */
  onAddGrade: () => void
  onRemoveGrade: (index: number) => void
  onUpdateGrade: (index: number, field: keyof SubjectGrade, value: string | number) => void
  onGetUsedSubjects: () => string[]
  /** Review-step document rows resolved from the versioned contract (task 7.2). */
  documentChecks: DocumentReviewCheck[]
  onNavigateToStep: (stepKey: StepKey) => void
}

export function WizardStepRenderer({
  wizard,
  getFieldAriaDescribedBy,
  onAddGrade,
  onRemoveGrade,
  onUpdateGrade,
  onGetUsedSubjects,
  documentChecks,
  onNavigateToStep,
}: WizardStepRendererProps) {
  const {
    currentStepConfig,
    form,
    programs,
    programsLoading,
    programsError,
    intakesError,
    onRetryPrograms,
    onRetryIntakes,
    intakes,
    subjects,
    hasAutoPopulatedData,
    completionPercentage,
    missingFields,
    selectedGrades,
    selectedProgramDetails,
    eligibilityCheck,
    recommendedSubjects,
    requiredDocuments,
    resultSlipFile,
    extraKycFile,
    uploadedFiles,
    confirmSubmission,
    setConfirmSubmission,
    paymentStatus,
    paymentPhase,
    setPaymentStatus,
    refetchPaymentStatus,
    wizardReadiness,
    applicationId,
    submittedApplication,
    assignmentPreview,
    assignmentPreviewLoading,
    assignmentPreviewError,
    assignmentRecovery,
    assignmentContactMailto,
    assignmentInterestRecorded,
    joinAssignmentInterestList,
    refetchAssignmentPreview,
    goToStep,
    ocrStatus,
    ocrCandidates,
    ocrWithheld,
    ocrAppliedCount,
    ocrFailureReason,
    ocrRetryAfterSeconds,
    ocrExtractionMeta,
    confirmOcrCandidates,
    dismissOcrCandidates,
    retryOcr,
  } = wizard

  const typedForm = form as UseFormReturn<WizardFormData>
  const assignedSchoolLabel =
    assignmentPreview?.assigned_school?.full_name ||
    assignmentPreview?.assigned_school?.name ||
    submittedApplication?.institution

  switch (currentStepConfig.key) {
    case 'program':
      return (
        <ErrorBoundary level="section" onError={error => reportError(error, { step: 'program' })}>
          <ProgramStep
            form={typedForm}
            programs={programs}
            programsLoading={programsLoading}
            programsError={programsError}
            intakesError={intakesError}
            onRetryPrograms={onRetryPrograms}
            onRetryIntakes={onRetryIntakes}
            intakes={intakes}
            getFieldAriaDescribedBy={getFieldAriaDescribedBy}
          />
        </ErrorBoundary>
      )

    case 'assignedSchool':
      return (
        <ErrorBoundary
          level="section"
          onError={error => reportError(error, { step: 'assignedSchool' })}
        >
          <AssignedSchoolStep
            preview={assignmentPreview ?? null}
            isLoading={assignmentPreviewLoading}
            error={assignmentPreviewError}
            recovery={assignmentRecovery}
            onRetry={refetchAssignmentPreview}
            onChangeSelection={() => goToStep(getStepIndexByKey('program'))}
            onJoinInterestList={joinAssignmentInterestList}
            interestRecorded={assignmentInterestRecorded}
            contactMailto={assignmentContactMailto}
          />
        </ErrorBoundary>
      )

    case 'personal':
      return (
        <ErrorBoundary level="section" onError={error => reportError(error, { step: 'personal' })}>
          <BasicKycStep
            form={typedForm}
            hasAutoPopulatedData={hasAutoPopulatedData}
            completionPercentage={completionPercentage}
            missingFields={missingFields}
            getFieldAriaDescribedBy={getFieldAriaDescribedBy}
          />
        </ErrorBoundary>
      )

    case 'education':
      return (
        <ErrorBoundary level="section" onError={error => reportError(error, { step: 'education' })}>
          <EducationStep
            subjects={subjects}
            selectedProgram={selectedProgramDetails?.name}
            selectedGrades={selectedGrades}
            eligibilityCheck={eligibilityCheck}
            recommendedSubjects={recommendedSubjects}
            requiredDocuments={requiredDocuments}
            addGrade={onAddGrade}
            removeGrade={onRemoveGrade}
            updateGrade={onUpdateGrade}
            getUsedSubjects={onGetUsedSubjects}
            ocrStatus={ocrStatus}
            ocrCandidates={ocrCandidates}
            ocrWithheld={ocrWithheld}
            ocrAppliedCount={ocrAppliedCount}
            ocrFailureReason={ocrFailureReason}
            ocrRetryAfterSeconds={ocrRetryAfterSeconds}
            ocrExtractionMeta={ocrExtractionMeta}
            onConfirmOcrCandidates={confirmOcrCandidates}
            onDismissOcrCandidates={dismissOcrCandidates}
            onRetryOcr={retryOcr}
          />
        </ErrorBoundary>
      )

    case 'payment':
      return (
        <ErrorBoundary level="section" onError={error => reportError(error, { step: 'payment' })}>
          {assignedSchoolLabel && (
            <Alert className="mb-4 border-primary/30 bg-primary/5">
              <CheckCircle className="h-4 w-4" />
              <AlertTitle>Assigned school</AlertTitle>
              <AlertDescription>
                {assignedSchoolLabel}
                {assignmentPreview?.program_name || submittedApplication?.program
                  ? `: ${assignmentPreview?.program_name || submittedApplication?.program}`
                  : ''}
              </AlertDescription>
            </Alert>
          )}
          <PaymentStep
            form={typedForm}
            applicationId={applicationId}
            applicationNumber={submittedApplication?.applicationNumber ?? null}
            polledStatus={paymentStatus}
            paymentPhase={paymentPhase}
            onPaymentStatusChange={setPaymentStatus}
            onPaymentStatusRefresh={refetchPaymentStatus}
          />
        </ErrorBoundary>
      )

    case 'submit':
      return (
        <ErrorBoundary level="section" onError={error => reportError(error, { step: 'submit' })}>
          <SubmitStep
            form={typedForm}
            subjects={subjects}
            selectedGrades={selectedGrades}
            eligibilityCheck={eligibilityCheck}
            resultSlipFile={resultSlipFile}
            extraKycFile={extraKycFile}
            uploadedFiles={uploadedFiles}
            documentChecks={documentChecks}
            confirmSubmission={confirmSubmission}
            onConfirmChange={setConfirmSubmission}
            selectedProgramName={selectedProgramDetails?.name}
            selectedIntakeLabel={intakes.find(intake => intake.id === form.watch('intake'))?.name}
            selectedInstitutionLabel={
              submittedApplication?.institution ||
              selectedProgramDetails?.institutions?.full_name ||
              selectedProgramDetails?.institutions?.name ||
              undefined
            }
            paymentStatus={paymentStatus}
            wizardReadiness={wizardReadiness}
            onNavigateToStep={onNavigateToStep}
          />
        </ErrorBoundary>
      )

    default:
      return null
  }
}
