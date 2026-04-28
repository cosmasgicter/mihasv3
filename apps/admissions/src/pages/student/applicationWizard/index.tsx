import { ArrowLeft, ArrowRight, CheckCircle, Send } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useEffect, useState, useRef, useCallback, useSyncExternalStore } from 'react'
import { Seo } from '@/components/seo/Seo'

import { useOptimizedAnimation } from '@/hooks/useOptimizedAnimation'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { WizardSkeleton } from '@/components/ui'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { AutoSaveIndicator } from '@/components/ui/AutoSaveIndicator'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert'
import { SectionCard } from '@/components/ui/SectionCard'
import { PageShell } from '@/components/ui/PageShell'

import SubmissionSuccess from './components/SubmissionSuccess'
import { StepChecklist } from './components/StepChecklist'
import { ApplicationPreview } from './components/ApplicationPreview'
import { KeyboardShortcutsHelp } from './components/KeyboardShortcutsHelp'
import { DraftManager } from './components/DraftManager'
import { AnalyticsDashboard } from './components/AnalyticsDashboard'
import { EnhancedProgressIndicator } from './components/EnhancedProgressIndicator'
import { WizardErrorSummary, type WizardValidationError } from './components/WizardErrorSummary'
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
import type { StepKey } from './steps/config'
import type { SubjectGrade } from './types'
import { WIZARD_COPY } from './constants'

// --- Lightweight online/offline hook ---
const onlineSubscribe = (cb: () => void) => {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb) }
}
const getOnlineSnapshot = () => navigator.onLine
const useIsOnline = () => useSyncExternalStore(onlineSubscribe, getOnlineSnapshot, () => true)

