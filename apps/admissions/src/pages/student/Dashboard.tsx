/**
 * The student dashboard, composed around the next required action
 * (admissions-v2 task 11.1).
 *
 * Requirements: R13.1, R16.1, R16.4-R16.8. Findings: STU-04, STU-12, MAINT-02.
 *
 * The order on the page is the order of the student's obligations: what the
 * platform says they must do, then the draft they can finish, then the
 * applications the school holds. Nothing above the next action, and no number the
 * student cannot act on.
 *
 * What this page stopped doing:
 *
 * - **deciding the next action itself.** It derived one from three browser
 *   booleans (a draft exists, a payment looks unpaid, an interview is scheduled)
 *   and rendered the result as the page's headline. It now renders task 6.5's
 *   readiness and task 10.3's enrollment readiness — the same evaluations the
 *   submit and confirm commands re-run under their row locks.
 * - **the three-metric header.** "Submitted applications", "Profile completion",
 *   "Action needed" occupied the first viewport above the action, and two of the
 *   three were counts of things (R16.5's "redundant metrics", MAINT-02).
 * - **`DashboardStatusOverview`.** Four more metric tiles, a "Latest Application
 *   Status" card duplicating the row beneath it, and a payment alert duplicating
 *   the payment action. §3 of the evidence walks each.
 * - **clearing every draft.** `executeClearAllDrafts` deleted all of them at once;
 *   deletion is now per-draft in `DraftManagementCard` (STU-12, task 6.3).
 */
import { useCallback, useEffect, useRef, useState, useMemo, useReducer } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import type { Application, ApplicationInterview } from '@/types/database'
import { interviewsService } from '@/services/interviews'
import { Button } from '@/components/ui/Button'
import { sanitizeForLog, sanitizeForDisplay } from '@/lib/sanitize'
import { getUserMetadata, getBestValue } from '@/hooks/useProfileAutoPopulation'
import { clearWizardDraftCache } from '@/lib/draftLocalCache'
import { applicationService, sortApplicationsByActivity } from '@/services/applications'
import { catalogService } from '@/services/catalog'
import { RefreshCw } from 'lucide-react'

import { useToastStore } from '@/hooks/useToast'
import { Banner } from '@/components/ui/Banner'
import { PageShell } from '@/components/ui/PageShell'
import { useStudentDashboardRefresh } from '@/hooks/useManualRefresh'
import { useStudentDashboardPolling, type StudentDashboardData } from '@/hooks/useStudentDashboardPolling'

