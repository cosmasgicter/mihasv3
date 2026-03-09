import { ArrowLeft, ArrowRight, CheckCircle, Send } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'

import { useOptimizedAnimation } from '@/hooks/useOptimizedAnimation'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { SimpleErrorBoundary } from '@/components/ui/SimpleErrorBoundary'
import { SaveStatusIndicator, CompactSaveStatusIndicator } from '@/components/ui/SaveStatusIndicator'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert'
import { SectionCard } from '@/components/ui/SectionCard'

import SubmissionSuccess from './components/SubmissionSuccess'
import { StepChecklist } from './components/StepChecklist'
import { ApplicationPreview } from './components/ApplicationPreview'
import { KeyboardShortcutsHelp } from './components/KeyboardShortcutsHelp'
import { DraftManager } from './components/DraftManager'
import { ReminderSettings } from './components/ReminderSettings'
import { AnalyticsDashboard } from './components/AnalyticsDashboard'
import { EnhancedProgressIndicator } from './components/EnhancedProgressIndicator'
import BasicKycStep from './steps/BasicKycStep'
import EducationStep from './steps/EducationStep'
import PaymentStep from './steps/PaymentStep'
import SubmitStep from './steps/SubmitStep'
import useWizardController from './hooks/useWizardController'
import { useStepValidation } from './hooks/useStepValidation'
import { useOverallProgress } from './hooks/useOverallProgress'
import { useSmartAutoSave } from './hooks/useSmartAutoSave'
import { useEstimatedTime } from './hooks/useEstimatedTime'
import { previousButtonLabel, saveNowLabel, wizardSteps } from './steps/config'
import type { SubjectGrade } from './types'
import { WIZARD_COPY } from './constants'

