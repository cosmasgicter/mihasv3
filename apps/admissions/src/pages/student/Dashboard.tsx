import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import type { Application, Intake, ApplicationInterview } from '@/types/database'
import { interviewsService } from '@/services/interviews'
import { Button } from '@/components/ui/Button'
import { ContinueApplication } from '@/components/application/ContinueApplication'
import { formatDate } from '@/lib/utils'
import { draftManager } from '@/lib/draftManager'
import { sanitizeForLog, sanitizeForDisplay } from '@/lib/sanitize'
import { getUserMetadata, getBestValue, calculateProfileCompletion, getProfileMissingFields } from '@/hooks/useProfileAutoPopulation'
import { ProfileCompletionBadge } from '@/components/ui/ProfileAutoPopulationIndicator'
import { clearAllDraftData } from '@/lib/draftManager'
import { applicationService, sortApplicationsByActivity, type PaginatedApplicationsResponse } from '@/services/applications'
import { catalogService } from '@/services/catalog'
import { DashboardStatusOverview } from '@/components/student/DashboardStatusOverview'
import { ApplicationTimeline } from '@/components/student/ApplicationTimeline'
import { QuickActions } from '@/components/student/QuickActions'
import { ApplicationListItem } from '@/components/student/ApplicationListItem'
import { User, FileText, Clock, RefreshCw, Calendar, AlertCircle, CheckCircle } from 'lucide-react'

import { SectionCard } from '@/components/ui/SectionCard'
import { useToastStore } from '@/hooks/useToast'
import { ConfirmAlertDialog } from '@/components/ui/alert-dialog'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { Banner } from '@/components/ui/Banner'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageShell } from '@/components/ui/PageShell'
import { useStudentDashboardRefresh } from '@/hooks/useManualRefresh'
import { useStudentDashboardPolling, type StudentDashboardData } from '@/hooks/useStudentDashboardPolling'

import { staggerChild, animateClasses } from '@/lib/animations'
import { getDisplayName } from '@/lib/userDisplayName'
import { Seo } from '@/components/seo/Seo'
import { applicationSessionManager } from '@/lib/applicationSession'
import { requiresStudentPaymentAction } from '@/lib/paymentStatus'
import { logApiError } from '@/lib/apiErrorLogger'

