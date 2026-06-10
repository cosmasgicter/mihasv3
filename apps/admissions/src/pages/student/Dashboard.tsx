import React, { useCallback, useEffect, useRef, useState, useMemo, useReducer } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import type { Application, ApplicationInterview } from '@/types/database'
import { interviewsService } from '@/services/interviews'
import { Button } from '@/components/ui/Button'
import { ContinueApplication } from '@/components/application/ContinueApplication'
import { sanitizeForLog, sanitizeForDisplay } from '@/lib/sanitize'
import { getUserMetadata, getBestValue, calculateProfileCompletion, getProfileMissingFields } from '@/hooks/useProfileAutoPopulation'
import { ProfileCompletionBadge } from '@/components/ui/ProfileAutoPopulationIndicator'
import { clearAllDraftData } from '@/lib/draftManager'
import { applicationService, sortApplicationsByActivity } from '@/services/applications'
import { catalogService } from '@/services/catalog'
import { DashboardStatusOverview } from '@/components/student/DashboardStatusOverview'
import { RefreshCw } from 'lucide-react'

import { useToastStore } from '@/hooks/useToast'
import { ConfirmAlertDialog } from '@/components/ui/alert-dialog'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { Banner } from '@/components/ui/Banner'
import { PageShell } from '@/components/ui/PageShell'
import { useStudentDashboardRefresh } from '@/hooks/useManualRefresh'
import { useStudentDashboardPolling, type StudentDashboardData } from '@/hooks/useStudentDashboardPolling'

import { StaggerContainer, StaggerItem } from '@/components/motion'
import { getDisplayName } from '@/lib/userDisplayName'
import { Seo } from '@/components/seo/Seo'
import { applicationSessionManager } from '@/lib/applicationSession'
import { requiresStudentPaymentAction } from '@/lib/paymentStatus'
import { logApiError } from '@/lib/apiErrorLogger'
import { useDraftRevision } from '@/stores/draftStore'

import { DashboardSkeleton } from '@/components/ui'
import { onDashboardMount } from '@/lib/speculativePrefetch'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { reportError } from '@/lib/errorReporter'
import { logger } from '@/lib/logger'