const ApplicationWizardContent = () => {
  const {
    authLoading,
    restoringDraft,
    user,
    success,
    loading,
    uploading,
    error,
    setError,
    form,
    totalSteps,
    currentStepIndex,
    currentStepConfig,
    isLastStep,
    selectedProgram,
    selectedProgramDetails,
    selectedGrades,
    eligibilityCheck,
    recommendedSubjects,
    programs,
    intakes,
    subjects,
    hasAutoPopulatedData,
    completionPercentage,
    missingFields,
    confirmSubmission,
    setConfirmSubmission,
    resultSlipFile,
    extraKycFile,
    popFile,
    uploadProgress,
    uploadedFiles,
    isDraftSaving,
    draftSaved,
    draftLoaded,
    submittedApplication,
    persistingSlip,
    slipLoading,
    emailLoading,
    handleDownloadSlip,
    handleEmailSlip,
    dismissSlipProgress,
    handleResultSlipUpload,
    handleExtraKycUpload,
    handleProofOfPaymentUpload,
    getPaymentTarget,
    handleNextStep,
    handlePrevStep,
    handleSubmitApplication,
    addGrade,
    removeGrade,
    updateGrade,
    getUsedSubjects,
    saveDraft,
    watchValues
  } = useWizardController()

  const stepValidation = useStepValidation(form, currentStepIndex)
  const overallProgress = useOverallProgress(form)
  const smartAutoSave = useSmartAutoSave({
    onSave: saveDraft,
    watchValues,
    enabled: draftLoaded && !loading && !uploading && !restoringDraft && !success
  })
  const { formattedTime } = useEstimatedTime(currentStepIndex, totalSteps)
  const { shouldAnimate, prefersReducedMotion, isMobile } = useOptimizedAnimation()
  const progressPercent = Math.round(((currentStepIndex + 1) / totalSteps) * 100)

  // Aria-live region announcement for screen readers on step transition
  const [stepAnnouncement, setStepAnnouncement] = useState('')
  useEffect(() => {
    setStepAnnouncement(`Step ${currentStepIndex + 1} of ${totalSteps}: ${currentStepConfig.title}`)
  }, [currentStepIndex, totalSteps, currentStepConfig.title])

  const getChecklistItems = () => {
    // Defensive: some test setups call this component without a populated form.watch()
    // Ensure we always have an object to read from to avoid runtime errors in tests.
    const values = (() => {
      try {
        return typeof form?.watch === 'function' ? (form.watch() as Record<string, unknown> ?? {}) : {}
      } catch {
        return {}
      }
    })()
    switch (currentStepIndex) {
      case 0:
        return [
          { label: 'Program selected', completed: !!values.program },
          { label: 'Intake selected', completed: !!values.intake },
          { label: 'Personal details complete', completed: !!(values.full_name && values.date_of_birth && values.sex) },
          { label: 'Contact information provided', completed: !!(values.phone && values.email) },
          { label: 'Address details added', completed: !!values.residence_town }
        ]
      case 1:
        return [
          { label: `${selectedGrades.length} subjects added (min 5)`, completed: selectedGrades.length >= 5 },
          { label: 'Result slip uploaded', completed: !!resultSlipFile || !!uploadedFiles.result_slip }
        ]
      case 2:
        return values.payment_option === 'pay_later'
          ? [
              { label: 'Pay later selected', completed: true },
              { label: 'Payment will be completed from the dashboard', completed: true }
            ]
          : [
              { label: 'Payment method selected', completed: !!values.payment_method },
              { label: 'Payment reference provided', completed: !!(values.momo_ref) },
              { label: 'Proof of payment uploaded', completed: !!popFile || !!uploadedFiles.proof_of_payment }
            ]
      case 3:
        return [
          { label: 'Application reviewed', completed: true },
          { label: 'Terms accepted', completed: confirmSubmission }
        ]
      default:
        return []
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    if (success) {
      return
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !loading && !uploading) {
        if (e.key === 'ArrowRight' && !isLastStep) {
          e.preventDefault()
          handleNextStep()
        } else if (e.key === 'ArrowLeft' && currentStepIndex > 0) {
          e.preventDefault()
          handlePrevStep()
        } else if (e.key === 's') {
          e.preventDefault()
          saveDraft()
        }
      }
      if (e.key === 'Escape') {
        setError('')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentStepIndex, isLastStep, loading, uploading, success, handleNextStep, handlePrevStep, saveDraft, setError])

  if (authLoading || restoringDraft) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <LoadingSpinner />
          <p className="mt-4 text-foreground font-medium">
            {authLoading ? 'Loading application...' : 'Restoring your saved progress...'}
          </p>
          {restoringDraft && (
            <p className="mt-2 text-sm text-info-strong">
              We found a saved draft of your application
            </p>
          )}
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-foreground dark:text-gray-200 mb-3">
              Taking longer than expected?
            </p>
            <Button
              onClick={() => window.location.assign(window.location.pathname)}
              variant="outline"
              size="sm"
              className="w-full"
            >
              Refresh Page
            </Button>
            <p className="text-xs text-caption mt-2">
              Please check your internet connection
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (!user) return null

  if (success && submittedApplication) {
    return (
      <SubmissionSuccess
        submittedApplication={submittedApplication}
        persistingSlip={persistingSlip}
        slipLoading={slipLoading}
        emailLoading={emailLoading}
        onDownload={handleDownloadSlip}
        onEmail={handleEmailSlip}
        onDismissSlipProgress={dismissSlipProgress}
      />
    )
  }

  const handleAddGrade = () => {
    setError('')
    addGrade()
  }

  const handleRemoveGrade = (index: number) => {
    setError('')
    removeGrade(index)
  }

  const handleUpdateGrade = (index: number, field: keyof SubjectGrade, value: string | number) => {
    setError('')
    updateGrade(index, field, value)
  }

  const handleGetUsedSubjects = () => getUsedSubjects()


  return (
    <main
      id="application-wizard-content"
      className={`min-h-screen bg-gradient-to-br from-background via-background to-primary/5 ${shouldAnimate ? "animate-fade-in" : ""}`}
    >
      {/* Visually hidden aria-live region for screen reader step announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {stepAnnouncement}
      </div>
      <div className="w-full">
        <Container size="md" className="py-4 sm:py-8">
          <div className="mb-8">
            <Link
              to="/student/dashboard"
              className="mb-4 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-2 text-sm font-medium text-primary shadow-sm transition-colors hover:bg-primary/5"
            >
              <ArrowLeft style={{ width: 'var(--icon-size-sm)', height: 'var(--icon-size-sm)', marginRight: '0.5rem' }} />
              Back to Dashboard
            </Link>
            <div className={shouldAnimate ? 'animate-slide-up' : ''}>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground mb-2">Student Application</h1>
                <p className="text-foreground">Complete the {totalSteps}-step application process</p>
            </div>
            
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-caption">
              <span className="break-all">Logged in as: {user.email}</span>
              <span className="hidden sm:inline text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                {WIZARD_COPY.keyboardNavigationTip}
              </span>
            </div>
          </div>
        </Container>

        <Container size="md" className="mb-6 lg:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex-1">
              <h2 className="text-base sm:text-lg font-semibold text-foreground">
                {currentStepConfig.title}
              </h2>
              <p className="text-sm text-caption mt-1">
                {currentStepConfig.description}
              </p>
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-2">
                  <div
                    className="flex-1 overflow-hidden rounded-full bg-border"
                    role="progressbar"
                    aria-label="Application progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progressPercent}
                  >
                    <div
                      className="h-2 bg-gradient-to-r from-primary to-success transition-all duration-500 ease-out"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-xs font-medium text-caption whitespace-nowrap">
                      {progressPercent}%
                    </span>
                    <span className="text-xs text-caption whitespace-nowrap hidden sm:block">
                      {formattedTime}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    {stepValidation.isValid ? (
                      <CheckCircle className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <div className="h-3.5 w-3.5 rounded-full border-2 border-muted-foreground" />
                    )}
                    <span className={`font-medium ${
                      stepValidation.isValid ? 'text-success' : 'text-muted-foreground'
                    }`}>
                      {stepValidation.completedFields}/{stepValidation.totalFields} fields completed
                    </span>
                  </div>
                  {!stepValidation.isValid && stepValidation.missingFields.length > 0 && (
                    <span className="text-caption">
                      {WIZARD_COPY.missingFieldsPrefix} {stepValidation.missingFields.slice(0, 2).join(', ')}
                      {stepValidation.missingFields.length > 2 && ` +${stepValidation.missingFields.length - 2} more`}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Enhanced save status indicator */}
              <div className="hidden sm:block">
                <SaveStatusIndicator
                  status={smartAutoSave.saveStatus}
                  lastSaved={smartAutoSave.lastSaved}
                  saveError={smartAutoSave.saveError}
                  isOnline={smartAutoSave.isOnline}
                  saveAttempts={smartAutoSave.saveAttempts}
                  timeUntilNextSave={smartAutoSave.timeUntilNextSave}
                  saveQueue={smartAutoSave.saveQueue}
                  onForceSave={smartAutoSave.forceSave}
                  onResolveConflict={smartAutoSave.resolveConflict}
                />
              </div>
              
              {/* Compact version for mobile */}
              <div className="sm:hidden">
                <CompactSaveStatusIndicator
                  status={smartAutoSave.saveStatus}
                  isOnline={smartAutoSave.isOnline}
                  saveQueue={smartAutoSave.saveQueue}
                  onForceSave={smartAutoSave.forceSave}
                />
              </div>
              
              {/* Legacy changed fields indicator */}
              {smartAutoSave.changedFields.length > 0 && smartAutoSave.saveStatus !== 'saving' && (
                <span className="hidden text-xs font-medium text-warning md:inline">
                  {smartAutoSave.changedFields.length} unsaved change{smartAutoSave.changedFields.length > 1 ? 's' : ''}
                </span>
              )}
              
              <Button 
                type="button" 
                variant="ghost" 
                size="sm" 
                onClick={smartAutoSave.forceSave} 
                disabled={smartAutoSave.isSaving} 
                className="hover:bg-primary/10"
                aria-label={saveNowLabel}
              >
                <Send className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{saveNowLabel}</span>
              </Button>
            </div>
          </div>

          <div className="relative">
            {/* Enhanced Progress Indicator - Requirements 7.1, 7.2 */}
            <EnhancedProgressIndicator
              steps={wizardSteps}
              currentStepIndex={currentStepIndex}
              onStepClick={(stepIndex) => {
                // Navigate back to the clicked step
                const stepsToGoBack = currentStepIndex - stepIndex;
                for (let i = 0; i < stepsToGoBack; i++) {
                  handlePrevStep();
                }
              }}
            />
          </div>
        </Container>

        <Container size="md">

        {error && (
          <Alert variant="error" className="mb-6 animate-slide-up">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <AlertTitle className="text-foreground">Something needs attention</AlertTitle>
                <AlertDescription className="mt-1 text-foreground">{error}</AlertDescription>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setError('')}>
                Dismiss
              </Button>
            </div>
          </Alert>
        )}

        {!stepValidation.isValid && !isLastStep && stepValidation.completedFields > 0 && (
          <Alert variant="warning" className="mb-6 animate-slide-up">
            <div className="flex-1">
              <AlertTitle className="text-foreground">This step is still incomplete</AlertTitle>
              <AlertDescription className="mt-1 text-foreground">
                You can continue, but finishing these items now usually reduces rework during admissions review.
              </AlertDescription>
              {stepValidation.missingFields.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                  {stepValidation.missingFields.map((field, idx) => (
                    <li key={idx}>{field}</li>
                  ))}
                </ul>
              )}
            </div>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          <div className="lg:col-span-2">
            <form onSubmit={form.handleSubmit(handleSubmitApplication)} className="space-y-6 lg:space-y-8">
            {currentStepConfig.key === 'basicKyc' && (
              <BasicKycStep
                form={form}
                hasAutoPopulatedData={hasAutoPopulatedData}
                completionPercentage={completionPercentage}
                missingFields={missingFields}
                selectedProgram={selectedProgram}
                programs={programs}
                intakes={intakes}
                title={currentStepConfig.title}
              />
            )}

            {currentStepConfig.key === 'education' && (
              <EducationStep
                title={currentStepConfig.title}
                subjects={subjects}
                selectedProgram={selectedProgramDetails?.name}
                selectedGrades={selectedGrades}
                eligibilityCheck={eligibilityCheck}
                recommendedSubjects={recommendedSubjects}
                resultSlipFile={resultSlipFile}
                extraKycFile={extraKycFile}
                uploadProgress={uploadProgress}
                uploadedFiles={uploadedFiles}
                addGrade={handleAddGrade}
                removeGrade={handleRemoveGrade}
                updateGrade={handleUpdateGrade}
                getUsedSubjects={handleGetUsedSubjects}
                handleResultSlipUpload={handleResultSlipUpload}
                handleExtraKycUpload={handleExtraKycUpload}
              />
            )}

            {currentStepConfig.key === 'payment' && (
              <PaymentStep
                title={currentStepConfig.title}
                form={form}
                getPaymentTarget={async () => getPaymentTarget()}
                handleProofOfPaymentUpload={handleProofOfPaymentUpload}
                proofOfPaymentFile={popFile}
                uploadProgress={uploadProgress}
                uploadedFiles={uploadedFiles}
              />
            )}

            {currentStepConfig.key === 'submit' && (
              <SubmitStep
                title={currentStepConfig.title}
                form={form}
                subjects={subjects}
                selectedGrades={selectedGrades}
                eligibilityCheck={eligibilityCheck}
                resultSlipFile={resultSlipFile}
                extraKycFile={extraKycFile}
                proofOfPaymentFile={popFile}
                confirmSubmission={confirmSubmission}
                onConfirmChange={setConfirmSubmission}
                selectedProgramName={selectedProgramDetails?.name}
                selectedInstitutionLabel={
                  selectedProgramDetails?.institutions?.full_name ||
                  selectedProgramDetails?.institutions?.name ||
                  undefined
                }
              />
            )}

              <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-6 border-t border-border animate-fade-in">
            <div className="order-2 sm:order-1">
              {currentStepIndex > 0 && (
                <div className="transition-transform duration-150 hover:scale-105 active:scale-95">
                  <Button type="button" variant="outline" onClick={handlePrevStep} className="w-full sm:w-auto" disabled={loading || uploading} aria-label={`Go back to ${wizardSteps[currentStepIndex - 1]?.progressTitle || 'previous step'}`}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    {previousButtonLabel}
                  </Button>
                </div>
              )}
            </div>

            <div className="order-1 sm:order-2">
              {!isLastStep ? (
                <div className="transition-transform duration-150 hover:scale-105 active:scale-95">
                  <Button type="button" variant="primary" onClick={handleNextStep} loading={loading || uploading} disabled={loading || uploading} className="w-full sm:w-auto" aria-label={`Continue to ${wizardSteps[currentStepIndex + 1]?.progressTitle || 'next step'}`}>
                    {loading || uploading ? 'Processing...' : (<><span>Next Step</span><ArrowRight className="h-4 w-4 ml-2" /></>)}
                  </Button>
                </div>
              ) : (
                <div className="transition-transform duration-150 hover:scale-105 active:scale-95">
                  <Button type="submit" variant="success" loading={loading} disabled={loading || !confirmSubmission} className="w-full sm:w-auto">
                    {loading ? 'Submitting...' : (<><Send className="h-4 w-4 mr-2" />Submit Application</>)}
                  </Button>
                </div>
              )}
              </div>
              </div>
            </form>
          </div>

          <aside className="lg:col-span-1" aria-labelledby="wizard-support-heading">
            <div className="sticky top-6 space-y-4">
              <ApplicationPreview
                form={form}
                programName={selectedProgramDetails?.name}
                intakeName={form.watch('intake')}
              />
              
              <StepChecklist items={getChecklistItems()} />
              
              <ReminderSettings
                email={form.watch('email') || user?.email || ''}
                fullName={form.watch('full_name') || ''}
                draftName="Current Application"
              />
              
              <AnalyticsDashboard
                userId={user?.id}
                completionPercentage={overallProgress.percentage}
                hasLocalDraft={
                  overallProgress.completedFields > 0 ||
                  currentStepIndex > 0 ||
                  Boolean(smartAutoSave.lastSaved) ||
                  isDraftSaving ||
                  draftSaved
                }
                lastSavedAt={smartAutoSave.lastSaved}
              />
              
              <SectionCard
                title={WIZARD_COPY.quickTipsTitle}
                className={shouldAnimate ? 'animate-fade-in' : ''}
                padding="sm"
              >
                <h3 id="wizard-support-heading" className="sr-only">Application support tools</h3>
                <ul className="space-y-2 text-xs text-foreground">
                  {currentStepIndex === 0 && (
                    <>
                      {WIZARD_COPY.quickTipsByStep.basicKyc.map((tip) => (
                        <li key={tip}>• {tip}</li>
                      ))}
                    </>
                  )}
                  {currentStepIndex === 1 && (
                    <>
                      {WIZARD_COPY.quickTipsByStep.education.map((tip) => (
                        <li key={tip}>• {tip}</li>
                      ))}
                    </>
                  )}
                  {currentStepIndex === 2 && (
                    <>
                      {WIZARD_COPY.quickTipsByStep.payment.map((tip) => (
                        <li key={tip}>• {tip}</li>
                      ))}
                    </>
                  )}
                  {currentStepIndex === 3 && (
                    <>
                      {WIZARD_COPY.quickTipsByStep.submit.map((tip) => (
                        <li key={tip}>• {tip}</li>
                      ))}
                    </>
                  )}
                </ul>
              </SectionCard>
            </div>
          </aside>
        </div>
        </Container>
      </div>
      
      <KeyboardShortcutsHelp />
      
      <DraftManager
        userId={user?.id}
        currentDraftId={undefined}
        onLoadDraft={(draftData) => {
          Object.keys(draftData).forEach(key => {
            if (draftData[key] !== undefined && draftData[key] !== null) {
              // form is typed via useWizardController (@ts-nocheck); key is a runtime
              // string from draft data so we cast to the expected path type here.
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              form.setValue(key as Parameters<typeof form.setValue>[0], draftData[key])
            }
          })
        }}
        onCreateNew={() => {
          form.reset()
          setError('')
        }}
      />
    </main>
  )
}

const ApplicationWizard = () => (
  <SimpleErrorBoundary>
    <ApplicationWizardContent />
  </SimpleErrorBoundary>
)

export default ApplicationWizard
