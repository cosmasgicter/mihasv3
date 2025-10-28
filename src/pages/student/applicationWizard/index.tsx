import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, ArrowRight, CheckCircle, Send, Info } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useEffect } from 'react'

import { AIAssistant } from '@/components/application/AIAssistant'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { SimpleErrorBoundary } from '@/components/ui/SimpleErrorBoundary'

import SubmissionSuccess from './components/SubmissionSuccess'
import { StepChecklist } from './components/StepChecklist'
import { ApplicationPreview } from './components/ApplicationPreview'
import { KeyboardShortcutsHelp } from './components/KeyboardShortcutsHelp'
import { DraftManager } from './components/DraftManager'
import { ReminderSettings } from './components/ReminderSettings'
import { AnalyticsDashboard } from './components/AnalyticsDashboard'
import BasicKycStep from './steps/BasicKycStep'
import EducationStep from './steps/EducationStep'
import PaymentStep from './steps/PaymentStep'
import SubmitStep from './steps/SubmitStep'
import useWizardController from './hooks/useWizardController'
import { useStepValidation } from './hooks/useStepValidation'
import { useSmartAutoSave } from './hooks/useSmartAutoSave'
import { useEstimatedTime } from './hooks/useEstimatedTime'
import { useAnalytics } from './hooks/useAnalytics'
import { previousButtonLabel, saveNowLabel, wizardSteps } from './steps/config'
import type { SubjectGrade } from './types'

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
    confirmSubmission,
    setConfirmSubmission,
    resultSlipFile,
    extraKycFile,
    popFile,
    uploadProgress,
    uploadedFiles,
    isDraftSaving,
    draftSaved,
    submittedApplication,
    persistingSlip,
    slipLoading,
    emailLoading,
    handleDownloadSlip,
    handleEmailSlip,
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
  const { lastSaved, changedFields, timeSinceLastSave } = useSmartAutoSave({
    onSave: saveDraft,
    watchValues,
    enabled: !loading && !uploading
  })
  const { formattedTime } = useEstimatedTime(currentStepIndex, totalSteps)
  useAnalytics(user?.id, null, currentStepIndex, currentStepConfig.key)
  const prefersReducedMotion = useReducedMotion()

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
        return [
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
  }, [currentStepIndex, isLastStep, loading, uploading, handleNextStep, handlePrevStep, saveDraft, setError])

  if (authLoading || restoringDraft) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <LoadingSpinner />
          <p className="mt-4 text-gray-900 font-medium">
            {authLoading ? 'Loading application...' : 'Restoring your saved progress...'}
          </p>
          {restoringDraft && (
            <p className="mt-2 text-sm text-info-strong">
              We found a saved draft of your application
            </p>
          )}
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-gray-800 dark:text-gray-200 mb-3">
              Taking longer than expected?
            </p>
            <Button
              onClick={() => window.location.reload()}
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

  const MaybeMotionDiv: any = prefersReducedMotion ? (props: any) => <div {...props} /> : motion.div

  return (
    <MaybeMotionDiv className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.36 }}>
      <div className="w-full">
        <Container size="md" className="py-8">
          <div className="mb-8">
            <Link to="/student/dashboard" className="inline-flex items-center text-primary hover:text-primary mb-4">
              <ArrowLeft style={{ width: 'var(--icon-size-sm)', height: 'var(--icon-size-sm)', marginRight: '0.5rem' }} />
              Back to Dashboard
            </Link>
            {prefersReducedMotion ? (
              <div>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-2">Student Application</h1>
                <p className="text-gray-900">Complete the {totalSteps}-step application process</p>
              </div>
            ) : (
              <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-2">Student Application</h1>
                <p className="text-gray-900">Complete the {totalSteps}-step application process</p>
              </motion.div>
            )}
            
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-caption">
              <span className="break-all">Logged in as: {user.email}</span>
              <span className="hidden sm:inline text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                Tip: Use Ctrl+→/← to navigate steps
              </span>
            </div>
          </div>
        </Container>

        <Container size="md" className="mb-6 lg:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex-1">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                {currentStepConfig.title}
              </h2>
              <p className="text-sm text-caption mt-1">
                {currentStepConfig.description}
              </p>
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-border rounded-full h-2 overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-primary to-success"
                      initial={{ width: 0 }}
                      animate={{ width: `${((currentStepIndex + 1) / totalSteps) * 100}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-xs font-medium text-caption whitespace-nowrap">
                      {Math.round(((currentStepIndex + 1) / totalSteps) * 100)}%
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
                      • Missing: {stepValidation.missingFields.slice(0, 2).join(', ')}
                      {stepValidation.missingFields.length > 2 && ` +${stepValidation.missingFields.length - 2} more`}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {isDraftSaving && (
                <motion.div className="flex items-center gap-2 text-sm text-primary" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                  <span className="hidden sm:inline">Saving...</span>
                </motion.div>
              )}
              {!isDraftSaving && (draftSaved || lastSaved) && (
                <motion.div className="flex flex-col items-end gap-0.5" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
                  <div className="flex items-center gap-1.5 text-sm text-success">
                    <CheckCircle className="h-4 w-4" />
                    <span className="hidden sm:inline">Saved</span>
                  </div>
                  {timeSinceLastSave && (
                    <span className="text-xs text-caption hidden sm:inline">{timeSinceLastSave}</span>
                  )}
                </motion.div>
              )}
              {changedFields.length > 0 && !isDraftSaving && (
                <span className="text-xs text-warning hidden md:inline">
                  {changedFields.length} unsaved change{changedFields.length > 1 ? 's' : ''}
                </span>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={saveDraft} disabled={isDraftSaving} className="hover:bg-primary/10">
                <Send className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{saveNowLabel}</span>
              </Button>
            </div>
          </div>

          <div className="relative">
            {/* Desktop: Horizontal with connecting line */}
            <div className="hidden md:block">
              <div className="absolute top-5 left-0 w-full h-0.5 bg-border" />
              <div className="flex items-start justify-between relative">
                {wizardSteps.map((step, index) => {
                  const Icon = step.icon
                  const isActive = index <= currentStepIndex
                  const isCompleted = index < currentStepIndex
                  const isCurrent = index === currentStepIndex
                  return (
                    <motion.button
                      key={step.id}
                      type="button"
                      onClick={() => isCompleted && handlePrevStep && currentStepIndex > index && Array.from({ length: currentStepIndex - index }).forEach(() => handlePrevStep())}
                      disabled={!isCompleted}
                      className={`flex flex-col items-center relative flex-1 group ${
                        isCompleted ? 'cursor-pointer' : 'cursor-default'
                      }`}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: step.id * 0.1 }}
                      whileHover={isCompleted ? { scale: 1.02 } : {}}
                      aria-label={`Step ${step.id}: ${step.progressTitle}`}
                      aria-current={isCurrent ? 'step' : undefined}
                    >
                      <motion.div
                          className={`rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all duration-300 z-10 ${
                          isCompleted
                            ? 'bg-success border-success text-white shadow-md'
                            : isCurrent
                            ? 'bg-primary border-primary text-white shadow-lg ring-4 ring-primary/20'
                            : 'bg-background border-border text-muted-foreground'
                        }`}
                        style={{ width: 'var(--touch-target)', height: 'var(--touch-target)' }}>
                          {isCompleted ? <CheckCircle style={{ width: 'var(--icon-size)', height: 'var(--icon-size)' }} /> : <Icon style={{ width: 'var(--icon-size)', height: 'var(--icon-size)' }} />}
                        </motion.div>
                      <div className={`mt-3 text-xs font-medium text-center leading-tight max-w-[100px] ${
                        isCurrent ? 'text-primary font-semibold' : isActive ? 'text-foreground' : 'text-muted-foreground'
                      }`}>
                        {step.progressTitle}
                      </div>
                      {isCompleted && (
                        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-primary whitespace-nowrap">
                          Click to return
                        </div>
                      )}
                    </motion.button>
                  )
                })}
              </div>
            </div>

            {/* Mobile: Vertical stepper */}
            <div className="md:hidden space-y-3">
              {wizardSteps.map((step, index) => {
                const Icon = step.icon
                const isActive = index <= currentStepIndex
                const isCompleted = index < currentStepIndex
                const isCurrent = index === currentStepIndex
                return (
                  <motion.div
                    key={step.id}
                    className="flex items-center gap-3"
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: step.id * 0.1 }}
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold border-2 flex-shrink-0 ${
                        isCompleted
                          ? 'bg-success border-success text-white'
                          : isCurrent
                          ? 'bg-primary border-primary text-white ring-4 ring-primary/20'
                          : 'bg-background border-border text-muted-foreground'
                      }`}
                    >
                      {isCompleted ? <CheckCircle className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-semibold ${
                        isCurrent ? 'text-primary' : isActive ? 'text-foreground' : 'text-muted-foreground'
                      }`}>
                        {step.progressTitle}
                      </div>
                      <div className="text-xs text-caption mt-0.5">
                        Step {step.id} of {wizardSteps.length}
                      </div>
                    </div>
                    {isCompleted && (
                      <CheckCircle className="h-5 w-5 text-success flex-shrink-0" />
                    )}
                  </motion.div>
                )
              })}
            </div>
          </div>
        </Container>

        <Container size="md">

        {error && (
          <motion.div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 mb-6" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-destructive" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-sm font-medium text-destructive">Error</h3>
                <div className="text-sm text-gray-900 mt-1">{error}</div>
                <button
                  type="button"
                  onClick={() => setError('')}
                  className="mt-2 text-xs text-destructive hover:text-destructive/80 underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {!stepValidation.isValid && !isLastStep && stepValidation.completedFields > 0 && (
          <motion.div className="rounded-md bg-warning/10 border border-warning/30 p-4 mb-6" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-start">
              <Info className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
              <div className="ml-3 flex-1">
                <h3 className="text-sm font-medium text-warning">Incomplete Step</h3>
                <div className="text-sm text-gray-900 mt-1">
                  You can proceed, but we recommend completing all fields for a better application.
                </div>
                {stepValidation.missingFields.length > 0 && (
                  <ul className="mt-2 text-xs text-caption list-disc list-inside space-y-1">
                    {stepValidation.missingFields.map((field, idx) => (
                      <li key={idx}>{field}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          <div className="lg:col-span-2">
            <form onSubmit={form.handleSubmit(handleSubmitApplication)} className="space-y-6 lg:space-y-8">
              <AnimatePresence mode="wait">
            {currentStepConfig.key === 'basicKyc' && (
              <BasicKycStep
                form={form}
                hasAutoPopulatedData={hasAutoPopulatedData}
                completionPercentage={completionPercentage}
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
              </AnimatePresence>

              <motion.div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-6 border-t border-border" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <div className="order-2 sm:order-1">
              {currentStepIndex > 0 && (
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button type="button" variant="outline" onClick={handlePrevStep} className="w-full sm:w-auto" disabled={loading || uploading}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    {previousButtonLabel}
                  </Button>
                </motion.div>
              )}
            </div>

            <div className="order-1 sm:order-2">
              {!isLastStep ? (
                <motion.div whileHover={{ scale: loading || uploading ? 1 : 1.05 }} whileTap={{ scale: loading || uploading ? 1 : 0.95 }}>
                  <Button type="button" onClick={handleNextStep} loading={loading || uploading} disabled={loading || uploading} className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed">
                    {loading || uploading ? 'Processing...' : (<><span>Next Step</span><ArrowRight className="h-4 w-4 ml-2" /></>)}
                  </Button>
                </motion.div>
              ) : (
                <motion.div whileHover={{ scale: loading ? 1 : 1.05 }} whileTap={{ scale: loading ? 1 : 0.95 }}>
                  <Button type="submit" loading={loading} disabled={loading || !confirmSubmission} className="w-full sm:w-auto bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                    {loading ? 'Submitting...' : (<><Send className="h-4 w-4 mr-2" />Submit Application</>)}
                  </Button>
                </motion.div>
              )}
              </div>
              </motion.div>
            </form>
          </div>

          <div className="lg:col-span-1">
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
              
              <AnalyticsDashboard userId={user?.id} />
              
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-primary/5 border border-primary/20 rounded-lg p-4"
              >
                <h3 className="text-sm font-semibold text-primary mb-2">💡 Quick Tips</h3>
                <ul className="text-xs text-gray-900 space-y-2">
                  {currentStepIndex === 0 && (
                    <>
                      <li>• Ensure your contact details are accurate</li>
                      <li>• Double-check your NRC/Passport number</li>
                      <li>• Select the correct intake period</li>
                    </>
                  )}
                  {currentStepIndex === 1 && (
                    <>
                      <li>• Enter at least 5 subject grades</li>
                      <li>• Upload a clear scan of your result slip</li>
                      <li>• Ensure grades match your certificate</li>
                    </>
                  )}
                  {currentStepIndex === 2 && (
                    <>
                      <li>• Keep your payment reference handy</li>
                      <li>• Upload proof of payment (receipt/screenshot)</li>
                      <li>• Ensure payment details are correct</li>
                    </>
                  )}
                  {currentStepIndex === 3 && (
                    <>
                      <li>• Review all information carefully</li>
                      <li>• Ensure all documents are uploaded</li>
                      <li>• Accept terms to submit application</li>
                    </>
                  )}
                </ul>
              </motion.div>
            </div>
          </div>
        </div>
        </Container>
      </div>

      <AIAssistant
        applicationData={watchValues()}
        currentStep={currentStepIndex + 1}
        onSuggestionApply={suggestion => {
        }}
      />
      
      <KeyboardShortcutsHelp />
      
      <DraftManager
        userId={user?.id}
        currentDraftId={undefined}
        onLoadDraft={(draftData) => {
          Object.keys(draftData).forEach(key => {
            if (draftData[key] !== undefined && draftData[key] !== null) {
              form.setValue(key as any, draftData[key])
            }
          })
        }}
        onCreateNew={() => {
          form.reset()
          setError('')
        }}
      />
    </MaybeMotionDiv>
  )
}

const ApplicationWizard = () => (
  <SimpleErrorBoundary>
    <ApplicationWizardContent />
  </SimpleErrorBoundary>
)

export default ApplicationWizard
