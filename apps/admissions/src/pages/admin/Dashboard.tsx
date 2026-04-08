import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { logger } from '@/lib/logger'
import { useAuth } from '@/contexts/AuthContext'
import { adminDashboardService } from '@/services/admin/dashboard'
import type { AdminDashboardActivity, AdminDashboardStats } from '@/services/admin/dashboard'
import { DashboardSkeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/Button'
import { useAdminDashboardRefresh } from '@/hooks/useManualRefresh'
import { useToastStore } from '@/hooks/useToast'
import { AlertTriangle, BarChart3, Activity, RefreshCw } from 'lucide-react'
import { animateClasses } from '@/lib/animations'
import { Seo } from '@/components/seo/Seo'
import { useAdminDashboardPolling } from '@/hooks/useAdminDashboardPolling'
import { RealtimeMetricsDisplay } from '@/components/admin/RealtimeMetricsDisplay'
import { sanitizeForDisplay } from '@/lib/sanitize'
import OfflineAdminDashboard from '@/components/admin/OfflineAdminDashboard'
import { getAdminDisplayName, shouldLoadAdminDashboard } from '@/pages/admin/lib/dashboardBootstrap'
import { PageShell } from '@/components/ui/PageShell'
import { DashboardMetricsCards, type DashboardMetricsSummary } from '@/components/admin/dashboard/DashboardMetricsCards'
import { DashboardActivityFeed } from '@/components/admin/dashboard/DashboardActivityFeed'
import { DashboardQuickActions } from '@/components/admin/dashboard/DashboardQuickActions'

import { useProfileQuery } from '@/hooks/auth/useProfileQuery'

type DashboardFetchMode = 'initial' | 'manual'

type DashboardApiStatus = {
  endpoint: '/admin/dashboard/'
  phase: 'idle' | 'loading' | 'success' | 'error'
  responseShape: 'unknown' | 'valid' | 'empty' | 'invalid'
  authState: 'authenticated-admin' | 'authenticated-non-admin' | 'unauthenticated'
  isAdmin: boolean
  userId: string | null
  hasProfile: boolean
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  lastErrorAt: string | null
  lastErrorMessage: string | null
  lastErrorStatus: number | null
}

export default function AdminDashboard() {
  const { user, isAdmin, profileLoading } = useAuth()
  const { profile } = useProfileQuery()
  const [stats, setStats] = useState<AdminDashboardStats>({
    totalApplications: 0,
    pendingApplications: 0,
    approvedApplications: 0,
    rejectedApplications: 0,
    totalPrograms: 0,
    activeIntakes: 0,
    totalStudents: 0,
    todayApplications: 0,
    weekApplications: 0,
    monthApplications: 0,
    avgProcessingTime: 0,
    avgProcessingTimeHours: 0,
    medianProcessingTimeHours: 0,
    p95ProcessingTimeHours: 0,
    decisionVelocity24h: 0,
    activeUsers: 0,
    activeUsersLast7d: 0,
    systemHealth: 'good'
  })
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [error, setError] = useState('')
  const [recentActivity, setRecentActivity] = useState<AdminDashboardActivity[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [networkError, setNetworkError] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [initialLoadFailed, setInitialLoadFailed] = useState(false)
  const [hasLoadedSuccessfully, setHasLoadedSuccessfully] = useState(false)
  const [apiStatus, setApiStatus] = useState<DashboardApiStatus>({
    endpoint: '/admin/dashboard/',
    phase: 'idle',
    responseShape: 'unknown',
    authState: user ? (isAdmin ? 'authenticated-admin' : 'authenticated-non-admin') : 'unauthenticated',
    isAdmin,
    userId: user?.id ?? null,
    hasProfile: Boolean(profile),
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastErrorAt: null,
    lastErrorMessage: null,
    lastErrorStatus: null
  })
  const dashboardRequestIdRef = useRef(0)
  const initialLoadUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    setApiStatus(prev => ({
      ...prev,
      authState: user ? (isAdmin ? 'authenticated-admin' : 'authenticated-non-admin') : 'unauthenticated',
      isAdmin,
      userId: user?.id ?? null,
      hasProfile: Boolean(profile)
    }))
  }, [isAdmin, profile, user])

  // Use polling hook for dashboard data updates (replaces Supabase Realtime)
  const { isPolling, error: pollingError, refresh: refreshPolling } = useAdminDashboardPolling({
    enabled: Boolean(user?.id) && hasLoadedSuccessfully && !initialLoadFailed,
    pollingInterval: 30000, // 30 seconds
    onDataChange: (newStats) => {
      setStats(prev => ({
        ...prev,
        totalApplications: newStats.totalApplications,
        pendingApplications: newStats.pendingApplications,
        approvedApplications: newStats.approvedApplications,
        rejectedApplications: newStats.rejectedApplications,
        todayApplications: newStats.todayApplications,
        weekApplications: newStats.weekApplications,
      }))
      setLastUpdated(new Date())
    }
  })

  const loadDashboardStats = useCallback(async (mode: DashboardFetchMode = 'initial') => {
    const isRefresh = mode !== 'initial'
    const requestId = dashboardRequestIdRef.current + 1
    dashboardRequestIdRef.current = requestId
    const isLatestRequest = () => dashboardRequestIdRef.current === requestId

    if (isRefresh) {
      setIsRefreshing(true)
    } else {
      setIsInitialLoading(true)
    }

    const attemptAt = new Date().toISOString()
    setApiStatus(prev => ({
      ...prev,
      phase: 'loading',
      lastAttemptAt: attemptAt,
      lastErrorMessage: null,
      lastErrorStatus: null,
      responseShape: prev.responseShape === 'unknown' ? 'unknown' : prev.responseShape
    }))

    const result = await adminDashboardService.getOverviewWithDiagnostics()

    if (!isLatestRequest()) {
      return
    }

    const isNetworkFailure =
      (result.diagnostics.errorMessage || '').includes('Network') ||
      (result.diagnostics.errorMessage || '').includes('fetch') ||
      result.diagnostics.status === 503

    if (!result.diagnostics.ok) {
      const errorMessage = `Failed to load dashboard data: ${result.diagnostics.errorMessage ?? 'Unknown dashboard API error'}`
      setError(errorMessage)
      setNetworkError(isNetworkFailure)
      setInitialLoadFailed(!hasLoadedSuccessfully)
      setApiStatus(prev => ({
        ...prev,
        phase: 'error',
        responseShape: result.diagnostics.responseShape,
        lastErrorAt: result.diagnostics.requestedAt,
        lastErrorMessage: result.diagnostics.errorMessage,
        lastErrorStatus: result.diagnostics.status
      }))
    } else {
      setStats(result.data.stats)
      setRecentActivity(result.data.recentActivity || [])
      setLastUpdated(new Date())
      setError('')
      setNetworkError(false)
      setInitialLoadFailed(false)
      setHasLoadedSuccessfully(true)
      setApiStatus(prev => ({
        ...prev,
        phase: 'success',
        responseShape: result.diagnostics.responseShape,
        lastSuccessAt: result.diagnostics.requestedAt
      }))

      if (result.diagnostics.responseShape === 'empty') {
        setError('Dashboard API returned an empty payload. Data is available but currently empty, not crashed.')
      }
    }

    if (isRefresh) {
      setIsRefreshing(false)
    } else {
      setIsInitialLoading(false)
    }
  }, [hasLoadedSuccessfully])

  const { forceRefresh, isRefreshing: isManualRefreshing } = useAdminDashboardRefresh({
    onSuccess: () => {
      void loadDashboardStats('manual')
    },
    onError: (err) => {
      console.error('Manual refresh failed:', err)
      useToastStore.getState().addToast('error', 'Failed to refresh data')
    }
  })

  const handleManualRefresh = useCallback(async () => {
    await forceRefresh()
  }, [forceRefresh])

  useEffect(() => {
    logger.debug('[Dashboard] useEffect triggered', { hasUser: !!user, userId: user?.id })

    if (!shouldLoadAdminDashboard(user)) {
      logger.debug('[Dashboard] Skipping load - missing authenticated user')
      initialLoadUserIdRef.current = null
      return
    }

    const currentUserId = user?.id ?? null
    if (!currentUserId) {
      return
    }

    if (initialLoadUserIdRef.current === currentUserId) {
      return
    }

    initialLoadUserIdRef.current = currentUserId
    void loadDashboardStats('initial')
  }, [loadDashboardStats, user])

  const dashboardMetrics: DashboardMetricsSummary = useMemo(() => ({
    todayApplications: stats.todayApplications,
    pendingApplications: stats.pendingApplications,
    approvalRate: stats.approvedApplications + stats.rejectedApplications > 0
      ? Math.round((stats.approvedApplications / (stats.approvedApplications + stats.rejectedApplications)) * 100)
      : 0,
    avgProcessingTime: stats.avgProcessingTime
  }), [stats.todayApplications, stats.pendingApplications, stats.approvedApplications, stats.rejectedApplications, stats.avgProcessingTime])

  const { adminFirstName } = useMemo(() => {
    const name = sanitizeForDisplay(getAdminDisplayName(profile, user))
    return { adminFirstName: name.split(' ')[0] || 'Admin' }
  }, [profile, user])

  if (isInitialLoading) {
    return (
      <>
        <Seo
          title="Admin Dashboard | MIHAS-KATC Admissions"
          description="Manage MIHAS-KATC admissions, monitor application metrics, and review operational alerts from the admin dashboard."
          path="/admin/dashboard"
          noindex
        />
        <DashboardSkeleton />
      </>
    )
  }

  if (networkError && !hasLoadedSuccessfully) {
    return (
      <>
        <Seo
          title="Admin Dashboard Offline | MIHAS-KATC Admissions"
          description="The MIHAS-KATC admin dashboard is currently offline. Reconnect to continue admissions administration."
          path="/admin/dashboard"
          noindex
        />
        <OfflineAdminDashboard />
      </>
    )
  }

  if (!user) {
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
          <Button onClick={() => window.location.href = '/auth/signin'}>Sign In</Button>
        </div>
      </div>
      </>
    )
  }

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
      subtitle="Here's your system overview for today"
      maxWidth="7xl"
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={handleManualRefresh}
          disabled={isRefreshing || isManualRefreshing}
          className="flex items-center gap-2"
          loading={isRefreshing || isManualRefreshing}
        >
          {!(isRefreshing || isManualRefreshing) && <RefreshCw className="h-4 w-4" />}
          {(isRefreshing || isManualRefreshing) ? 'Refreshing...' : 'Refresh'}
        </Button>
      }
    >
        <div className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Admin Diagnostics</h2>
          <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
            <div><strong className="text-foreground">Auth:</strong> {apiStatus.authState}</div>
            <div><strong className="text-foreground">User ID:</strong> {apiStatus.userId ?? 'none'}</div>
            <div><strong className="text-foreground">Profile loaded:</strong> {apiStatus.hasProfile ? 'yes' : profileLoading ? 'loading...' : 'no'}</div>
            <div><strong className="text-foreground">Admin role:</strong> {apiStatus.isAdmin ? 'yes' : 'no'}</div>
            <div><strong className="text-foreground">Endpoint:</strong> {apiStatus.endpoint}</div>
            <div><strong className="text-foreground">API phase:</strong> {apiStatus.phase}</div>
            <div><strong className="text-foreground">Response shape:</strong> {apiStatus.responseShape}</div>
            <div><strong className="text-foreground">Last status:</strong> {apiStatus.lastErrorStatus ?? 'n/a'}</div>
            <div className="sm:col-span-2"><strong className="text-foreground">Last attempt:</strong> {apiStatus.lastAttemptAt ?? 'n/a'}</div>
            <div className="sm:col-span-2"><strong className="text-foreground">Last success:</strong> {apiStatus.lastSuccessAt ?? 'n/a'}</div>
          </div>
          {apiStatus.lastErrorMessage && (
            <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-error">
              Last API error: {apiStatus.lastErrorMessage}
            </p>
          )}
          {pollingError && (
            <p className="mt-2 rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs text-warning-strong">
              Polling retry status: {pollingError.message}
            </p>
          )}
        </div>

        {/* System Status Bar */}
        <div className={`mb-6 sm:mb-8 ${animateClasses.slideUp}`}>
          <div className="bg-card rounded-2xl p-4 sm:p-6 shadow-sm border border-border">
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm">
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${
                  stats.systemHealth === 'excellent' ? 'bg-success/80' :
                  stats.systemHealth === 'good' ? 'bg-primary/80' :
                  stats.systemHealth === 'warning' ? 'bg-warning/80' : 'bg-error/80'
                }`}></div>
                <span className="text-foreground">System {stats.systemHealth}</span>
              </div>
              <div className="flex items-center space-x-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <span className="text-foreground">{stats.activeUsers} active users</span>
              </div>
              {/* Polling status indicator */}
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${isPolling ? 'bg-success animate-pulse' : 'bg-muted-foreground/50'}`}></div>
                <span className="text-xs text-muted-foreground">{isPolling ? 'Live' : 'Paused'}</span>
              </div>
              <div className="ml-auto text-foreground">
                <span className="text-2xl sm:text-3xl font-bold">{stats.totalApplications}</span>
                <span className="text-sm ml-2 text-muted-foreground">Total Applications</span>
              </div>
            </div>
          </div>
        </div>

        {/* Error Display */}
          {error && (
            <div 
              className={`rounded-xl bg-destructive/5 border border-destructive/30 p-4 sm:p-6 mb-6 shadow-lg ${animateClasses.fadeIn}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <AlertTriangle className="h-6 w-6 text-error flex-shrink-0" />
                  <div className="text-sm sm:text-base text-error font-medium">
                    <strong>Error:</strong> {error}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (hasLoadedSuccessfully) {
                      refreshPolling()
                      return
                    }
                    void loadDashboardStats('manual')
                  }}
                  disabled={isRefreshing || isManualRefreshing}
                >
                  Retry now
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Last error detail: {apiStatus.lastErrorMessage ?? pollingError?.message ?? 'No additional details available.'}
              </p>
            </div>
          )}

        {(isRefreshing || isManualRefreshing) && (
          <div className="mb-6">
            <div className="rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-info-strong">
                  <div className="h-2.5 w-2.5 rounded-full bg-primary animate-pulse" aria-hidden="true" />
                  <span>Refreshing dashboard metrics…</span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-primary/10 sm:w-56">
                  <div className="h-full w-1/2 animate-pulse bg-primary/80" />
                </div>
              </div>
            </div>
          </div>
        )}



        {/* Real-time Metrics Display with Animated Counters */}
        {/* Requirements: 6.2, 6.4 - Real-time metrics display with animated counters and visual indicators */}
        <div 
          className={`mb-6 sm:mb-8 ${animateClasses.slideUp}`}
        >
          <RealtimeMetricsDisplay
            todayApplications={stats.todayApplications}
            pendingApplications={stats.pendingApplications}
            approvedApplications={stats.approvedApplications}
            rejectedApplications={stats.rejectedApplications}
            totalApplications={stats.totalApplications}
            avgProcessingTime={stats.avgProcessingTime}
            activeUsers={stats.activeUsers}
            isConnected={isPolling}
            lastUpdated={lastUpdated}
            onRefresh={handleManualRefresh}
            isRefreshing={isRefreshing || isManualRefreshing}
          />
        </div>

        <div className={`mb-6 sm:mb-8 ${animateClasses.slideUp}`}>
          <DashboardMetricsCards metrics={dashboardMetrics} />
        </div>

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
        {/* Weekly Overview */}
        <div 
          className={`mt-8 bg-card rounded-2xl shadow-lg border border-border ${animateClasses.slideUp}`}
        >
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Weekly Overview
            </h3>
          </div>
          
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-primary">{stats.weekApplications}</div>
                <div className="text-sm font-semibold text-foreground">Applications This Week</div>
              </div>
              <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-foreground">{stats.avgProcessingTime}</div>
                <div className="text-sm font-semibold text-foreground">Avg Processing Days</div>
                <div className="text-xs font-medium text-success mt-1">-12% improvement</div>
              </div>
              <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-success">
                  {dashboardMetrics.approvalRate}%
                </div>
                <div className="text-sm font-semibold text-foreground">Success Rate</div>
                <div className="text-xs font-medium text-primary mt-1">Stable performance</div>
              </div>
            </div>
          </div>
        </div>

    </PageShell>
    </>
  );
}