// --- Detect mobile keyboard open via visualViewport ---
function useKeyboardOpen() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const initialHeight = vv.height
    const threshold = 150 // keyboard typically shrinks viewport by 150px+
    const onResize = () => setOpen(initialHeight - vv.height > threshold)
    vv.addEventListener('resize', onResize)
    return () => vv.removeEventListener('resize', onResize)
  }, [])
  return open
}

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
    programsLoading,
    intakes,
    subjects,
    hasAutoPopulatedData,
    completionPercentage,
    missingFields,
    confirmSubmission,
    setConfirmSubmission,
    resultSlipFile,
    extraKycFile,
    uploadProgress,
    uploadStates,
    uploadedFiles,
    wizardReadiness,
    isDraftSaving,
    draftSaved,
    draftLoaded,
    gradesHydrating,
    submittedApplication,
    applicationId,
    paymentStatus,
    ocrStatus,
    ocrExtractedCount,
    ocrFailureReason,
    retryOcr,
    persistingSlip,
    slipLoading,
    emailLoading,
    handleDownloadSlip,
    handleEmailSlip,
    dismissSlipProgress,
    handleResultSlipUpload,
    handleExtraKycUpload,
    handleLoadDraft,
    handleNextStep,
    handlePrevStep,
    handleSubmitApplication,
    addGrade,
    removeGrade,
    updateGrade,
    getUsedSubjects,
    saveDraft,
    watchValues,
    goToStep,
    refetchPaymentStatus,
    setPaymentStatus
  } = useWizardController()

  const stepValidation = useStepValidation(form, currentStepIndex, {
    paymentStatus,
    confirmSubmission,
    selectedGrades,
    hasResultSlip: Boolean(resultSlipFile || uploadedFiles.result_slip),
    hasIdentityDocument: Boolean(extraKycFile || uploadedFiles.extra_kyc),
    uploading,
  })
  const overallProgress = useOverallProgress(form, {
    selectedGrades,
    uploadedFiles,
    hasResultSlipFile: Boolean(resultSlipFile),
    hasIdentityFile: Boolean(extraKycFile),
    paymentStatus,
    confirmSubmission,
  })
  const { formattedTime } = useEstimatedTime(currentStepIndex, totalSteps)
  const { shouldAnimate } = useOptimizedAnimation()
  const isOnline = useIsOnline()
  const keyboardOpen = useKeyboardOpen()

  // Pause auto-save during critical operations (Req 9.1, 9.2):
  // - Payment step with payment in progress (initiating or pending)
  // - Submission processing (loading flag)
  const isPaymentStepActive = currentStepConfig.key === 'payment'
  const isPaymentInProgress = isPaymentStepActive && (paymentStatus === 'pending')
  const isUploadBlocking = false // Uploads run in background — never block navigation
  const nextButtonLabel = loading
    ? 'Saving step...'
    : isUploadBlocking
      ? 'Finishing uploads...'
      : 'Next Step'
  const saveWizardDraft = useCallback(
    () => saveDraft({ syncServer: true }),
    [saveDraft]
  )
  const smartAutoSave = useSmartAutoSave({
    onSave: saveWizardDraft,
    watchValues,
    enabled: draftLoaded && !loading && !uploading && !restoringDraft && !success && !isPaymentInProgress
  })

  const progressPercent = overallProgress.percentage
  const currentStepReadiness = wizardReadiness.stepProgressByKey[currentStepConfig.key]
  const paymentChecklistLabel = paymentStatus === 'deferred'
    ? 'Payment deferred for later'
    : paymentStatus === 'successful'
      ? 'Payment processed via Lenco gateway'
      : 'Payment action completed'
  const submitPaymentChecklistLabel = paymentStatus === 'deferred'
    ? 'Payment deferred and still outstanding'
    : paymentStatus === 'successful'
      ? 'Payment confirmed'
      : 'Payment not yet resolved'

  // Structured validation errors for the error summary (Req 5.2, 5.3)
  const [validationErrors, setValidationErrors] = useState<WizardValidationError[]>([])

  /**
   * Collect all validation errors for the current step based on form state
   * and step-specific required fields. Returns structured errors for the summary.
   */
  const collectStepValidationErrors = useCallback((): WizardValidationError[] => {
    const formData = form.watch()
    const errors: WizardValidationError[] = []

    if (currentStepConfig.key === 'basicKyc') {
      const fieldChecks: Array<{ field: string; label: string; check: () => boolean; message: string }> = [
        { field: 'program', label: 'Program', check: () => !!formData.program, message: 'Please select a program' },
        { field: 'intake', label: 'Intake', check: () => !!formData.intake, message: 'Please select an intake' },
        { field: 'full_name', label: 'Full Name', check: () => !!formData.full_name, message: 'Full name is required' },
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
        errors.push({ field: 'nrc_number', label: 'NRC or Passport', message: 'Either NRC or Passport number is required' })
      }
    }

    if (currentStepConfig.key === 'education') {
      if (!gradesHydrating) {
        const gradeCount = selectedGrades.filter(
          grade => grade.subject_id && Number(grade.grade) >= 1 && Number(grade.grade) <= 9
        ).length
        if (gradeCount < 5) {
          errors.push({ field: 'grades', label: 'Subject Grades', message: `Minimum 5 subjects required (${gradeCount} added)` })
        }
      }
      if (!resultSlipFile && !uploadedFiles.result_slip) {
        errors.push({ field: 'result_slip', label: 'Result Slip', message: 'Result slip is required' })
      }
      if (!extraKycFile && !uploadedFiles.extra_kyc) {
        errors.push({ field: 'extra_kyc', label: 'Identity Document', message: 'An NRC or Passport document is required before proceeding' })
      }
    }

    if (currentStepConfig.key === 'payment' && paymentStatus !== 'successful' && paymentStatus !== 'deferred') {
      errors.push({ field: 'payment', label: 'Payment', message: 'Complete payment confirmation before moving to the review step' })
    }

    if (currentStepConfig.key === 'submit') {
      if (paymentStatus !== 'successful' && paymentStatus !== 'deferred') {
        errors.push({ field: 'payment', label: 'Payment', message: 'Payment must be confirmed before you can submit the application' })
      }
      if (uploading) {
        errors.push({ field: 'result_slip', label: 'Uploads', message: 'A file is still uploading. Please wait for it to finish before submitting.' })
      }
      if (!confirmSubmission) {
        errors.push({ field: 'confirmSubmission', label: 'Confirmation', message: 'Please confirm that all information is accurate' })
      }
    }

    return errors
  }, [form, currentStepConfig.key, confirmSubmission, resultSlipFile, extraKycFile, uploadedFiles, uploading, paymentStatus, selectedGrades, gradesHydrating])

  // Aria-live region announcement for screen readers on step transition (Req 14.1, 14.2, 14.3)
  const [stepAnnouncement, setStepAnnouncement] = useState(
    `Step ${currentStepIndex + 1} of ${wizardSteps.length}: ${currentStepConfig.title}`
  )
  const [stepDirection, setStepDirection] = useState<'forward' | 'backward'>('forward')
  const [stepKey, setStepKey] = useState(currentStepIndex)
  const isPopstateNavRef = useRef(false)
  const isInitialSyncRef = useRef(true)
  const stepContentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setStepKey(currentStepIndex)
    // Clear validation errors when navigating to a new step
    setValidationErrors([])
    // Focus the step content container so screen readers announce the new step
    requestAnimationFrame(() => {
      stepContentRef.current?.focus({ preventScroll: false })
    })
  }, [currentStepIndex, totalSteps, currentStepConfig.title])

  // Browser back/forward navigation support (Req 11.2, 11.3)
  // Push history state when step changes (but not on popstate-driven changes)
  useEffect(() => {
    if (success) return
    if (restoringDraft) return
    if (isPopstateNavRef.current) {
      isPopstateNavRef.current = false
      return
    }
    const url = new URL(window.location.href)
    url.searchParams.set('step', currentStepConfig.key)
    if (isInitialSyncRef.current) {
      isInitialSyncRef.current = false
      window.history.replaceState({ wizardStep: currentStepIndex }, '', url.toString())
    } else {
      window.history.pushState({ wizardStep: currentStepIndex }, '', url.toString())
    }
  }, [currentStepIndex, currentStepConfig.key, success, restoringDraft])

  // Listen for popstate (browser back/forward)
  useEffect(() => {
    if (success) return

    const handlePopState = (event: PopStateEvent) => {
      const state = event.state as { wizardStep?: number } | null
      if (state && typeof state.wizardStep === 'number') {
        isPopstateNavRef.current = true
        goToStep(state.wizardStep)
        return
      }
      // Fallback: read step from URL
      const url = new URL(window.location.href)
      const stepParam = url.searchParams.get('step')
      if (stepParam) {
        const stepIndex = wizardSteps.findIndex(s => s.key === stepParam)
        if (stepIndex >= 0) {
          isPopstateNavRef.current = true
          goToStep(stepIndex)
        }
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [success, goToStep])

  // Track step direction for transitions
  const wrappedHandleNextStep = useCallback(() => {
    setStepDirection('forward')
    void handleNextStep()
  }, [handleNextStep])

  const wrappedHandlePrevStep = useCallback(() => {
    setStepDirection('backward')
    handlePrevStep()
  }, [handlePrevStep])

  const handleProgressStepClick = useCallback((stepIndex: number) => {
    if (stepIndex >= currentStepIndex) return
    setStepDirection('backward')
    void saveWizardDraft()
    goToStep(stepIndex)
  }, [currentStepIndex, goToStep, saveWizardDraft])

  const handleNavigateToStep = useCallback((stepKey: StepKey) => {
    const idx = wizardSteps.findIndex(s => s.key === stepKey)
    if (idx >= 0) {
      setStepDirection('backward')
      void saveWizardDraft()
      goToStep(idx)
    }
  }, [goToStep, saveWizardDraft])

  // Populate validation errors and focus first errored field on validation error (Req 5.2, 5.3)
  useEffect(() => {
    if (!error) {
      setValidationErrors([])
      return
    }
    // Collect structured errors for the summary
    const collected = collectStepValidationErrors()
    setValidationErrors(collected)

    // Small delay to let the error summary render, then focus first errored field
    const timer = setTimeout(() => {
      const firstError = collected[0]
      if (firstError) {
        const firstField = firstError.field
        const el =
          document.querySelector<HTMLElement>(`[name="${firstField}"]`) ||
          document.querySelector<HTMLElement>(`#${CSS.escape(firstField)}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.focus({ preventScroll: true })
          return
        }
      }
      // Fallback: focus any aria-invalid field
      const errorField = document.querySelector('[aria-invalid="true"]') as HTMLElement
      if (errorField) {
        errorField.scrollIntoView({ behavior: 'smooth', block: 'center' })
        errorField.focus({ preventScroll: true })
        return
      }
      // Last fallback: scroll to the error alert itself
      const errorAlert = document.querySelector('[role="alert"]') as HTMLElement
      if (errorAlert) {
        errorAlert.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 100)
    return () => clearTimeout(timer)
  }, [error, collectStepValidationErrors])

  // Focus first [aria-invalid="true"] field when validation errors appear (Req 17.1)
  useEffect(() => {
    if (validationErrors.length === 0) return
    const timer = setTimeout(() => {
      const first = document.querySelector('[aria-invalid="true"]')
      if (first instanceof HTMLElement) {
        first.scrollIntoView({ behavior: 'smooth', block: 'center' })
        first.focus({ preventScroll: true })
      }
    }, 150)
    return () => clearTimeout(timer)
  }, [validationErrors])

  /**
   * Build an aria-describedby value for a field that includes the wizard-level
   * error summary item id when the field has a validation error (Req 17.2).
   */
  const getFieldAriaDescribedBy = useCallback((fieldName: string): string | undefined => {
    const hasError = validationErrors.some(e => e.field === fieldName)
    return hasError ? `wizard-error-${fieldName}` : undefined
  }, [validationErrors])

  // Update aria-live announcement when validation errors appear on the current step (Req 14.3)
  useEffect(() => {
    const base = `Step ${currentStepIndex + 1} of ${wizardSteps.length}: ${currentStepConfig.title}`
    setStepAnnouncement(validationErrors.length > 0 ? `${base}. Validation errors found.` : base)
  }, [validationErrors, currentStepIndex, currentStepConfig.title])

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
          { label: 'Result slip uploaded', completed: !!resultSlipFile || !!uploadedFiles.result_slip },
          { label: 'Identity document uploaded (NRC or Passport)', completed: !!extraKycFile || !!uploadedFiles.extra_kyc }
        ]
      case 2:
        return [
          { label: paymentChecklistLabel, completed: paymentStatus === 'successful' || paymentStatus === 'deferred' }
        ]
      case 3:
        return [
          { label: submitPaymentChecklistLabel, completed: paymentStatus === 'successful' || paymentStatus === 'deferred' },
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
      if ((e.ctrlKey || e.metaKey) && !loading) {
        if (e.key === 'ArrowRight' && !isLastStep) {
          e.preventDefault()
          wrappedHandleNextStep()
        } else if (e.key === 'ArrowLeft' && currentStepIndex > 0) {
          e.preventDefault()
          wrappedHandlePrevStep()
        } else if (e.key === 's') {
          e.preventDefault()
          saveWizardDraft()
        }
      }
      if (e.key === 'Escape') {
        setError('')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentStepIndex, isLastStep, loading, uploading, success, wrappedHandleNextStep, wrappedHandlePrevStep, saveWizardDraft, setError])

  if (authLoading || restoringDraft) {
    return (
      <WizardSkeleton />
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
    <>
      <Seo
        title="Application Wizard | MIHAS-KATC Admissions"
        description="Complete your MIHAS-KATC admissions application step by step."
        path="/student/application-wizard"
        noindex
      />
    <PageShell
      title="Student Application"
      eyebrow="Application Flow"
      subtitle={`Complete ${totalSteps} steps with autosave, upload status, payment confirmation, and review before submission.`}
      maxWidth="full"
      tone="application"
      metrics={[
        {
          label: 'Current step',
          value: `${currentStepIndex + 1} of ${totalSteps}`,
          helper: currentStepConfig.title,
        },
        {
          label: 'Completion',
          value: `${progressPercent}%`,
          helper: currentStepReadiness.isComplete ? 'Step ready to advance' : `${currentStepReadiness.completed}/${currentStepReadiness.total} checks complete`,
        },
        {
          label: 'Estimated time',
          value: formattedTime,
          helper: 'Based on your current progress',
        },
        {
          label: 'Draft status',
          value: smartAutoSave.saveStatus === 'saved' ? 'Protected' : smartAutoSave.saveStatus === 'saving' ? 'Saving…' : 'In progress',
          helper: smartAutoSave.changedFields.length > 0 ? `${smartAutoSave.changedFields.length} unsaved field changes` : 'Autosave is active',
        },
      ]}
      className={shouldAnimate ? "animate-fade-in" : ""}
    >
      {/* Visually hidden aria-live region for screen reader step announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {stepAnnouncement}
      </div>
      {/* P1-8: Offline indicator */}
      {!isOnline && (
        <div role="alert" className="mx-auto mb-4 max-w-2xl rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-center text-sm text-warning-strong">
          You appear to be offline. Your progress is saved locally and will sync when you reconnect.
        </div>
      )}
      <div className="w-full">
        <Container size="md" className="py-4 sm:py-8">
          <div className="mb-8 space-y-4">
            <Link
              to="/student/dashboard"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-sm font-medium text-primary hover:bg-primary/5"
            >
              <ArrowLeft style={{ width: 'var(--icon-size-sm)', height: 'var(--icon-size-sm)', marginRight: '0.5rem' }} />
              Back to Dashboard
            </Link>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.8fr)]">
              <div className="glass-panel p-4 sm:p-5">
                <p className="text-xs font-semibold uppercase text-primary">Current step</p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
                  {currentStepConfig.title}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  {currentStepConfig.description}
                </p>
              </div>
              <div className="polished-panel p-4 sm:p-5">
                <p className="text-xs font-semibold uppercase text-primary">Session</p>
                <p className="mt-3 text-sm font-semibold text-slate-900 break-all">{user.email}</p>
                <div className="mt-4 h-px ambient-divider" />
                <div className="mt-4 grid gap-3 text-sm text-slate-600">
                  <div className="flex items-center justify-between gap-3">
                    <span>Autosave</span>
                    <span className="font-semibold text-slate-900">
                      {smartAutoSave.saveStatus === 'saved' ? 'Up to date' : smartAutoSave.saveStatus === 'saving' ? 'Saving' : 'Monitoring'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Ready checks</span>
                    <span className="font-semibold text-slate-900">
                      {currentStepReadiness.completed}/{currentStepReadiness.total}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Container>

        <Container size="md" className="mb-6 lg:mb-8">
          <div className="glass-panel p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex-1">
              <h2 className="text-base sm:text-lg font-semibold text-foreground">
                {currentStepConfig.title}
              </h2>
              <p className="text-sm text-foreground/80 mt-1">
                {currentStepConfig.description}
              </p>
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-2">
                  <div
                    className="flex-1 overflow-hidden rounded-full bg-border/40"
                    role="progressbar"
                    aria-label="Application progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progressPercent}
                  >
                    <div
                      className="h-2 rounded-full bg-primary transition-all duration-200 ease-out"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-xs font-semibold text-foreground whitespace-nowrap">
                      {progressPercent}%
                    </span>
                    <span className="text-xs text-foreground/70 whitespace-nowrap hidden sm:block">
                      {formattedTime}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    {currentStepReadiness.isComplete ? (
                      <CheckCircle className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <div className="h-3.5 w-3.5 rounded-full border-2 border-muted-foreground" />
                    )}
                    <span className={`font-medium ${
                      currentStepReadiness.isComplete ? 'text-success' : 'text-foreground/80'
                    }`}>
                      {currentStepReadiness.completed}/{currentStepReadiness.total} requirements complete
                    </span>
                  </div>
                  {!currentStepReadiness.isComplete && currentStepReadiness.missingItems.length > 0 && (
                    <span className="text-foreground/75">
                      {WIZARD_COPY.missingFieldsPrefix} {currentStepReadiness.missingItems.slice(0, 2).map(item => item.label).join(', ')}
                      {currentStepReadiness.missingItems.length > 2 && ` +${currentStepReadiness.missingItems.length - 2} more`}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Auto-save status indicator */}
              <AutoSaveIndicator
                status={
                  smartAutoSave.saveStatus === 'offline' || smartAutoSave.saveStatus === 'conflict'
                    ? 'error'
                    : smartAutoSave.saveStatus as 'idle' | 'saving' | 'saved' | 'error'
                }
                lastSavedAt={smartAutoSave.lastSaved ? smartAutoSave.lastSaved.getTime() : null}
              />
              
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
                <span className={smartAutoSave.changedFields.length > 0 || smartAutoSave.saveStatus === 'error' ? 'inline' : 'hidden sm:inline'}>
                  {saveNowLabel}
                </span>
              </Button>
            </div>
            {smartAutoSave.saveStatus === 'error' && smartAutoSave.saveError && (
              <p className="text-xs font-medium text-destructive sm:text-right">
                {smartAutoSave.saveError}
              </p>
            )}
          </div>

          <div className="relative">
            {/* Enhanced Progress Indicator - Requirements 7.1, 7.2 */}
            <EnhancedProgressIndicator
              steps={wizardSteps}
              currentStepIndex={currentStepIndex}
              onStepClick={handleProgressStepClick}
              progressPercentage={progressPercent}
            />
          </div>
          </div>
        </Container>

        <Container size="md">

        {/* Validation error summary with field links (Req 5.2, 5.3) */}
        {validationErrors.length > 0 && (
          <WizardErrorSummary errors={validationErrors} />
        )}

        {error && validationErrors.length === 0 && (
          <Alert variant="error" className="mb-6 animate-slide-up">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <AlertTitle className="text-foreground">Something needs attention</AlertTitle>
                <AlertDescription className="mt-1 text-foreground">{error}</AlertDescription>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {(error.toLowerCase().includes('network') || error.toLowerCase().includes('connection') || error.toLowerCase().includes('failed to') || error.toLowerCase().includes('timeout')) && (
                  <Button type="button" variant="outline" size="sm" onClick={wrappedHandleNextStep}>
                    Retry
                  </Button>
                )}
                <Button type="button" variant="ghost" size="sm" onClick={() => setError('')}>
                  Dismiss
                </Button>
              </div>
            </div>
          </Alert>
        )}

        {!stepValidation.isValid && !isLastStep && stepValidation.completedFields > 0 && (
          <Alert variant="warning" className="mb-6 animate-slide-up">
            <div className="flex-1">
              <AlertTitle className="text-foreground">This step is still incomplete</AlertTitle>
              <AlertDescription className="mt-1 text-foreground">
                Complete the remaining items before continuing.
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
            <form onSubmit={form.handleSubmit(handleSubmitApplication)} className="space-y-6 lg:space-y-8" style={{ scrollPaddingBottom: '5rem' }}>
            <div key={stepKey} ref={stepContentRef} tabIndex={-1} className={`outline-none ${stepDirection === 'forward' ? 'wizard-step-forward' : 'wizard-step-backward'}`}>
            {/* Background upload indicator — visible on any step */}
            {uploading && currentStepConfig.key !== 'education' && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm text-primary animate-in fade-in duration-300" role="status">
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/40 border-t-primary" />
                <span>Your documents are uploading in the background. You can keep going.</span>
              </div>
            )}
            {currentStepConfig.key === 'basicKyc' && (
              <BasicKycStep
                form={form}
                hasAutoPopulatedData={hasAutoPopulatedData}
                completionPercentage={completionPercentage}
                missingFields={missingFields}
                selectedProgram={selectedProgram}
                programs={programs}
                programsLoading={programsLoading}
                intakes={intakes}
                title={currentStepConfig.title}
                getFieldAriaDescribedBy={getFieldAriaDescribedBy}
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
                uploadStates={uploadStates}
                uploadedFiles={uploadedFiles}
                addGrade={handleAddGrade}
                removeGrade={handleRemoveGrade}
                updateGrade={handleUpdateGrade}
                getUsedSubjects={handleGetUsedSubjects}
                handleResultSlipUpload={handleResultSlipUpload}
                handleExtraKycUpload={handleExtraKycUpload}
                ocrStatus={ocrStatus}
                ocrExtractedCount={ocrExtractedCount}
                ocrFailureReason={ocrFailureReason}
                onRetryOcr={retryOcr}
              />
            )}

            {currentStepConfig.key === 'payment' && (
              <PaymentStep
                title={currentStepConfig.title}
                form={form}
                applicationId={applicationId}
                applicationNumber={submittedApplication?.applicationNumber ?? null}
                polledStatus={paymentStatus}
                onPaymentStatusChange={setPaymentStatus}
                onPaymentStatusRefresh={refetchPaymentStatus}
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
                uploadedFiles={uploadedFiles}
                confirmSubmission={confirmSubmission}
                onConfirmChange={setConfirmSubmission}
                selectedProgramName={selectedProgramDetails?.name}
                selectedIntakeLabel={intakes.find(i => i.id === form.watch('intake'))?.name}
                selectedInstitutionLabel={
                  selectedProgramDetails?.institutions?.full_name ||
                  selectedProgramDetails?.institutions?.name ||
                  undefined
                }
                paymentStatus={paymentStatus}
                wizardReadiness={wizardReadiness}
                applicationId={applicationId}
                onNavigateToStep={handleNavigateToStep}
              />
            )}
            </div>

              <div className={`${keyboardOpen ? 'relative' : 'sticky bottom-0'} z-10 -mx-4 border-t border-border/50 bg-background px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] sm:static sm:mx-0 sm:border-t-0 sm:bg-transparent sm:px-0 sm:py-0 sm:shadow-none`}>
              <div className="glass-panel flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="order-2 sm:order-1">
              {currentStepIndex > 0 && (
                <div>
                  <Button type="button" variant="outline" onClick={wrappedHandlePrevStep} className="w-full sm:w-auto" disabled={loading} aria-label={`Go back to ${wizardSteps[currentStepIndex - 1]?.progressTitle || 'previous step'}`}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    {previousButtonLabel}
                  </Button>
                </div>
              )}
            </div>

            <div className="order-1 sm:order-2">
              {!isLastStep ? (
                <div>
                  <Button type="button" variant="primary" onClick={wrappedHandleNextStep} loading={loading} disabled={loading || (currentStepConfig.key === 'payment' && paymentStatus !== 'successful' && paymentStatus !== 'deferred')} className="w-full sm:w-auto min-h-[48px]" aria-label={`Continue to ${wizardSteps[currentStepIndex + 1]?.progressTitle || 'next step'}`}>
                    {loading || isUploadBlocking ? nextButtonLabel : (<><span>{nextButtonLabel}</span><ArrowRight className="h-4 w-4 ml-2" /></>)}
                  </Button>
                </div>
              ) : (
                <div>
                  <Button type="submit" variant="success" loading={loading} disabled={loading || !wizardReadiness.canSubmit} className="w-full sm:w-auto min-h-[48px]">
                    {loading ? 'Submitting...' : (<><Send className="h-4 w-4 mr-2" />Submit Application</>)}
                  </Button>
                </div>
              )}
              </div>
              </div>
              </div>
            </form>
          </div>

          <aside className="hidden lg:col-span-1 lg:block" aria-labelledby="wizard-support-heading">
            <div className="sticky top-6 space-y-4">
              <ApplicationPreview
                form={form}
                programName={selectedProgramDetails?.name}
                intakeName={form.watch('intake')}
              />
              
              <StepChecklist items={getChecklistItems()} />
              
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
        currentDraftId={applicationId ?? undefined}
        onLoadDraft={handleLoadDraft}
        onCreateNew={() => {
          form.reset()
          setError('')
        }}
      />
    </PageShell>
    </>
  )
}

const ApplicationWizard = () => (
  <ErrorBoundary level="section">
    <ApplicationWizardContent />
  </ErrorBoundary>
)

export default ApplicationWizard