import { StaggerContainer, StaggerItem } from '@/components/motion/stagger'
import { getDisplayName } from '@/lib/userDisplayName'
import { Seo } from '@/components/seo/Seo'
import { usePortalBrand } from '@/hooks/usePortalBrand'
import { brandedPageTitle } from '@/lib/tenantBrandCopy'
import { applicationSessionManager } from '@/lib/applicationSession'
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
} from './lib/dashboardReducer'
import { NextActionPanel } from '@/components/student/dashboard/NextActionPanel'
import { DraftManagementCard } from '@/components/student/dashboard/DraftManagementCard'
import { ApplicationsGrid } from '@/components/student/dashboard/ApplicationsGrid'
import { useStudentNextAction } from '@/hooks/useStudentNextAction'
import { studentApplicationNewPath } from '@/routes/routeRegistry'

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
  const { brandName } = usePortalBrand()
  const { profile } = useProfileQuery()
  const queryClient = useQueryClient()
  const draftRevision = useDraftRevision()

  useEffect(() => { onDashboardMount(user?.id) }, [user?.id])

  const [state, dispatch] = useReducer(dashboardReducer, initialDashboardState)
  const {
    applications, intakes, scheduledInterviews,
    isInitialLoading, isRefreshing,
    applicationsError, intakesError, interviewsError, sessionError,
    hasDraft,
  } = state

  // This useState MUST remain for source-level test assertion compatibility
  const [isPollingEnabled, setIsPollingEnabled] = useState(false)

  const hasLoadedRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const loadRequestIdRef = useRef(0)
  const loadDashboardDataRef = useRef<() => Promise<void>>(async () => {})
  const initialLoadCompleteRef = useRef(false)
  const scheduledRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
            // R10.10: the local snapshot for this one application is stale (its
            // server record is no longer a draft). Clear only that application's
            // cache — never another draft or any payment-recovery record.
            clearWizardDraftCache({
              userId: user?.id ?? null,
              applicationId: String(localDraft.applicationId),
            })
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

  const firstName = useMemo(() => {
    const name = sanitizeForDisplay(getDisplayName(profile, {
      ...user,
      full_name: getBestValue(user?.full_name, metadata.full_name),
    }))
    return name?.split(' ')[0] || 'Student'
  }, [profile, metadata, user])

  const { draftApplications, submittedApplications, hasLocalOnlyDraft } = useMemo(() => {
    const drafts = sortApplicationsByActivity(applications.filter(app => app.status === 'draft'))
    const submitted = sortApplicationsByActivity(applications.filter(app => app.status !== 'draft'))
    return {
      draftApplications: drafts,
      submittedApplications: submitted,
      hasLocalOnlyDraft: hasDraft && drafts.length === 0,
    }
  }, [applications, hasDraft])

  /**
   * The order the next-action subject is selected from: the draft the student is
   * working on, then their most recently active application. Both halves of the
   * list are already in activity order.
   */
  const nextActionCandidates = useMemo(
    () => [...draftApplications, ...submittedApplications],
    [draftApplications, submittedApplications],
  )

  const { nextAction, isLoading: nextActionLoading, readinessUnavailable } = useStudentNextAction(
    nextActionCandidates,
    { enabled: !isInitialLoading },
  )

  const handleDraftDeleted = useCallback((applicationId: string) => {
    applyDeletedDraftRemoval([applicationId])
    scheduleDashboardReload()
  }, [applyDeletedDraftRemoval, scheduleDashboardReload])

  return (
    <>
      <Seo
        title={brandedPageTitle('Student Dashboard', brandName)}
        description="View your application progress, pending actions, interview updates, and key admission milestones."
        path="/student/dashboard"
        siteName={brandName}
        noindex
      />
    {/*
      No header `actions` (GATE-13.3-16, 13.6 §8.1 item L6; R13.1, R16.1, R16.3,
      R16.5).

      `PageShell` renders `actions` *between* the page title and the children, and
      below `md` it stacks them on their own row — so the Refresh control cost
      **60 px** (a 16 px gap plus a 44 px full-width button) directly above the
      student's next action at 320 px. Task 13.3 measured the consequence by
      *looking at a screenshot* after every number in its own report had passed: the
      primary action spanned 457.159-525.159 in a 568 px viewport while the fixed
      bottom navigation starts at 507, so **18.159 px — 26.70 % of the control, and
      the second line of its own label — sat behind the bar** (30.21 % on Pixel 5).
      The centre-point hit test was right that it was tappable; R16.3's clause is
      *"SHALL not overlap, obscure, or compete"*, which is a question about the box.

      Trimming padding would have bought the ~19 px needed and would have been
      re-broken by the next slightly longer server label. This is the ordering rule
      the requirement already states: R16.5 puts passive controls *after* the next
      required action, and a Refresh button is not the student's next action. It is
      now the first control below the panel — same page, same behaviour, one tap
      away, and no longer between the student and what they came to do.

      Measured after the change: the action clears the bar with room to spare, and
      the screenshots in this batch's evidence directory were reviewed by eye as
      well as by assertion, because that is how this finding was found.
    */}
    <PageShell
      title={`Welcome back, ${firstName}`}
      maxWidth="4xl"
      tone="student"
    >
        {isInitialLoading ? (
          <DashboardSkeleton />
        ) : (
          <div className="relative">
            {/*
              The refresh indicator is out of flow (GATE-13.3-07, 13.6 §8.1 item L6;
              R16.7).

              It used to be the first child of the `space-y-6` stack, so every time
              polling started or finished it inserted and removed ~28 px (a 4 px bar
              plus a 24 px gap) at the top of the page and moved everything below —
              and polling is enabled the moment the initial load completes, which is
              the same ~600 ms window task 13.3's CLS entries land in. Absolutely
              positioned it cannot contribute to layout shift at all, and the bar
              still appears in the same place.

              `role="status" aria-live="polite"` and the `sr-only` sentence are
              unchanged, so the announcement a screen-reader user gets is the same.
            */}
            {isRefreshing && (
              <div
                className="pointer-events-none absolute inset-x-0 -top-2 z-10 overflow-hidden rounded-full"
                role="status"
                aria-live="polite"
              >
                <div className="h-1 w-full overflow-hidden rounded-full bg-primary/10">
                  <div className="h-full w-1/3 animate-[shimmer_1.5s_ease-in-out_infinite] rounded-full bg-primary/40" />
                </div>
                <span className="sr-only">Refreshing dashboard data</span>
              </div>
            )}

            <StaggerContainer className="space-y-6 sm:space-y-8">
            {sessionError && <Banner variant="error">{sessionError}</Banner>}

            {/*
              R13.1: the next required action, before anything passive. Its content
              is the platform's (task 6.5's readiness blockers and allowed next
              actions, task 10.3's enrollment readiness), never derived here.
            */}
            <StaggerItem>
            <ErrorBoundary level="section" onError={(error, errorInfo) => reportError(error, { component: 'StudentDashboard.NextActionPanel', ...errorInfo })}>
              <NextActionPanel
                nextAction={nextAction}
                isLoading={nextActionLoading}
                readinessUnavailable={readinessUnavailable}
                applicationCount={applications.length}
                onRetry={() => { void loadDashboardData() }}
                startApplicationHref={studentApplicationNewPath()}
              />
            </ErrorBoundary>
            </StaggerItem>

            {/*
              Refresh, after the action rather than above it — see the block comment
              on `PageShell` above (GATE-13.3-16). `w-auto` at every width: a
              full-width utility button reads as a primary action, which is the
              competition R16.3 forbids.
            */}
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => forceRefresh()}
                disabled={isRefreshing || isManualRefreshing}
                className="min-h-touch w-auto gap-2"
                loading={isRefreshing || isManualRefreshing}
              >
                {!(isRefreshing || isManualRefreshing) && <RefreshCw className="h-4 w-4" aria-hidden="true" />}
                {(isRefreshing || isManualRefreshing) ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>

            {/*
              Scoped draft management (STU-12, task 6.3): one row per draft, and
              deletion addresses that one application. There is no clear-all.
            */}
            <StaggerItem>
            <ErrorBoundary level="section" onError={(error, errorInfo) => reportError(error, { component: 'StudentDashboard.DraftManagement', ...errorInfo })}>
              <DraftManagementCard
                drafts={draftApplications}
                hasLocalOnlyDraft={hasLocalOnlyDraft}
                userId={user?.id}
                onDeleted={handleDraftDeleted}
              />
            </ErrorBoundary>
            </StaggerItem>

            <StaggerItem>
            <ErrorBoundary level="section" onError={(error, errorInfo) => reportError(error, { component: 'StudentDashboard.ApplicationsGrid', ...errorInfo })}>
              <ApplicationsGrid
                submittedApplications={submittedApplications}
                intakes={intakes}
                applicationsError={applicationsError}
                intakesError={intakesError}
                interviewsError={interviewsError}
                hasDraft={draftApplications.length > 0 || hasLocalOnlyDraft}
                profile={profile}
                user={user}
                metadata={metadata}
                onRetry={() => loadDashboardData()}
              />
            </ErrorBoundary>
            </StaggerItem>
            </StaggerContainer>
          </div>
        )}
    </PageShell>
    </>
  );
}
