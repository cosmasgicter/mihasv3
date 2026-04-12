import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import type { Application, Intake, ApplicationInterview } from '@/types/database'
import { interviewsService } from '@/services/interviews'
import { Button } from '@/components/ui/Button'
import { ContinueApplication } from '@/components/application/ContinueApplication'
import { DocumentButtons } from '@/components/student/DocumentButtons'
import { formatDate, getStatusColor } from '@/lib/utils'
import { draftManager } from '@/lib/draftManager'
import { sanitizeForLog, sanitizeForDisplay } from '@/lib/sanitize'
import { getUserMetadata, getBestValue, calculateProfileCompletion, getProfileMissingFields } from '@/hooks/useProfileAutoPopulation'
import { ProfileCompletionBadge } from '@/components/ui/ProfileAutoPopulationIndicator'
import { clearAllDraftData } from '@/lib/draftManager'
import { applicationService } from '@/services/applications'
import { catalogService } from '@/services/catalog'
import { DashboardStatusOverview } from '@/components/student/DashboardStatusOverview'
import { ApplicationTimeline } from '@/components/student/ApplicationTimeline'
import { QuickActions } from '@/components/student/QuickActions'
import { ApplicationListItem } from '@/components/student/ApplicationListItem'
import { User, FileText, Clock, CheckCircle, XCircle, X, RefreshCw, Calendar } from 'lucide-react'

import { PageHeader } from '@/components/ui/PageHeader'
import { SectionCard } from '@/components/ui/SectionCard'
import { useToastStore } from '@/hooks/useToast'
import { ConfirmAlertDialog } from '@/components/ui/alert-dialog'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { Container } from '@/components/ui/Container'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageShell } from '@/components/ui/PageShell'
import { useStudentDashboardRefresh } from '@/hooks/useManualRefresh'
import { useStudentDashboardPolling, type StudentDashboardData } from '@/hooks/useStudentDashboardPolling'
import { useApplicationUpdates } from '@/hooks/useRealtime'
import { useQueryClient } from '@tanstack/react-query'
import { staggerChild, animateClasses } from '@/lib/animations'
import { getDisplayName } from '@/utils/userDisplayName'
import { Seo } from '@/components/seo/Seo'
import { applicationSessionManager } from '@/lib/applicationSession'
import { requiresStudentPaymentAction } from '@/lib/paymentStatus'
import { logApiError } from '@/lib/apiErrorLogger'
import { getDefaultSSEClient } from '@/lib/sseClient'
import { DashboardSkeleton } from '@/components/ui'

/** Check if a rejected promise reason is a 403 Forbidden error */
function is403Error(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status?: number }).status === 403
  }
  if (error instanceof Error) {
    return error.message.includes('403') || error.message.toLowerCase().includes('forbidden')
  }
  return false
}