import { DashboardSkeleton } from '@/components/ui'
import { onDashboardMount } from '@/lib/speculativePrefetch'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { reportError } from '@/lib/errorReporter'

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
  const queryClient = useQueryClient()

  // Speculative prefetch: preload catalog data + wizard chunk during idle time
  useEffect(() => {
    onDashboardMount(user?.id)
  }, [user?.id])

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
  const [sessionError, setSessionError] = useState('')
  const [isPollingEnabled, setIsPollingEnabled] = useState(false)
  const hasLoadedRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const loadRequestIdRef = useRef(0)
  const loadDashboardDataRef = useRef<() => Promise<void>>(async () => {})
  const initialLoadCompleteRef = useRef(false)
  const scheduledRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const deletedDraftIdsRef = useRef(new Set<string>())
  const deletedDraftSuppressionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const confirmDialog = useConfirmDialog()

  const suppressDeletedDraftIds = useCallback((ids: string[]) => {
    const cleanIds = ids.filter((id) => typeof id === 'string' && id.length > 0)
    if (cleanIds.length === 0) return

    cleanIds.forEach((id) => deletedDraftIdsRef.current.add(id))
    if (deletedDraftSuppressionTimerRef.current) {
      clearTimeout(deletedDraftSuppressionTimerRef.current)
    }
    deletedDraftSuppressionTimerRef.current = setTimeout(() => {
      deletedDraftIdsRef.current.clear()
      deletedDraftSuppressionTimerRef.current = null
    }, 30_000)
  }, [])

  const filterSuppressedDrafts = useCallback((items: Application[]) => (
    items.filter((application) => !deletedDraftIdsRef.current.has(application.id))
  ), [])

  const removeDraftsFromApplicationCaches = useCallback((ids: string[]) => {
    const idsToRemove = new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))
    if (idsToRemove.size === 0) return

    queryClient.setQueriesData<PaginatedApplicationsResponse>(
      { queryKey: ['applications'] },
      (current) => {
        if (!current || !Array.isArray(current.applications)) {
          return current
        }

        const applications = current.applications.filter((application) => !idsToRemove.has(application.id))
        return {
          ...current,
          applications,
          totalCount: Math.max(0, (current.totalCount ?? current.applications.length) - (current.applications.length - applications.length)),
        }
      },
    )

    idsToRemove.forEach((id) => {
      queryClient.removeQueries({ queryKey: ['applications', 'detail', id] })
      queryClient.removeQueries({ queryKey: ['application-detail', id] })
    })
  }, [queryClient])

  const applyDeletedDraftRemoval = useCallback((ids: string[]) => {
    const cleanIds = ids.filter((id) => typeof id === 'string' && id.length > 0)
    if (cleanIds.length === 0) return

    suppressDeletedDraftIds(cleanIds)
    removeDraftsFromApplicationCaches(cleanIds)
    setApplications(prev => prev.filter(app => !cleanIds.includes(app.id)))
  }, [removeDraftsFromApplicationCaches, suppressDeletedDraftIds])

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
      return filterSuppressedDrafts(sortApplicationsByActivity(data.applications.map((application) => ({
        ...(previousById.get(application.id) ?? {}),
        ...application,
      })) as Application[]))
    })

    const hasServerDraft = filterSuppressedDrafts(data.applications as Application[]).some((application) => application.status === 'draft')
    if (hasServerDraft) {
      setHasDraft(true)
    } else if (user?.id) {
      void applicationSessionManager.getLocalWizardDraft(user.id).then((localDraft) => {
        setHasDraft(Boolean(localDraft))
      })
    } else {
      setHasDraft(false)
    }

    setApplicationsError('')
  }, [filterSuppressedDrafts, user?.id])


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
    enabled: isPollingEnabled,
    onDataChange: syncApplicationsFromPolling,
  })


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
      if (deletedDraftSuppressionTimerRef.current) {
        clearTimeout(deletedDraftSuppressionTimerRef.current)
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

    const handleDraftCleared = async (event?: Event) => {
      const detail = (event as CustomEvent<{ deletedIds?: string[]; blockedIds?: string[] }> | undefined)?.detail
      const deletedIds = detail?.deletedIds ?? []
      const blockedIds = detail?.blockedIds ?? []
      if (deletedIds.length > 0) {
        applyDeletedDraftRemoval(deletedIds)
      }

      setHasDraft(blockedIds.length > 0)
      setApplications(prev => {
        if (deletedIds.length > 0) {
          return prev.filter(app => !deletedIds.includes(app.id))
        }
        if (detail) {
          return prev
        }
        return prev.filter(app => app.status !== 'draft')
      })
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
  }, [applyDeletedDraftRemoval, scheduleDashboardReload, user])

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
      setIsPollingEnabled(false)
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
      // Keep section-level failures visible until that specific section
      // succeeds again. Clearing them optimistically at the start of every
      // refresh makes intermittent failures disappear before the user can
      // understand what went wrong.

      // Keep first paint focused on the primary dashboard data.
      const [localDraftResult, applicationsResult, interviewsResult] = await Promise.allSettled([
        // Local draft check (runs in parallel instead of blocking)
        applicationSessionManager.getLocalWizardDraft(user.id),
        // Applications: single call for all (draft check merged into full list)
        applicationService.list({
          page: 1,
          pageSize: 50,
          sortBy: 'date',
          sortOrder: 'desc',
          mine: true
        }),
        // Interviews
        user.id ? interviewsService.list() : Promise.resolve(null),
      ])

      void catalogService.getIntakes()
        .then((response) => {
          if (!isLatestRequest() || signal.aborted) return
          setIntakes(response?.intakes || [])
          setIntakesError('')
        })
        .catch((intakeError) => {
          if (!isLatestRequest() || signal.aborted) return
          if (intakeError instanceof Error && (intakeError.name === 'AbortError' || intakeError.message.includes('aborted'))) return
          logApiError('student-dashboard', '/api/v1/catalog/intakes/', intakeError)
          setIntakesError(`Failed to load intakes. ${intakeError instanceof Error ? intakeError.message : 'Please try again.'}`)
        })

      if (!isLatestRequest() || signal.aborted) return

      // Process local draft result
      const localDraft = localDraftResult.status === 'fulfilled' ? localDraftResult.value : null
      if (localDraft) {
        setHasDraft(true)
      } else {
        setHasDraft(false)
      }

      // --- Process applications result ---
      if (applicationsResult.status === 'fulfilled') {
        const applicationsResponse = applicationsResult.value
        const loadedApplications = filterSuppressedDrafts(sortApplicationsByActivity((applicationsResponse?.applications || []) as Application[]))
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
      const results = [applicationsResult, interviewsResult]
      const failedResults = results.filter(r => r.status === 'rejected')
      const all403 = failedResults.length === results.length &&
        failedResults.every(r => is403Error((r as PromiseRejectedResult).reason))

      if (all403 && isLatestRequest() && !signal.aborted) {
        // All sources returned 403 — show error banner instead of redirecting
        setTimeout(() => {
          setSessionError('Unable to load dashboard data. Please try refreshing the page.')
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
        setIsPollingEnabled(true)
      } else {
        setIsRefreshing(false)
      }
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
    const submittedApps = sortApplicationsByActivity(applications.filter(app => app.status !== 'draft'))
    const hasLocalOnly = hasDraft && draftApps.length === 0
    const draftCount = draftApps.length + (hasLocalOnly ? 1 : 0)

    const pendingPayment = applications.some(app =>
      requiresStudentPaymentAction(app.payment_status)
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

      const draftIdsBeforeDelete = applications
        .filter((application) => application.status === 'draft')
        .map((application) => application.id)
      const deleteResult = await draftManager.clearAllDrafts(user.id)
      const deletedIds = deleteResult.deletedIds?.length ? deleteResult.deletedIds : (
        deleteResult.success ? draftIdsBeforeDelete : []
      )

      if (deletedIds.length > 0) {
        applyDeletedDraftRemoval(deletedIds)
      }

      if (!deleteResult.success) {
        if (deleteResult.code === 'DRAFT_HAS_PAYMENT_ACTIVITY') {
          const message = 'Some drafts have payment activity and cannot be deleted. Continue the application or contact admissions for help.'
          setApplicationsError('')
          setHasDraft(true)
          useToastStore.getState().warning('Draft protected', message)
          await loadDashboardDataRef.current()
          return
        }

        const errorMessage = deleteResult.error || 'Failed to clear all drafts from the server'
        setApplicationsError(errorMessage)
        useToastStore.getState().addToast('error', errorMessage)
        // Still reload to reflect partial cleanup
        await loadDashboardDataRef.current()
        return
      }

      // Clear local state BEFORE reloading so the reload doesn't re-set hasDraft from stale storage
      if (deletedIds.length === 0) {
        setApplications(prev => prev.filter(app => app.status !== 'draft'))
      }
      setHasDraft(false)
      setApplicationsError('')
      useToastStore.getState().addToast('success', 'All drafts cleared successfully')

      // Reload dashboard data to get fresh server state
      await loadDashboardDataRef.current()
    } catch (error) {
      logApiError('student-dashboard', '/api/v1/applications/ (clear drafts)', error)
      const errorMsg = error instanceof Error ? error.message : 'Failed to clear drafts'
      setApplicationsError(errorMsg)
      useToastStore.getState().addToast('error', errorMsg)
    } finally {
      setIsClearingAllDrafts(false)
    }
  }, [applyDeletedDraftRemoval, user, applications, confirmDialog])

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
          <div className="space-y-6 sm:space-y-8">
            {isRefreshing && (
              <div className="overflow-hidden rounded-full" role="status" aria-live="polite">
                <div className="h-1 w-full overflow-hidden rounded-full bg-primary/10">
                  <div className="h-full w-1/3 animate-[shimmer_1.5s_ease-in-out_infinite] rounded-full bg-primary/40" />
                </div>
                <span className="sr-only">Refreshing dashboard data</span>
              </div>
            )}

            {sessionError && (
              <Banner variant="error">
                {sessionError}
              </Banner>
            )}

            <ErrorBoundary level="section" onError={(error, errorInfo) => reportError(error, { component: 'StudentDashboard.NextActionCards', ...errorInfo })}>
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next action</p>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  totalDraftCount > 0
                    ? 'bg-muted text-muted-foreground'
                    : hasPendingPayment
                      ? 'bg-warning/10 text-warning'
                      : hasScheduledInterview
                        ? 'bg-primary/10 text-primary'
                        : submittedApplications.length > 0
                          ? 'bg-success/10 text-success'
                          : 'bg-muted text-muted-foreground'
                }`}>
                  {totalDraftCount > 0
                    ? <><Clock className="h-3 w-3" /> Draft</>
                    : hasPendingPayment
                      ? <><AlertCircle className="h-3 w-3" /> Payment</>
                      : hasScheduledInterview
                        ? <><Calendar className="h-3 w-3" /> Interview</>
                        : submittedApplications.length > 0
                          ? <><CheckCircle className="h-3 w-3" /> Submitted</>
                          : <><FileText className="h-3 w-3" /> New</>}
                </span>
              </div>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                {totalDraftCount > 0
                  ? 'Finish your saved application draft'
                  : hasPendingPayment
                    ? 'Resolve the pending payment'
                    : hasScheduledInterview
                      ? 'Prepare for your scheduled interview'
                      : submittedApplications.length > 0
                        ? 'Monitor your submitted application'
                        : 'Start a new application'}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {totalDraftCount > 0
                  ? 'Open the draft and complete the remaining fields before submission.'
                  : hasPendingPayment
                    ? 'Review the payment section so admissions can continue processing your application.'
                    : hasScheduledInterview
                      ? 'Check your interview schedule and any required preparation notes.'
                      : submittedApplications.length > 0
                        ? 'Keep an eye on status updates, document requests, and admissions decisions.'
                        : 'Create your first application and save progress as you go.'}
              </p>
              <div className="mt-5">
                <Button variant="primary" size="lg" className="min-h-[48px] px-6 text-base font-semibold shadow-sm" asChild>
                  <Link to={
                    totalDraftCount > 0
                      ? '/student/applications'
                      : hasPendingPayment
                        ? '/student/payment'
                        : hasScheduledInterview
                          ? '/student/interview'
                          : submittedApplications.length > 0
                            ? '/student/application-status'
                            : '/student/applications/new'
                  }>
                    {totalDraftCount > 0
                      ? 'Continue draft'
                      : hasPendingPayment
                        ? 'Resolve payment'
                        : hasScheduledInterview
                          ? 'View interview'
                          : submittedApplications.length > 0
                            ? 'View status'
                            : 'Start application'}
                  </Link>
                </Button>
              </div>
            </div>
            </ErrorBoundary>

            {/* Applications first — most important on mobile */}
            <ErrorBoundary level="section" onError={(error, errorInfo) => reportError(error, { component: 'StudentDashboard.ContinueApplication', ...errorInfo })}>
            <ContinueApplication />
            </ErrorBoundary>

            <ErrorBoundary level="section" onError={(error, errorInfo) => reportError(error, { component: 'StudentDashboard.ApplicationsGrid', ...errorInfo })}>
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
                  description="Keep your details current for faster assistance."
                  icon={<User className="h-5 w-5" />}
                >
                  <div className="grid gap-2.5">
                    <div className="rounded-lg border border-border bg-muted px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Full name</p>
                      <p className="mt-0.5 text-sm font-semibold text-foreground break-words">
                        {sanitizeForDisplay(getBestValue(profile?.full_name, metadata.full_name, user?.email?.split('@')[0]))}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</p>
                      <p className="mt-0.5 text-sm font-semibold text-foreground break-all">{sanitizeForDisplay(user?.email) || 'Not provided'}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Phone</p>
                      <p className="mt-0.5 text-sm font-semibold text-foreground break-words">
                        {sanitizeForDisplay(getBestValue(profile?.phone, metadata.phone, 'Not provided'))}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Residence</p>
                      <p className="mt-0.5 text-sm font-semibold text-foreground break-words">
                        {sanitizeForDisplay(getBestValue(profile?.address, metadata.address, 'Not provided'))}
                      </p>
                    </div>
                  </div>
                  <Link to="/student/settings" className="block">
                    <Button variant="outline" size="sm" className="mt-4 min-h-touch w-full transition-colors duration-150 hover:border-primary/30">
                      Update profile
                    </Button>
                  </Link>
                </SectionCard>

                <SectionCard
                  title="Upcoming deadlines"
                  description="Key dates for upcoming intakes."
                  icon={<Clock className="h-5 w-5" />}
                >
                  <div className="space-y-2.5">
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
                          className={`rounded-lg border border-warning/25 bg-warning/5 px-4 py-3 transition-colors duration-150 hover:border-warning/40 ${animateClasses.slideUp}`}
                          style={staggerChild(index, 100)}
                        >
                          <p className="text-sm font-semibold text-foreground">{intake.name}</p>
                          <p className="mt-0.5 text-xs font-medium text-warning">Deadline: {formatDate(intake.application_deadline)}</p>
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
            </ErrorBoundary>

            {/* Status overview and action cards after the main content */}
            <ErrorBoundary level="section" onError={(error, errorInfo) => reportError(error, { component: 'StudentDashboard.StatusOverview', ...errorInfo })}>
            <DashboardStatusOverview
              applications={applications}
            />
            </ErrorBoundary>

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
