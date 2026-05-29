import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { logger } from '@/lib/logger'
import { useAuth } from '@/contexts/AuthContext'
import { DashboardSkeleton } from '@/components/ui'
import { Button } from '@/components/ui/Button'
import { useAdminDashboardRefresh } from '@/hooks/useManualRefresh'
import { useToastStore } from '@/hooks/useToast'
import { AlertTriangle, BarChart3, Activity, RefreshCw, ClipboardList, FileCheck, CreditCard, Video, TimerReset, CalendarClock, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { Seo } from '@/components/seo/Seo'
import { useAdminDashboardPolling } from '@/hooks/useAdminDashboardPolling'
import { useAdminDashboardLoader } from '@/hooks/admin'
import { RealtimeMetricsDisplay } from '@/components/admin/RealtimeMetricsDisplay'
import { sanitizeForDisplay } from '@/lib/sanitize'
import { getAdminDisplayName, shouldLoadAdminDashboard } from '@/pages/admin/lib/dashboardBootstrap'
import { PageShell } from '@/components/ui/PageShell'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { SectionCard } from '@/components/ui/SectionCard'
import { MetricTile, NeedsAttentionGrid } from '@/components/ui/MetricTile'
import { reportError } from '@/lib/errorReporter'

import { DashboardActivityFeed } from '@/components/admin/dashboard/DashboardActivityFeed'
import { DashboardQuickActions } from '@/components/admin/dashboard/DashboardQuickActions'
import { StaggerContainer, StaggerItem, Crossfade } from '@/components/motion'

import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { onAdminDashboardMount } from '@/lib/speculativePrefetch'

export default function AdminDashboard() {
  const { user, profileLoading: _profileLoading } = useAuth()
  const { profile } = useProfileQuery()

  useEffect(() => { onAdminDashboardMount() }, [])

  const loader = useAdminDashboardLoader(shouldLoadAdminDashboard(user) ? user : null)
  const {
    stats,
    recentActivity,
    error,
    errorIsNetwork,
    lastUpdated,
    hasLoadedOnce,
    isInitialLoading,
    isRefreshing,
    load: loadDashboardStats,
    patchStats,
  } = loader

  const [authRecoveryFailed, setAuthRecoveryFailed] = useState(false)
  useEffect(() => {
    if (user) {
      setAuthRecoveryFailed(false)
      return
    }
    const timer = setTimeout(() => setAuthRecoveryFailed(true), 5000)
    return () => clearTimeout(timer)
  }, [user])

  const { isPolling, error: pollingError, refresh: refreshPolling } = useAdminDashboardPolling({
    enabled: Boolean(user?.id) && hasLoadedOnce,
    pollingInterval: 30000,
    onDataChange: (newStats) => {
      patchStats({
        totalApplications: newStats.totalApplications,
        pendingApplications: newStats.pendingApplications,
        approvedApplications: newStats.approvedApplications,
        conditionallyApprovedApplications: newStats.conditionallyApprovedApplications,
        enrolledApplications: newStats.enrolledApplications,
        acceptedApplications: newStats.acceptedApplications,
        rejectedApplications: newStats.rejectedApplications,
        todayApplications: newStats.todayApplications,
        weekApplications: newStats.weekApplications,
      })
    },
  })

  const { forceRefresh, isRefreshing: isManualRefreshing } = useAdminDashboardRefresh({
    onSuccess: () => {
      void loadDashboardStats('manual')
    },
    onError: (err) => {
      logger.error('Manual refresh failed:', err)
      useToastStore.getState().addToast('error', 'Failed to refresh data')
    },
  })

  const handleManualRefresh = useCallback(async () => {
    await forceRefresh()
  }, [forceRefresh])

  const approvalRate = useMemo(() => {
    const total = stats.acceptedApplications + stats.rejectedApplications
    return total > 0 ? Math.round((stats.acceptedApplications / total) * 100) : 0
  }, [stats.acceptedApplications, stats.rejectedApplications])

  const adminFirstName = useMemo(() => {
    const name = sanitizeForDisplay(getAdminDisplayName(profile, user))
    return name.split(' ')[0] || 'Admin'
  }, [profile, user])

  const refreshing = isRefreshing || isManualRefreshing

  if (isInitialLoading) {
    return (
      <>
        <Seo
          title="Admin Dashboard | MIHAS-KATC Admissions"
          description="Manage MIHAS-KATC admissions, monitor application metrics, and review operational alerts from the admin dashboard."
          path="/admin/dashboard"
          noindex
        />
        <Crossfade isLoading={true} skeleton={<DashboardSkeleton />}>
          <DashboardSkeleton />
        </Crossfade>
      </>
    )
  }

  if (errorIsNetwork && !hasLoadedOnce) {
    return (
      <>
        <Seo
          title="Admin Dashboard Unavailable | MIHAS-KATC Admissions"
          description="The MIHAS-KATC admin dashboard could not load. Reconnect and retry to continue admissions administration."
          path="/admin/dashboard"
          noindex
        />
        <PageShell
          title="Admin dashboard unavailable"
          subtitle="Live admissions data could not be loaded. Reconnect and retry to continue."
        >
          <ErrorDisplay
            title="Dashboard failed to load"
            message={error || 'A network error prevented the dashboard from loading. Please check your connection and try again.'}
            onRetry={() => loadDashboardStats('initial')}
            variant="section"
          />
        </PageShell>
      </>
    )
  }

  if (!user) {
    if (!authRecoveryFailed) {
      return <DashboardSkeleton />
    }
    return (
      <>
        <Seo
          title="Admin Sign In Required | MIHAS-KATC Admissions"
          description="Sign in with an authorized admin account to access MIHAS-KATC admissions operations."
          path="/admin/dashboard"
          noindex
        />
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-foreground mb-2">Authentication Required</h2>
            <p className="text-muted-foreground mb-4">Please sign in to access the admin dashboard.</p>
            <Button onClick={() => { window.location.href = '/auth/signin' }}>Sign In</Button>
          </div>
        </div>
      </>
    )
  }

  const healthIcon = stats.systemHealth === 'excellent' || stats.systemHealth === 'good'
    ? <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
    : stats.systemHealth === 'warning'
      ? <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
      : <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />

  return (
    <>
      <Seo
        title="Admin Dashboard | MIHAS-KATC Admissions"
        description="Manage MIHAS-KATC admissions, monitor application metrics, and review operational alerts from the admin dashboard."
        path="/admin/dashboard"
        noindex
      />
      <PageShell
        title={`Welcome back, ${adminFirstName}`}
        eyebrow="Operations Overview"
        subtitle="Admissions volume, queue pressure, and live operational health in one control surface."
        maxWidth="7xl"
        tone="admin"
        metrics={[
          { label: 'Applications', value: stats.totalApplications, helper: `${stats.todayApplications} active today` },
          { label: 'Decision queue', value: stats.pendingApplications, helper: 'Applications currently awaiting admin action' },
          {
            label: 'Accepted path',
            value: stats.acceptedApplications,
            helper: `${stats.conditionallyApprovedApplications} conditional + ${stats.approvedApplications} approved + ${stats.enrolledApplications} enrolled`,
          },
          { label: 'System health', value: stats.systemHealth, helper: `${stats.activeUsers} active users online` },
        ]}
        actions={(
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 min-h-[44px]"
            loading={refreshing}
          >
            {!refreshing && <RefreshCw className="h-4 w-4" />}
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        )}
      >
        {/* System Status Bar */}
        <ErrorBoundary level="section" onError={(err, info) => reportError(err, { component: 'AdminDashboard.SystemStatus', ...info })}>
          <div className="mb-6 sm:mb-8">
            <div className="rounded-lg border border-border/60 bg-card p-4 sm:p-6 shadow-sm">
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm">
                <div className="flex items-center gap-2">
                  {healthIcon}
                  <span className="text-foreground">System {stats.systemHealth}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span className="text-foreground">{stats.activeUsers} active users</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isPolling ? 'bg-success animate-pulse' : 'bg-muted-foreground/50'}`} aria-hidden="true" />
                  <span className="text-xs text-muted-foreground">{isPolling ? 'Live' : 'Paused'}</span>
                </div>
              </div>
            </div>
          </div>
        </ErrorBoundary>

        {/* Needs Attention */}
        <ErrorBoundary level="section" onError={(err, info) => reportError(err, { component: 'AdminDashboard.NeedsAttention', ...info })}>
          <div className="mb-6 sm:mb-8">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Needs attention</h3>
            <StaggerContainer>
              <NeedsAttentionGrid>
                <StaggerItem>
                  <MetricTile
                    as={Link}
                    to="/admin/applications?overdueReviewFilter=true"
                    tone="destructive"
                    icon={TimerReset}
                    value={stats.overdueReviews}
                    label="Reviews past SLA"
                    cta="Clear overdue work"
                    ariaLabel={`${stats.overdueReviews} reviews past SLA — clear overdue work`}
                  />
                </StaggerItem>
                <StaggerItem>
                  <MetricTile
                    as={Link}
                    to="/admin/applications?reviewQueueFilter=true"
                    tone="warning"
                    icon={ClipboardList}
                    value={stats.pendingApplications}
                    label="Pending review"
                    cta="Review now"
                    ariaLabel={`${stats.pendingApplications} applications pending review`}
                  />
                </StaggerItem>
                <StaggerItem>
                  <MetricTile
                    as={Link}
                    to="/admin/applications?pendingDocumentsFilter=true"
                    tone="info"
                    icon={FileCheck}
                    value={stats.pendingDocuments}
                    label="Documents to verify"
                    cta="Verify documents"
                    ariaLabel={`${stats.pendingDocuments} documents to verify`}
                  />
                </StaggerItem>
                <StaggerItem>
                  <MetricTile
                    as={Link}
                    to="/admin/applications?paymentFilter=pending_review"
                    tone="destructive"
                    icon={CreditCard}
                    value={stats.pendingPayments}
                    label="Payments pending"
                    cta="Review payments"
                    ariaLabel={`${stats.pendingPayments} payments pending review`}
                  />
                </StaggerItem>
                <StaggerItem>
                  <MetricTile
                    as={Link}
                    to="/admin/applications?upcomingInterviewsFilter=true"
                    tone="info"
                    icon={Video}
                    value={stats.upcomingInterviews}
                    label="Upcoming interviews"
                    cta="View schedule"
                    ariaLabel={`${stats.upcomingInterviews} upcoming interviews`}
                  />
                </StaggerItem>
                <StaggerItem>
                  <MetricTile
                    as={Link}
                    to="/admin/applications?deadlinePressureFilter=true"
                    tone="warning"
                    icon={CalendarClock}
                    value={stats.conditionsExpiringSoon + stats.enrollmentsExpiringSoon}
                    label="Deadlines in 48h"
                    helper={`${stats.conditionsExpiringSoon} conditions · ${stats.enrollmentsExpiringSoon} enrollments`}
                    cta="Follow up now"
                    ariaLabel={`${stats.conditionsExpiringSoon + stats.enrollmentsExpiringSoon} deadlines in next 48 hours`}
                  />
                </StaggerItem>
              </NeedsAttentionGrid>
            </StaggerContainer>
          </div>
        </ErrorBoundary>

        {/* Error banner */}
        {error && (
          <div
            className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:p-5"
            role="alert"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-6 w-6 text-destructive flex-shrink-0" aria-hidden="true" />
                <div className="text-sm sm:text-base text-destructive font-medium">
                  <strong>Error:</strong> {error}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (hasLoadedOnce) {
                    refreshPolling()
                    return
                  }
                  void loadDashboardStats('manual')
                }}
                disabled={refreshing}
                className="min-h-[44px]"
              >
                Retry now
              </Button>
            </div>
            {pollingError?.message && (
              <p className="mt-3 text-xs text-muted-foreground">
                Last error detail: {pollingError.message}
              </p>
            )}
          </div>
        )}

        {refreshing && (
          <div className="mb-6">
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-medium text-info-strong">
                <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
                <span>Refreshing dashboard metrics…</span>
              </div>
            </div>
          </div>
        )}

        {/* Real-time Metrics Display with Animated Counters */}
        <ErrorBoundary level="section" onError={(err, info) => reportError(err, { component: 'AdminDashboard.RealtimeMetrics', ...info })}>
          <div className="mb-6 sm:mb-8">
            <RealtimeMetricsDisplay
              todayApplications={stats.todayApplications}
              pendingApplications={stats.pendingApplications}
              approvedApplications={stats.approvedApplications}
              acceptedApplications={stats.acceptedApplications}
              rejectedApplications={stats.rejectedApplications}
              totalApplications={stats.totalApplications}
              avgProcessingTime={stats.avgProcessingTime}
              activeUsers={stats.activeUsers}
              isConnected={isPolling}
              lastUpdated={lastUpdated}
              onRefresh={handleManualRefresh}
              isRefreshing={refreshing}
            />
          </div>
        </ErrorBoundary>

        <ErrorBoundary level="section" onError={(err, info) => reportError(err, { component: 'AdminDashboard.ActivityAndActions', ...info })}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            <div className="lg:col-span-2">
              <DashboardActivityFeed items={recentActivity} />
            </div>
            <div>
              <DashboardQuickActions
                pendingApplications={stats.pendingApplications}
                totalPrograms={stats.totalPrograms}
                totalStudents={stats.totalStudents}
              />
            </div>
          </div>
        </ErrorBoundary>

        {/* Weekly Overview */}
        <ErrorBoundary level="section" onError={(err, info) => reportError(err, { component: 'AdminDashboard.WeeklyOverview', ...info })}>
          <SectionCard
            className="mt-8"
            title="Weekly Overview"
            icon={<BarChart3 className="h-5 w-5" />}
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="text-3xl font-bold tracking-tight text-primary">{stats.weekApplications}</div>
                <div className="text-sm font-medium text-muted-foreground mt-1">Applications This Week</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold tracking-tight text-foreground">{stats.avgProcessingTime}</div>
                <div className="text-sm font-medium text-muted-foreground mt-1">Avg Processing Days</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold tracking-tight text-success">
                  {approvalRate}%
                </div>
                <div className="text-sm font-medium text-muted-foreground mt-1">Success Rate</div>
              </div>
            </div>
          </SectionCard>
        </ErrorBoundary>
      </PageShell>
    </>
  )
}
