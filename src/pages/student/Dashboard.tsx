// @ts-nocheck
import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
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
import { getUserMetadata, getBestValue, calculateProfileCompletion } from '@/hooks/useProfileAutoPopulation'
import { ProfileCompletionBadge } from '@/components/ui/ProfileAutoPopulationIndicator'
import { clearAllDraftData } from '@/lib/draftCleanup'
import { applicationService } from '@/services/applications'
import { catalogService } from '@/services/catalog'
import { DashboardStatusOverview } from '@/components/student/DashboardStatusOverview'
import { ApplicationTimeline } from '@/components/student/ApplicationTimeline'
import { QuickActions } from '@/components/student/QuickActions'
import { User, FileText, Clock, CheckCircle, XCircle, Plus, X, RefreshCw, Calendar } from 'lucide-react'

import { PageHeader } from '@/components/ui/PageHeader'
import { SectionCard } from '@/components/ui/SectionCard'
import { useToastStore } from '@/components/ui/Toast'
import { ConfirmAlertDialog } from '@/components/ui/alert-dialog'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { Container } from '@/components/ui/Container'
import { UnifiedLoader } from '@/components/ui/UnifiedLoader'
import { useStudentDashboardRefresh } from '@/hooks/useManualRefresh'
import { useStudentDashboardPolling } from '@/hooks/useStudentDashboardPolling'
import { useApplicationUpdates } from '@/hooks/useRealtime'
import { useQueryClient } from '@tanstack/react-query'
import { staggerChild, animateClasses } from '@/lib/animations'
import { getDisplayName } from '@/utils/userDisplayName'
import { Seo } from '@/components/seo/Seo'
import { applicationSessionManager } from '@/lib/applicationSession'
import { requiresStudentPaymentAction } from '@/lib/paymentStatus'