export default function StudentDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { profile } = useProfileQuery()
  const [applications, setApplications] = useState<Application[]>([])
  const [intakes, setIntakes] = useState<Intake[]>([])
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [applicationsError, setApplicationsError] = useState('')
  const [intakesError, setIntakesError] = useState('')
  const [interviewsError, setInterviewsError] = useState('')
  const [hasDraft, setHasDraft] = useState(false)
  const [isClearingAllDrafts, setIsClearingAllDrafts] = useState(false)
  const [scheduledInterviews, setScheduledInterviews] = useState<ApplicationInterview[]>([])
  const hasLoadedRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const loadRequestIdRef = useRef(0)
  const loadDashboardDataRef = useRef<() => Promise<void>>(async () => {})
  const initialLoadCompleteRef = useRef(false)
  const scheduledRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const confirmDialog = useConfirmDialog()

  const scheduleDashboardReload = useCallback((delay = 150) => {
    if (scheduledRefreshRef.current) {
      clearTimeout(scheduledRefreshRef.current)
    }

    scheduledRefreshRef.current = setTimeout(() => {
      scheduledRefreshRef.current = null
      void loadDashboardDataRef.current()
    }, delay)
  }, [])

  const syncApplicationsFromPolling = useCallback((data: StudentDashboardData) => {
    setApplications((previousApplications) => {
      const previousById = new Map(previousApplications.map((application) => [application.id, application]))
      return data.applications.map((application) => ({
        ...(previousById.get(application.id) ?? {}),
        ...application,
      })) as Application[]
    })

    if (data.applications.some((application) => application.status === 'draft')) {
      setHasDraft(true)
    }

    setApplicationsError('')
  }, [])

  // Requirements: 8.2 - Check if SSE client is in auth-failed state to skip SSE connection
  const sseAuthFailed = useMemo(() => {
    try {
      return getDefaultSSEClient().isAuthFailed()
    } catch {
      return false
    }
  }, [])
  
  // Manual refresh hook for React Query cache invalidation
  const { forceRefresh, isRefreshing: isManualRefreshing } = useStudentDashboardRefresh({
    onSuccess: () => {
      scheduleDashboardReload(0)
    },
    onError: (error) => {
      console.error('Manual refresh failed:', sanitizeForLog(error))
      useToastStore.getState().addToast('error', 'Failed to refresh data')
    }
  })

  // Requirements: 1.1, 1.2 - Dashboard data refresh via polling
  useStudentDashboardPolling({
    onDataChange: syncApplicationsFromPolling,
  })

  // Requirements: 8.1, 8.2, 8.4 - Subscribe to application_update events and refresh dashboard
  // Skip SSE when auth-failed (Req 8.2) or during initial data load (Req 8.4)
  const queryClient = useQueryClient()
  useApplicationUpdates(
    useCallback((data: Record<string, unknown>) => {
      // Don't process SSE events during initial load to avoid triggering reconnection
      if (!initialLoadCompleteRef.current) return
      // Invalidate React Query cache to trigger refetch of dashboard data
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      queryClient.invalidateQueries({ queryKey: ['student-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['student-dashboard-polling'] })
      scheduleDashboardReload(250)
    }, [queryClient, scheduleDashboardReload])
  )

  useEffect(() => {
    if (user) {
      void loadDashboardDataRef.current()
    }

    // Cleanup function to abort pending requests
    return () => {
      loadRequestIdRef.current += 1
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      if (scheduledRefreshRef.current) {
        clearTimeout(scheduledRefreshRef.current)
      }
    }
  }, [user])

  // Listen for storage changes and draft cleared events to update draft status
  useEffect(() => {
    const handleStorageChange = async () => {
      if (!user) {
        setHasDraft(false)
        return
      }

      const draft = await applicationSessionManager.getLocalWizardDraft(user.id)
      if (draft) {
        setHasDraft(true)
        return
      }

      setHasDraft(false)
    }

    const handleDraftCleared = async () => {
      setHasDraft(false)
      setApplications(prev => prev.filter(app => app.status !== 'draft'))
      scheduleDashboardReload()
    }

    const handleApplicationSubmitted = async (event: Event) => {
      const detail = (event as CustomEvent<{
        applicationId?: string
        submittedAt?: string
        status?: string
        paymentStatus?: string | null
      }>).detail

      setHasDraft(false)

      if (detail?.applicationId) {
        setApplications(prev =>
          prev.map(app =>
            app.id === detail.applicationId
              ? {
                  ...app,
                  status: detail.status || 'submitted',
                  submitted_at: detail.submittedAt || app.submitted_at || new Date().toISOString(),
                  payment_status: detail.paymentStatus ?? app.payment_status,
                }
              : app
          )
        )
      }

      scheduleDashboardReload()
    }

    const handleApplicationUpdated = async () => {
      scheduleDashboardReload()
    }

    const handleApplicationCreated = async () => {
      scheduleDashboardReload()
    }

    const handleDraftSaved = async () => {
      await handleStorageChange()
      scheduleDashboardReload()
    }

    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('focus', handleStorageChange)
    window.addEventListener('draftCleared', handleDraftCleared)
    window.addEventListener('applicationDraftSaved', handleDraftSaved)
    window.addEventListener('applicationSubmitted', handleApplicationSubmitted)
    window.addEventListener('applicationUpdated', handleApplicationUpdated)
    window.addEventListener('applicationCreated', handleApplicationCreated)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('focus', handleStorageChange)
      window.removeEventListener('draftCleared', handleDraftCleared)
      window.removeEventListener('applicationDraftSaved', handleDraftSaved)
      window.removeEventListener('applicationSubmitted', handleApplicationSubmitted)
      window.removeEventListener('applicationUpdated', handleApplicationUpdated)
      window.removeEventListener('applicationCreated', handleApplicationCreated)
    }
  }, [scheduleDashboardReload, user])

  const loadDashboardData = async () => {
    const requestId = loadRequestIdRef.current + 1
    loadRequestIdRef.current = requestId
    const isLatestRequest = () => loadRequestIdRef.current === requestId
    const isInitialLoad = !hasLoadedRef.current

    if (!user?.id) {
      setApplications([])
      setIntakes([])
      setScheduledInterviews([])
      setHasDraft(false)
      setApplicationsError('')
      setIntakesError('')
      setInterviewsError('')
      setIsInitialLoading(false)
      setIsRefreshing(false)
      hasLoadedRef.current = false
      return
    }

    // Cancel any pending requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    try {
      if (isInitialLoad) {
        setIsInitialLoading(true)
      } else {
        setIsRefreshing(true)
      }
      setApplicationsError('')
      setIntakesError('')
      setInterviewsError('')

      const localDraft = await applicationSessionManager.getLocalWizardDraft(user.id)

      if (!isLatestRequest() || signal.aborted) return
      if (localDraft) {
        setHasDraft(true)
      } else {
        setHasDraft(false)
      }

      // --- Load all sections in parallel for faster dashboard render ---
      const [applicationsResult, intakesResult, interviewsResult] = await Promise.allSettled([
        // Applications: single call for all (draft check merged into full list)
        applicationService.list({
          page: 1,
          pageSize: 50,
          sortBy: 'date',
          sortOrder: 'desc',
          mine: true
        }),
        // Intakes
        catalogService.getIntakes() as Promise<{ intakes: Intake[] }>,
        // Interviews
        user.id ? interviewsService.list() : Promise.resolve(null),
      ])

      if (!isLatestRequest() || signal.aborted) return

      // --- Process applications result ---
      if (applicationsResult.status === 'fulfilled') {
        const applicationsResponse = applicationsResult.value
        const loadedApplications = (applicationsResponse?.applications || []) as Application[]
        setApplications(loadedApplications)
        setApplicationsError('')

        // Check for drafts in the loaded applications
        const hasDraftApp = loadedApplications.some(app => app.status === 'draft')
        if (hasDraftApp) {
          setHasDraft(true)
        }

        if (localDraft?.applicationId) {
          const matchingApplication = loadedApplications.find(application => application.id === localDraft.applicationId)
          if (matchingApplication && matchingApplication.status !== 'draft') {
            clearAllDraftData()
            setHasDraft(false)
          }
        }
      } else {
        const appError = applicationsResult.reason
        if (appError instanceof Error && (appError.name === 'AbortError' || appError.message.includes('aborted'))) { /* skip */ }
        else {
          logApiError('student-dashboard', '/api/v1/applications/', appError)
          setApplicationsError(`Failed to load applications. ${appError instanceof Error ? appError.message : 'Please try again.'}`)
        }
      }

      // --- Process intakes result ---
      if (intakesResult.status === 'fulfilled') {
        setIntakes(intakesResult.value?.intakes || [])
        setIntakesError('')
      } else {
        const intakeError = intakesResult.reason
        if (intakeError instanceof Error && (intakeError.name === 'AbortError' || intakeError.message.includes('aborted'))) { /* skip */ }
        else {
          logApiError('student-dashboard', '/api/v1/catalog/intakes/', intakeError)
          setIntakesError(`Failed to load intakes. ${intakeError instanceof Error ? intakeError.message : 'Please try again.'}`)
        }
      }

      // --- Process interviews result ---
      if (interviewsResult.status === 'fulfilled' && interviewsResult.value) {
        const interviewData = interviewsResult.value
        const scheduledOnly = (interviewData?.interviews || []).filter(
          (interview: { status: string }) => interview.status === 'scheduled' || interview.status === 'rescheduled'
        )
        setScheduledInterviews(scheduledOnly as ApplicationInterview[])
        setInterviewsError('')
      } else if (interviewsResult.status === 'rejected') {
        const interviewError = interviewsResult.reason
        if (interviewError instanceof Error && (interviewError.name === 'AbortError' || interviewError.message.includes('aborted'))) { /* skip */ }
        else {
          logApiError('student-dashboard', '/api/v1/interviews/', interviewError)
          setInterviewsError(`Failed to load interviews. ${interviewError instanceof Error ? interviewError.message : 'Please try again.'}`)
          setScheduledInterviews([])
        }
      }

      // --- Requirements 8.3, 8.5: Detect all-403 (session expired) and redirect to sign-in ---
      const results = [applicationsResult, intakesResult, interviewsResult]
      const failedResults = results.filter(r => r.status === 'rejected')
      const all403 = failedResults.length === results.length &&
        failedResults.every(r => is403Error((r as PromiseRejectedResult).reason))

      if (all403 && isLatestRequest() && !signal.aborted) {
        // All sources returned 403 — session expired, redirect within 2 seconds
        setTimeout(() => {
          navigate('/auth/signin')
        }, 2000)
      }
    } catch (error) {
      // Catch-all for unexpected errors (e.g. draft loading)
      if (!isLatestRequest()) return
      if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('aborted'))) return
      logApiError('student-dashboard', '/api/v1/applications/', error)
      setApplicationsError(error instanceof Error ? sanitizeForLog(error.message) : 'Failed to load dashboard data')
    } finally {
      if (!isLatestRequest() || signal.aborted) {
        return
      }
      hasLoadedRef.current = true
      initialLoadCompleteRef.current = true
      if (isInitialLoad) {
        setIsInitialLoading(false)
      } else {
        setIsRefreshing(false)
      }
    }
  }
  loadDashboardDataRef.current = loadDashboardData

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-5 w-5 text-success" />
      case 'rejected':
        return <XCircle className="h-5 w-5 text-destructive" />
      case 'under_review':
        return <Clock className="h-5 w-5 text-primary" />
      default:
        return <Clock className="h-5 w-5 text-warning" />
    }
  }

  const getProgramName = (programName: string) => {
    return programName || 'Unknown Program'
  }

  const getIntakeName = (intakeName: string) => {
    return intakeName || 'Unknown Intake'
  }

  const metadata = getUserMetadata(user)

  const { profileCompletion, profileMissingFields, firstName } = useMemo(() => {
    const completion = calculateProfileCompletion(profile, metadata)
    const missing = getProfileMissingFields(profile, metadata)
    const name = sanitizeForDisplay(getDisplayName(profile, {
      ...user,
      full_name: getBestValue(user?.full_name, metadata.full_name),
    }))
    return {
      profileCompletion: completion,
      profileMissingFields: missing,
      firstName: name?.split(' ')[0] || 'Student',
    }
  }, [profile, metadata, user])

  const {
    submittedApplications,
    totalDraftCount,
    hasPendingPayment
  } = useMemo(() => {
    const draftApps = applications.filter(app => app.status === 'draft')
    const submittedApps = applications.filter(app => app.status !== 'draft')
    const hasLocalOnly = hasDraft && draftApps.length === 0
    const draftCount = draftApps.length + (hasLocalOnly ? 1 : 0)

    const pendingPayment = applications.some(app =>
      app.status !== 'draft' && requiresStudentPaymentAction(app.payment_status)
    )

    return {
      submittedApplications: submittedApps,
      totalDraftCount: draftCount,
      hasPendingPayment: pendingPayment
    }
  }, [applications, hasDraft])
  
  // Requirements: 2.4, 4.3 - Check for 'scheduled' or 'rescheduled' status in application_interviews
  const hasScheduledInterview = scheduledInterviews.length > 0

  // Handler for clearing all drafts
  const handleClearAllDrafts = useCallback(async () => {
    const confirmed = await confirmDialog.confirm({
      title: 'Clear All Drafts',
      message: 'All draft applications will be permanently deleted.',
      confirmText: 'Clear All',
      variant: 'danger'
    })
    if (!confirmed) return
    setIsClearingAllDrafts(true)
    try {
      if (!user) {
        throw new Error('You must be signed in to clear drafts')
      }

      const deleteResult = await draftManager.clearAllDrafts(user.id)
      await loadDashboardDataRef.current()

      if (!deleteResult.success) {
        const errorMessage = deleteResult.error || 'Failed to clear all drafts from the server'
        setApplicationsError(errorMessage)
        useToastStore.getState().addToast('error', errorMessage)
        return
      }

      setApplications(prev => prev.filter(app => app.status !== 'draft'))
      setHasDraft(false)
      setApplicationsError('')
      useToastStore.getState().addToast('success', 'All drafts cleared successfully')
    } catch (error) {
      logApiError('student-dashboard', '/api/v1/applications/ (clear drafts)', error)
      const errorMsg = error instanceof Error ? error.message : 'Failed to clear drafts'
      setApplicationsError(errorMsg)
      useToastStore.getState().addToast('error', errorMsg)
    } finally {
      setIsClearingAllDrafts(false)
    }
  }, [user, applications, confirmDialog])

  return (
    <>
      <Seo
        title="Student Dashboard | MIHAS-KATC Admissions"
        description="View your MIHAS-KATC application progress, pending actions, interview updates, and key admission milestones."
        path="/student/dashboard"
        noindex
      />
    <PageShell
      title={`Welcome back, ${firstName}`}
      subtitle="Track your applications, manage drafts, and keep your profile information up to date."
      maxWidth="7xl"
      actions={
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => forceRefresh()}
            disabled={isRefreshing || isManualRefreshing}
            className="flex items-center gap-2"
            loading={isRefreshing || isManualRefreshing}
          >
            {!(isRefreshing || isManualRefreshing) && <RefreshCw className="h-4 w-4" />}
            {(isRefreshing || isManualRefreshing) ? 'Refreshing...' : 'Refresh'}
          </Button>
          <ProfileCompletionBadge completionPercentage={profileCompletion} missingFields={profileMissingFields} />
        </div>
      }
    >
        {isInitialLoading ? (
          <DashboardSkeleton />
        ) : (
          <div className="space-y-6 sm:space-y-8">
            {isRefreshing && (
              <div className="rounded-full bg-white px-6 py-3 shadow-lg animate-fade-in">
                <div className="h-1 w-full overflow-hidden rounded-full bg-primary/10">
                  <div className="h-full w-1/3 rounded-full bg-gradient-vibrant animate-pulse" />
                </div>
                <span className="sr-only">Refreshing dashboard data</span>
              </div>
            )}

            {/* Status Overview with 8starlabs StatusIndicator */}
            <DashboardStatusOverview 
              applications={applications}
            />

            <ContinueApplication />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
              <SectionCard
                className="lg:col-span-2"
                title="My applications"
                description="Review submitted applications, payment progress, and document actions after you complete the draft above."
                icon={<FileText className="h-5 w-5" />}
                headerVariant="tinted"
                contentClassName="p-0"
              >
                {applicationsError ? (
                  <div className="px-6 py-6">
                    <ErrorDisplay
                      title="Applications failed to load"
                      message={applicationsError}
                      onRetry={() => loadDashboardData()}
                      variant="inline"
                    />
                  </div>
                ) : submittedApplications.length === 0 ? (
                  totalDraftCount > 0 ? (
                    <div className="px-6 py-12">
                      <EmptyState
                        icon={<Clock className="h-12 w-12" />}
                        heading="Your application is still in draft"
                        description="Continue the saved draft above when you are ready. Submitted applications will appear here once you complete the full flow."
                      />
                    </div>
                  ) : (
                    <div className="px-6 py-12">
                      <EmptyState
                        icon={<FileText className="h-12 w-12" />}
                        heading="No applications yet"
                        description="Start your journey by submitting your first application. We'll guide you every step of the way."
                        action={{
                          label: 'New Application',
                          onClick: () => navigate('/student/application-wizard'),
                          variant: 'primary',
                        }}
                      />
                    </div>
                  )
                ) : (
                  <div className="divide-y divide-border">
                    {submittedApplications.map((application, index) => (
                      <ApplicationListItem
                        key={application.id}
                        application={application}
                        index={index}
                      />
                    ))}
                  </div>
                )}
              </SectionCard>

              <div className="space-y-6">
                <SectionCard
                  title="Profile summary"
                  description="Keep your personal details up to date so we can assist you faster."
                  icon={<User className="h-5 w-5" />}
                >
                  <div className="grid gap-3">
                    <div className="rounded-xl bg-muted px-4 py-3 overflow-hidden">
                      <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Full name</p>
                      <p className="text-sm font-semibold text-foreground break-words overflow-wrap-anywhere">
                        {sanitizeForDisplay(getBestValue(profile?.full_name, metadata.full_name, user?.email?.split('@')[0]))}
                      </p>
                    </div>
                    <div className="rounded-xl bg-muted px-4 py-3 overflow-hidden">
                      <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Email</p>
                      <p className="text-sm font-semibold text-foreground break-all overflow-wrap-anywhere">{sanitizeForDisplay(user?.email) || 'Not provided'}</p>
                    </div>
                    <div className="rounded-xl bg-muted px-4 py-3 overflow-hidden">
                      <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Phone</p>
                      <p className="text-sm font-semibold text-foreground break-words overflow-wrap-anywhere">
                        {sanitizeForDisplay(getBestValue(profile?.phone, metadata.phone, 'Not provided'))}
                      </p>
                    </div>
                    <div className="rounded-xl bg-muted px-4 py-3 overflow-hidden">
                      <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Residence</p>
                      <p className="text-sm font-semibold text-foreground break-words overflow-wrap-anywhere">
                        {sanitizeForDisplay(getBestValue(profile?.address, metadata.address, 'Not provided'))}
                      </p>
                    </div>
                  </div>
                  <Link to="/student/settings" className="block">
                    <Button variant="outline" size="sm" className="mt-4 w-full">
                      Update profile
                    </Button>
                  </Link>
                </SectionCard>

                <SectionCard
                  title="Upcoming deadlines"
                  description="Never miss an important date for upcoming intakes."
                  icon={<Clock className="h-5 w-5" />}
                >
                  <div className="space-y-3">
                    {intakesError ? (
                      <ErrorDisplay
                        title="Intakes failed to load"
                        message={intakesError}
                        onRetry={() => loadDashboardData()}
                        variant="inline"
                      />
                    ) : intakes.length === 0 ? (
                      <EmptyState
                        icon={<Calendar className="h-12 w-12" />}
                        heading="No upcoming deadlines yet"
                        description="Check back soon for the next intake and application deadline."
                      />
                    ) : (
                      intakes.slice(0, 3).map((intake, index) => (
                        <div
                          key={intake.id}
                          className={`rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 ${animateClasses.slideUp}`}
                          style={staggerChild(index, 100)}
                        >
                          <p className="text-sm font-semibold text-foreground">{intake.name}</p>
                          <p className="text-xs font-semibold text-warning">Deadline: {formatDate(intake.application_deadline)}</p>
                        </div>
                      ))
                    )}
                  </div>
                </SectionCard>

                {/* Application Timeline with 8starlabs Timeline component */}
                <ApplicationTimeline applications={applications} />

                {/* Quick Actions component */}
                {interviewsError && (
                  <ErrorDisplay
                    title="Interviews failed to load"
                    message={interviewsError}
                    onRetry={() => loadDashboardData()}
                    variant="inline"
                  />
                )}
                <QuickActions
                  hasDrafts={totalDraftCount > 0}
                  hasPendingPayment={hasPendingPayment}
                  hasScheduledInterview={hasScheduledInterview}
                  onClearAllDrafts={handleClearAllDrafts}
                  isClearingDrafts={isClearingAllDrafts}
                />
              </div>
            </div>
          </div>
        )}
      <ConfirmAlertDialog
        isOpen={confirmDialog.isOpen}
        onClose={confirmDialog.handleCancel}
        onConfirm={confirmDialog.handleConfirm}
        title={confirmDialog.options.title}
        message={confirmDialog.options.message}
        confirmText={confirmDialog.options.confirmText}
        cancelText={confirmDialog.options.cancelText}
        variant={confirmDialog.options.variant}
      />
    </PageShell>
      </>
  );
}