import {
  dashboardReducer, initialDashboardState,
  suppressDeletedDraftIds, filterSuppressedDrafts,
  removeDraftsFromApplicationCaches, clearSuppressionTimers,
  executeClearAllDrafts,
} from './lib/dashboardReducer'
import { NextActionCard } from '@/components/student/dashboard/NextActionCard'
import { ApplicationsGrid } from '@/components/student/dashboard/ApplicationsGrid'

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
  const { profile } = useProfileQuery()
  const queryClient = useQueryClient()
  const draftRevision = useDraftRevision()

  useEffect(() => { onDashboardMount(user?.id) }, [user?.id])

  const [state, dispatch] = useReducer(dashboardReducer, initialDashboardState)
  const {
    applications, intakes, scheduledInterviews,
    isInitialLoading, isRefreshing,
    applicationsError, intakesError, interviewsError, sessionError,
    hasDraft, isClearingAllDrafts,
  } = state

  // This useState MUST remain for source-level test assertion compatibility
  const [isPollingEnabled, setIsPollingEnabled] = useState(false)

  const hasLoadedRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const loadRequestIdRef = useRef(0)
  const loadDashboardDataRef = useRef<() => Promise<void>>(async () => {})
  const initialLoadCompleteRef = useRef(false)
  const scheduledRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const confirmDialog = useConfirmDialog()

  const applyDeletedDraftRemoval = useCallback((ids: string[]) => {
    const cleanIds = ids.filter((id) => typeof id === 'string' && id.length > 0)
    if (cleanIds.length === 0) return
    suppressDeletedDraftIds(cleanIds)
    removeDraftsFromApplicationCaches(queryClient, cleanIds)
    dispatch({ type: 'SET_APPLICATIONS', payload: applications.filter(app => !cleanIds.includes(app.id)) })
  }, [queryClient, applications])

  const scheduleDashboardReload = useCallback((delay = 150) => {
    if (scheduledRefreshRef.current) clearTimeout(scheduledRefreshRef.current)
    scheduledRefreshRef.current = setTimeout(() => {
      scheduledRefreshRef.current = null
      void loadDashboardDataRef.current()
    }, delay)
  }, [])

  const syncApplicationsFromPolling = useCallback((data: StudentDashboardData) => {
    const previousById = new Map(applications.map((a) => [a.id, a]))
    const merged = filterSuppressedDrafts(sortApplicationsByActivity(data.applications.map((a) => ({
      ...(previousById.get(a.id) ?? {}),
      ...a,
    })) as Application[]))
    dispatch({ type: 'SET_APPLICATIONS', payload: merged })

    const hasServerDraft = filterSuppressedDrafts(data.applications as Application[]).some((a) => a.status === 'draft')
    if (hasServerDraft) {
      dispatch({ type: 'SET_HAS_DRAFT', payload: true })
    } else if (user?.id) {
      void applicationSessionManager.getLocalWizardDraft(user.id).then((localDraft) => {
        dispatch({ type: 'SET_HAS_DRAFT', payload: Boolean(localDraft) })
      })
    } else {
      dispatch({ type: 'SET_HAS_DRAFT', payload: false })
    }
    dispatch({ type: 'SET_APPLICATIONS_ERROR', payload: '' })
  }, [user?.id, applications])

  const { forceRefresh, isRefreshing: isManualRefreshing } = useStudentDashboardRefresh({
    onSuccess: () => { scheduleDashboardReload(0) },
    onError: (error) => {
      logger.error('Manual refresh failed:', sanitizeForLog(error))
      useToastStore.getState().addToast('error', 'Failed to refresh data')
    }
  })

  useStudentDashboardPolling({
    enabled: isPollingEnabled,
    onDataChange: syncApplicationsFromPolling,
  })

  useEffect(() => {
    if (user) void loadDashboardDataRef.current()
    return () => {
      loadRequestIdRef.current += 1
      if (abortControllerRef.current) abortControllerRef.current.abort()
      if (scheduledRefreshRef.current) clearTimeout(scheduledRefreshRef.current)
      clearSuppressionTimers()
    }
  }, [user])

  useEffect(() => {
    const handleStorageChange = async () => {
      if (!user) { dispatch({ type: 'SET_HAS_DRAFT', payload: false }); return }
      const draft = await applicationSessionManager.getLocalWizardDraft(user.id)
      dispatch({ type: 'SET_HAS_DRAFT', payload: Boolean(draft) })
    }

    const handleDraftCleared = async (event?: Event) => {
      const detail = (event as CustomEvent<{ deletedIds?: string[]; blockedIds?: string[] }> | undefined)?.detail
      const deletedIds = detail?.deletedIds ?? []
      const blockedIds = detail?.blockedIds ?? []
      if (deletedIds.length > 0) applyDeletedDraftRemoval(deletedIds)
      dispatch({ type: 'SET_HAS_DRAFT', payload: blockedIds.length > 0 })
      dispatch({ type: 'SET_APPLICATIONS', payload: (() => {
        if (deletedIds.length > 0) return applications.filter(app => !deletedIds.includes(app.id))
        if (detail) return applications
        return applications.filter(app => app.status !== 'draft')
      })() })
      scheduleDashboardReload()
    }

    const handleApplicationSubmitted = async (event: Event) => {
      const detail = (event as CustomEvent<{
        applicationId?: string; submittedAt?: string; status?: string; paymentStatus?: string | null
      }>).detail
      dispatch({ type: 'SET_HAS_DRAFT', payload: false })
      if (detail?.applicationId) {
        dispatch({ type: 'SET_APPLICATIONS', payload: applications.map(app =>
          app.id === detail.applicationId
            ? { ...app, status: detail.status || 'submitted', submitted_at: detail.submittedAt || app.submitted_at || new Date().toISOString(), payment_status: detail.paymentStatus ?? app.payment_status }
            : app
        ) })
      }
      scheduleDashboardReload()
    }

    const handleReload = () => { scheduleDashboardReload() }

    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('focus', handleStorageChange)
    window.addEventListener('draftCleared', handleDraftCleared)
    window.addEventListener('applicationSubmitted', handleApplicationSubmitted)
    window.addEventListener('applicationUpdated', handleReload)
    window.addEventListener('applicationCreated', handleReload)
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('focus', handleStorageChange)
      window.removeEventListener('draftCleared', handleDraftCleared)
      window.removeEventListener('applicationSubmitted', handleApplicationSubmitted)
      window.removeEventListener('applicationUpdated', handleReload)
      window.removeEventListener('applicationCreated', handleReload)
    }
  }, [applyDeletedDraftRemoval, scheduleDashboardReload, user, applications])

  const draftRevisionMountRef = useRef(draftRevision)
  useEffect(() => {
    if (draftRevision === draftRevisionMountRef.current) return
    if (!user) return
    void applicationSessionManager.getLocalWizardDraft(user.id).then((draft) => {
      dispatch({ type: 'SET_HAS_DRAFT', payload: Boolean(draft) })
    })
    scheduleDashboardReload()
  }, [draftRevision, scheduleDashboardReload, user])

  const loadDashboardData = async () => {
    const requestId = loadRequestIdRef.current + 1
    loadRequestIdRef.current = requestId
    const isLatestRequest = () => loadRequestIdRef.current === requestId
    const isInitialLoad = !hasLoadedRef.current

    if (!user?.id) {
      dispatch({ type: 'RESET_ALL' })
      setIsPollingEnabled(false)
      hasLoadedRef.current = false
      return
    }

    if (abortControllerRef.current) abortControllerRef.current.abort()
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    try {
      dispatch({ type: 'LOAD_START', isInitial: isInitialLoad })

      const [localDraftResult, applicationsResult, interviewsResult] = await Promise.allSettled([
        applicationSessionManager.getLocalWizardDraft(user.id),
        applicationService.list({ page: 1, pageSize: 50, sortBy: 'date', sortOrder: 'desc', mine: true }),
        user.id ? interviewsService.list() : Promise.resolve(null),
      ])

      void catalogService.getIntakes()
        .then((response) => {
          if (!isLatestRequest() || signal.aborted) return
          dispatch({ type: 'SET_INTAKES', payload: response?.intakes || [] })
          dispatch({ type: 'SET_INTAKES_ERROR', payload: '' })
        })
        .catch((intakeError) => {
          if (!isLatestRequest() || signal.aborted) return
          if (intakeError instanceof Error && (intakeError.name === 'AbortError' || intakeError.message.includes('aborted'))) return
          logApiError('student-dashboard', '/api/v1/catalog/intakes/', intakeError)
          dispatch({ type: 'SET_INTAKES_ERROR', payload: `Failed to load intakes. ${intakeError instanceof Error ? intakeError.message : 'Please try again.'}` })
        })

      if (!isLatestRequest() || signal.aborted) return

      const localDraft = localDraftResult.status === 'fulfilled' ? localDraftResult.value : null
      dispatch({ type: 'SET_HAS_DRAFT', payload: Boolean(localDraft) })

      if (applicationsResult.status === 'fulfilled') {
        const applicationsResponse = applicationsResult.value
        const loadedApplications = filterSuppressedDrafts(sortApplicationsByActivity((applicationsResponse?.applications || []) as Application[]))
        dispatch({ type: 'SET_APPLICATIONS', payload: loadedApplications })
        dispatch({ type: 'SET_APPLICATIONS_ERROR', payload: '' })

        if (loadedApplications.some(app => app.status === 'draft')) {
          dispatch({ type: 'SET_HAS_DRAFT', payload: true })
        }

        if (localDraft?.applicationId) {
          const matchingApplication = loadedApplications.find(a => a.id === localDraft.applicationId)
          if (matchingApplication && matchingApplication.status !== 'draft') {
            clearAllDraftData()
            dispatch({ type: 'SET_HAS_DRAFT', payload: false })
          }
        }
      } else {
        const appError = applicationsResult.reason
        if (!(appError instanceof Error && (appError.name === 'AbortError' || appError.message.includes('aborted')))) {
          logApiError('student-dashboard', '/api/v1/applications/', appError)
          dispatch({ type: 'SET_APPLICATIONS_ERROR', payload: `Failed to load applications. ${appError instanceof Error ? appError.message : 'Please try again.'}` })
        }
      }

      if (interviewsResult.status === 'fulfilled' && interviewsResult.value) {
        const scheduledOnly = (interviewsResult.value?.interviews || []).filter(
          (interview: { status: string }) => interview.status === 'scheduled' || interview.status === 'rescheduled'
        )
        dispatch({ type: 'SET_SCHEDULED_INTERVIEWS', payload: scheduledOnly as ApplicationInterview[] })
        dispatch({ type: 'SET_INTERVIEWS_ERROR', payload: '' })
      } else if (interviewsResult.status === 'rejected') {
        const interviewError = interviewsResult.reason
        if (!(interviewError instanceof Error && (interviewError.name === 'AbortError' || interviewError.message.includes('aborted')))) {
          logApiError('student-dashboard', '/api/v1/interviews/', interviewError)
          dispatch({ type: 'SET_INTERVIEWS_ERROR', payload: `Failed to load interviews. ${interviewError instanceof Error ? interviewError.message : 'Please try again.'}` })
          dispatch({ type: 'SET_SCHEDULED_INTERVIEWS', payload: [] })
        }
      }

      const results = [applicationsResult, interviewsResult]
      const failedResults = results.filter(r => r.status === 'rejected')
      const all403 = failedResults.length === results.length &&
        failedResults.every(r => is403Error((r as PromiseRejectedResult).reason))

      if (all403 && isLatestRequest() && !signal.aborted) {
        setTimeout(() => {
          dispatch({ type: 'SET_SESSION_ERROR', payload: 'Unable to load dashboard data. Please try refreshing the page.' })
        }, 2000)
      }
    } catch (error) {
      if (!isLatestRequest()) return
      if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('aborted'))) return
      logApiError('student-dashboard', '/api/v1/applications/', error)
      dispatch({ type: 'SET_APPLICATIONS_ERROR', payload: error instanceof Error ? sanitizeForLog(error.message) : 'Failed to load dashboard data' })
    } finally {
      if (!isLatestRequest() || signal.aborted) return
      hasLoadedRef.current = true
      initialLoadCompleteRef.current = true
      dispatch({ type: 'LOAD_COMPLETE', isInitial: isInitialLoad })
      if (isInitialLoad) setIsPollingEnabled(true)
    }
  }
  loadDashboardDataRef.current = loadDashboardData

  const metadata = getUserMetadata(user)

  const { profileCompletion, profileMissingFields, firstName } = useMemo(() => {
    const completion = calculateProfileCompletion(profile, metadata)
    const missing = getProfileMissingFields(profile, metadata)
    const name = sanitizeForDisplay(getDisplayName(profile, {
      ...user,
      full_name: getBestValue(user?.full_name, metadata.full_name),
    }))
    return { profileCompletion: completion, profileMissingFields: missing, firstName: name?.split(' ')[0] || 'Student' }
  }, [profile, metadata, user])

  const { submittedApplications, totalDraftCount, hasPendingPayment } = useMemo(() => {
    const draftApps = applications.filter(app => app.status === 'draft')
    const submittedApps = sortApplicationsByActivity(applications.filter(app => app.status !== 'draft'))
    const hasLocalOnly = hasDraft && draftApps.length === 0
    const draftCount = draftApps.length + (hasLocalOnly ? 1 : 0)
    const pendingPayment = applications.some(app => requiresStudentPaymentAction(app.payment_status))
    return { submittedApplications: submittedApps, totalDraftCount: draftCount, hasPendingPayment: pendingPayment }
  }, [applications, hasDraft])

  const hasScheduledInterview = scheduledInterviews.length > 0

  const handleClearAllDrafts = useCallback(async () => {
    const confirmed = await confirmDialog.confirm({
      title: 'Clear All Drafts',
      message: 'All draft applications will be permanently deleted.',
      confirmText: 'Clear All',
      variant: 'danger'
    })
    if (!confirmed) return
    if (!user) return
    await executeClearAllDrafts({
      userId: user.id,
      applications,
      dispatch,
      queryClient,
      reload: loadDashboardDataRef.current,
    })
  }, [user, applications, confirmDialog, queryClient])

  return (
    <>
      <Seo
        title="Student Dashboard | Beanola Admissions"
        description="View your Beanola application progress, pending actions, interview updates, and key admission milestones."
        path="/student/dashboard"
        noindex
      />
    <PageShell
      title={`Welcome back, ${firstName}`}
      eyebrow="Student Workspace"
      subtitle="Your next required action, application status, documents, payments, and interviews are kept in one workspace."
      maxWidth="7xl"
      tone="student"
      metrics={[
        {
          label: 'Submitted applications',
          value: submittedApplications.length,
          helper: totalDraftCount > 0 ? `${totalDraftCount} draft${totalDraftCount > 1 ? 's' : ''} still in progress` : 'No draft currently waiting',
        },
        {
          label: 'Profile completion',
          value: `${profileCompletion}%`,
          helper: profileMissingFields.length > 0 ? `${profileMissingFields.length} details still missing` : 'Profile ready for support workflows',
        },
        {
          label: 'Action needed',
          value: (() => {
            const count = (hasPendingPayment ? 1 : 0) + (hasScheduledInterview ? scheduledInterviews.length : 0)
            return count > 0 ? `${count} item${count > 1 ? 's' : ''}` : 'Clear'
          })(),
          helper: hasPendingPayment && hasScheduledInterview
            ? 'Payment and interview need attention'
            : hasPendingPayment
              ? 'Application fee needs attention'
              : hasScheduledInterview
                ? 'Upcoming interview activity'
                : 'No outstanding actions right now',
        },
      ]}
      actions={
        <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end sm:gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => forceRefresh()}
            disabled={isRefreshing || isManualRefreshing}
            className="min-h-11 flex-1 gap-2 sm:flex-none"
            loading={isRefreshing || isManualRefreshing}
          >
            {!(isRefreshing || isManualRefreshing) && <RefreshCw className="h-4 w-4" />}
            {(isRefreshing || isManualRefreshing) ? 'Refreshing...' : 'Refresh'}
          </Button>
          <div className="hidden sm:block">
            <ProfileCompletionBadge completionPercentage={profileCompletion} missingFields={profileMissingFields} />
          </div>
        </div>
      }
    >
        {isInitialLoading ? (
          <DashboardSkeleton />
        ) : (
          <StaggerContainer className="space-y-6 sm:space-y-8">
            {isRefreshing && (
              <div className="overflow-hidden rounded-full" role="status" aria-live="polite">
                <div className="h-1 w-full overflow-hidden rounded-full bg-primary/10">
                  <div className="h-full w-1/3 animate-[shimmer_1.5s_ease-in-out_infinite] rounded-full bg-primary/40" />
                </div>
                <span className="sr-only">Refreshing dashboard data</span>
              </div>
            )}

            {sessionError && <Banner variant="error">{sessionError}</Banner>}

            <StaggerItem>
            <ErrorBoundary level="section" onError={(error, errorInfo) => reportError(error, { component: 'StudentDashboard.NextActionCards', ...errorInfo })}>
              <NextActionCard
                totalDraftCount={totalDraftCount}
                hasPendingPayment={hasPendingPayment}
                hasScheduledInterview={hasScheduledInterview}
                scheduledInterviewsCount={scheduledInterviews.length}
                submittedCount={submittedApplications.length}
              />
            </ErrorBoundary>
            </StaggerItem>

            <StaggerItem>
            <ErrorBoundary level="section" onError={(error, errorInfo) => reportError(error, { component: 'StudentDashboard.ContinueApplication', ...errorInfo })}>
            <ContinueApplication />
            </ErrorBoundary>
            </StaggerItem>

            <StaggerItem>
            <ErrorBoundary level="section" onError={(error, errorInfo) => reportError(error, { component: 'StudentDashboard.ApplicationsGrid', ...errorInfo })}>
              <ApplicationsGrid
                submittedApplications={submittedApplications}
                applications={applications}
                intakes={intakes}
                applicationsError={applicationsError}
                intakesError={intakesError}
                interviewsError={interviewsError}
                totalDraftCount={totalDraftCount}
                hasPendingPayment={hasPendingPayment}
                hasScheduledInterview={hasScheduledInterview}
                isClearingAllDrafts={isClearingAllDrafts}
                profile={profile}
                user={user}
                metadata={metadata}
                onRetry={() => loadDashboardData()}
                onClearAllDrafts={handleClearAllDrafts}
              />
            </ErrorBoundary>
            </StaggerItem>

            <StaggerItem>
            <ErrorBoundary level="section" onError={(error, errorInfo) => reportError(error, { component: 'StudentDashboard.StatusOverview', ...errorInfo })}>
            <DashboardStatusOverview applications={applications} />
            </ErrorBoundary>
            </StaggerItem>
          </StaggerContainer>
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