export default function StudentDashboard() {
  const { user } = useAuth()
  const { profile } = useProfileQuery()
  const [applications, setApplications] = useState<Application[]>([])
  const [intakes, setIntakes] = useState<Intake[]>([])
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [hasDraft, setHasDraft] = useState(false)
  const [isClearingAllDrafts, setIsClearingAllDrafts] = useState(false)
  const [scheduledInterviews, setScheduledInterviews] = useState<ApplicationInterview[]>([])
  const hasLoadedRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const confirmDialog = useConfirmDialog()
  
  // Manual refresh hook for React Query cache invalidation
  const { forceRefresh, isRefreshing: isManualRefreshing } = useStudentDashboardRefresh({
    onSuccess: () => {
      // Also reload local data after cache invalidation
      loadDashboardData()
    },
    onError: (error) => {
      console.error('Manual refresh failed:', error)
      useToastStore.getState().addToast('error', 'Failed to refresh data')
    }
  })

  // Polling-based updates for dashboard (replaces Supabase Realtime)
  // Requirements: 1.1, 1.2 - Dashboard data refresh via polling
  useStudentDashboardPolling({
    onApplicationChange: () => {
      // Reload local data when application changes are detected
      loadDashboardData()
    },
    onDataChange: () => {
      // Could show a toast or update notification badge here
      console.log('[StudentDashboard] Data updated via polling')
    }
  })

  // Realtime application status updates via useRealtime polling
  // Requirements: 8.1, 8.2 - Subscribe to application_update events and refresh dashboard
  const queryClient = useQueryClient()
  useApplicationUpdates(
    useCallback((data: Record<string, unknown>) => {
      // Invalidate React Query cache to trigger refetch of dashboard data
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      queryClient.invalidateQueries({ queryKey: ['student-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['student-dashboard-polling'] })
      // Also reload local state
      loadDashboardData()
    }, [queryClient])
  )

  useEffect(() => {
    if (user) {
      loadDashboardData()
    }

    // Cleanup function to abort pending requests
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [user, profile])

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
      await loadDashboardData()
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

      await loadDashboardData()
    }

    const handleApplicationUpdated = async () => {
      await loadDashboardData()
    }

    const handleApplicationCreated = async () => {
      await loadDashboardData()
    }

    const handleDraftSaved = async () => {
      await handleStorageChange()
      await loadDashboardData()
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
  }, [user, profile?.user_id])

  const loadDashboardData = async () => {
    const isInitialLoad = !hasLoadedRef.current

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

      const localDraft = user
        ? await applicationSessionManager.getLocalWizardDraft(user.id)
        : null

      if (localDraft) {
        setHasDraft(true)
      } else {
        setHasDraft(false)
      }

      const draftResponse = await applicationService.list({
        page: 0,
        pageSize: 1,
        status: 'draft',
        sortBy: 'date',
        sortOrder: 'desc',
        mine: true
      })

      // Check if request was aborted
      if (signal.aborted) return

      if (draftResponse?.applications && draftResponse.applications.length > 0) {
        setHasDraft(true)
      }

      const applicationsResponse = await applicationService.list({
        page: 0,
        pageSize: 50,
        sortBy: 'date',
        sortOrder: 'desc',
        mine: true
      })

      // Check if request was aborted
      if (signal.aborted) return

      const loadedApplications = (applicationsResponse?.applications || []) as Application[]
      setApplications(loadedApplications)

      if (localDraft?.applicationId) {
        const matchingApplication = loadedApplications.find(application => application.id === localDraft.applicationId)
        if (matchingApplication && matchingApplication.status !== 'draft') {
          clearAllDraftData()
          setHasDraft(false)
        }
      }

      const intakesResponse = await catalogService.getIntakes() as { intakes: Intake[] }

      // Check if request was aborted
      if (signal.aborted) return

      setIntakes(intakesResponse.intakes || [])

      // Fetch scheduled interviews for the user's applications
      // Requirements: 2.4, 4.3 - Check for scheduled or rescheduled interviews
      // MIGRATED: Using API client instead of direct Supabase calls
      if (user?.id) {
        try {
          const interviewData = await interviewsService.list()

          // Check if request was aborted
          if (signal.aborted) return

          // Filter for scheduled/rescheduled interviews
          const scheduledOnly = (interviewData?.interviews || []).filter(
            interview => interview.status === 'scheduled' || interview.status === 'rescheduled'
          )
          setScheduledInterviews(scheduledOnly as ApplicationInterview[])
        } catch (interviewError) {
          // Silently handle interview fetch errors - not critical for dashboard
          console.warn('Could not fetch interview data:', interviewError)
          setScheduledInterviews([])
        }
      }
    } catch (error) {
      // Ignore abort errors
      if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('aborted'))) {
        return
      }
      console.error('Error loading dashboard data:', sanitizeForLog(error))
      setError(error instanceof Error ? sanitizeForLog(error.message) : 'Failed to load dashboard data')
    } finally {
      hasLoadedRef.current = true
      if (isInitialLoad) {
        setIsInitialLoading(false)
      } else {
        setIsRefreshing(false)
      }
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-5 w-5 text-success" />
      case 'rejected':
        return <XCircle className="h-5 w-5 text-red-800" />
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
  const profileCompletion = calculateProfileCompletion(profile, metadata)
  const displayName = sanitizeForDisplay(getDisplayName(profile, {
    ...user,
    full_name: getBestValue(user?.full_name, metadata.full_name),
  }))
  const firstName = displayName?.split(' ')[0] || 'Student'

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
  const handleClearAllDrafts = async () => {
    const confirmed = await confirmDialog.confirm({
      title: 'Clear All Drafts',
      message: 'All draft applications will be permanently deleted.',
      confirmText: 'Clear All',
      variant: 'danger'
    })
    if (!confirmed) return
    setIsClearingAllDrafts(true)
    try {
      clearAllDraftData()
      if (user) {
        await draftManager.clearAllDrafts(user.id)
      }
      
      const draftApps = applications.filter(app => app.status === 'draft')
      await Promise.allSettled(
        draftApps.map(app => applicationService.delete(app.id))
      )
      
      setApplications(prev => prev.filter(app => app.status !== 'draft'))
      setHasDraft(false)
      setError('')
      useToastStore.getState().addToast('success', 'All drafts cleared successfully')
    } catch (error) {
      console.error('Clear drafts error:', error)
      const errorMsg = error instanceof Error ? error.message : 'Failed to clear drafts'
      setError(errorMsg)
      useToastStore.getState().addToast('error', errorMsg)
    } finally {
      setIsClearingAllDrafts(false)
    }
  }

  return (
    <>
      <Seo
        title="Student Dashboard | MIHAS-KATC Admissions"
        description="View your MIHAS-KATC application progress, pending actions, interview updates, and key admission milestones."
        path="/student/dashboard"
        noindex
      />
    <div className="safe-area-bottom py-4 sm:py-6 lg:py-8 w-full max-w-full overflow-x-hidden">
      <Container size="lg">
        {isInitialLoading ? (
          <UnifiedLoader
            variant="skeleton"
            size="md"
            label="Loading student dashboard"
            className="py-8"
            skeletonCard
            skeletonLines={4}
          />
        ) : (
          <div className="space-y-6 sm:space-y-8">
            {isRefreshing && (
              <div className="rounded-full bg-white px-6 py-3 shadow-lg animate-fade-in">
                <div className="h-1 w-full overflow-hidden rounded-full bg-blue-100">
                  <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 animate-pulse" />
                </div>
                <span className="sr-only">Refreshing dashboard data</span>
              </div>
            )}

            <PageHeader
              variant="gradient"
              icon={<User style={{ width: 'var(--icon-size)', height: 'var(--icon-size)' }} />}
              title={`Welcome back, ${firstName}`}
              description={
                <span className="flex items-center gap-2">
                  Track your applications, manage drafts, and keep your profile information up to date.
                  {/* Polling status indicator */}
                  <span className="inline-flex items-center gap-1.5">
                    <span className="relative flex">
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" style={{ animationDuration: '2s' }} />
                    </span>
                    <span className="text-xs font-medium text-green-600 dark:text-green-400">Live</span>
                  </span>
                </span>
              }
              actions={
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => forceRefresh()}
                    disabled={isRefreshing || isManualRefreshing}
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${(isRefreshing || isManualRefreshing) ? 'animate-spin' : ''}`} />
                    {(isRefreshing || isManualRefreshing) ? 'Refreshing...' : 'Refresh'}
                  </Button>
                  <ProfileCompletionBadge completionPercentage={profileCompletion} />
                </div>
              }
            />

            {error && (
              <div
                className={`rounded-2xl border border-red-300 bg-red-50 px-6 py-5 text-red-800 shadow-lg ${animateClasses.slideUp}`}
              >
                <div className="flex items-start gap-3">
                  <XCircle className="h-6 w-6 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold">Dashboard Error</p>
                    <p className="text-sm text-destructive/80">{error}</p>
                  </div>
                  <button
                    onClick={() => setError('')}
                    className="flex-shrink-0 p-1 rounded-md hover:bg-red-100 transition-colors"
                    aria-label="Dismiss error"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}

            {/* Status Overview with 8starlabs StatusIndicator */}
            <DashboardStatusOverview 
              applications={applications}
              totalDraftCount={totalDraftCount}
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
                {submittedApplications.length === 0 ? (
                  totalDraftCount > 0 ? (
                    <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
                      <div className="text-warning"><Clock className="w-16 h-16" /></div>
                      <div className="space-y-2">
                        <h3 className="text-xl sm:text-2xl font-semibold text-foreground">Your application is still in draft</h3>
                        <p className="text-foreground">
                          Continue the saved draft above when you are ready. Submitted applications will appear here once you complete the full flow.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
                      <div className="text-foreground"><FileText className="w-16 h-16" /></div>
                      <div className="space-y-2">
                        <h3 className="text-xl sm:text-2xl font-semibold text-foreground">No applications yet</h3>
                        <p className="text-foreground">
                          Start your journey by submitting your first application. We'll guide you every step of the way.
                        </p>
                      </div>
                      <Link to="/student/application-wizard">
                        <Button className="bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg hover:from-blue-700 hover:to-purple-700">
                          <Plus className="mr-2 h-5 w-5" />
                          New Application
                        </Button>
                      </Link>
                    </div>
                  )
                ) : (
                  <div className="divide-y divide-border">
                    {submittedApplications.map((application, index) => (
                      <div
                        key={application.id}
                        className={`px-6 py-6 transition-colors hover:bg-blue-50 border-l-4 border-l-transparent hover:border-l-blue-500 ${animateClasses.slideUp}`}
                        style={staggerChild(index, 50)}
                      >
                        <div className="space-y-4">
                          {/* Header */}
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <div className="flex-shrink-0 mt-1">{getStatusIcon(application.status)}</div>
                              <div className="flex-1 min-w-0">
                                <h4 className="text-lg font-bold text-foreground break-words leading-tight">
                                  {getProgramName(application.program)}
                                </h4>
                                <p className="text-sm font-medium text-muted-foreground mt-1">
                                  Application #{application.application_number}
                                </p>
                              </div>
                            </div>
                            <span className={`rounded-full px-4 py-2 text-sm font-bold whitespace-nowrap ${getStatusColor(application.status)}`}>
                              {application.status.replace('_', ' ').toUpperCase()}
                            </span>
                          </div>

                          {/* Details Grid */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <span className="font-medium text-muted-foreground">Intake:</span>
                              <span className="text-foreground break-words">{getIntakeName(application.intake)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <span className="font-medium text-muted-foreground">Submitted:</span>
                              <span className="text-foreground">{formatDate(application.submitted_at)}</span>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-gray-100">
                            <div className="flex-1">
                              <DocumentButtons 
                                applicationId={application.id}
                                applicationNumber={application.application_number}
                                status={application.status}
                                paymentStatus={application.payment_status}
                              />
                            </div>
                            <Link to={`/student/application/${application.id}`} className="sm:w-auto">
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full sm:w-auto border-primary text-primary hover:bg-primary hover:text-white font-medium"
                              >
                                View Details
                              </Button>
                            </Link>
                          </div>
                        </div>
                      </div>
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
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4 w-full border-primary text-primary hover:bg-primary hover:text-white"
                    >
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
                    {intakes.slice(0, 3).map((intake, index) => (
                      <div
                        key={intake.id}
                        className={`rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 ${animateClasses.slideUp}`}
                        style={staggerChild(index, 100)}
                      >
                        <p className="text-sm font-semibold text-foreground">{intake.name}</p>
                        <p className="text-xs font-semibold text-orange-700">Deadline: {formatDate(intake.application_deadline)}</p>
                      </div>
                    ))}
                    {intakes.length === 0 && (
                      <p className="rounded-xl bg-muted px-4 py-4 text-center text-sm text-foreground">
                        No upcoming deadlines yet. Check back soon.
                      </p>
                    )}
                  </div>
                </SectionCard>

                {/* Application Timeline with 8starlabs Timeline component */}
                <ApplicationTimeline applications={applications} />

                {/* Quick Actions component */}
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
      </Container>
    </div>
      </>
  );
}
