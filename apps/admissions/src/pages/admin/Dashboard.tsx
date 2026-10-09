import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { logger } from '@/lib/logger'
import { useAuth } from '@/contexts/AuthContext'
import { DashboardSkeleton } from '@/components/ui'
import { Button } from '@/components/ui/Button'
import { useAdminDashboardRefresh } from '@/hooks/useManualRefresh'
import { useToastStore } from '@/hooks/useToast'
import { AlertTriangle, BarChart3, RefreshCw, ClipboardList, FileCheck, CreditCard, Video, TimerReset, CalendarClock, CheckCircle2, HelpCircle, Loader2, type LucideIcon } from 'lucide-react'
import { Seo } from '@/components/seo/Seo'
import { useAdminDashboardPolling } from '@/hooks/useAdminDashboardPolling'
import { useAdminDashboardLoader } from '@/hooks/admin'
import { InstitutionSwitcher } from '@/components/admin/InstitutionSwitcher'
import { useInstitutionScope } from '@/contexts/InstitutionScopeContext'
import { sanitizeForDisplay } from '@/lib/sanitize'
import { getAdminDisplayName, shouldLoadAdminDashboard } from '@/pages/admin/lib/dashboardBootstrap'
import { PageShell } from '@/components/ui/PageShell'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { SectionCard } from '@/components/ui/SectionCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { MetricTile, NeedsAttentionGrid } from '@/components/ui/MetricTile'
import { reportError } from '@/lib/errorReporter'
import { resolveDashboardScope } from '@/pages/admin/lib/dashboardScope'
import { rosterDeepLink } from '@/pages/admin/lib/rosterDeepLinks'
import {
  formatMetricValue,
  freshnessLabel,
  healthNotice,
  isMetricUnknown,
  isStale,
  metricHelper,
  UNKNOWN_METRIC_LABEL,
  type DashboardMetricKey,
} from '@/pages/admin/lib/dashboardMetrics'
import { usePortalBrand } from '@/hooks/usePortalBrand'
import { Building2 } from 'lucide-react'

import { DashboardActivityFeed } from '@/components/admin/dashboard/DashboardActivityFeed'
import { DashboardQuickActions } from '@/components/admin/dashboard/DashboardQuickActions'
import { StaggerContainer, StaggerItem, Crossfade } from '@/components/motion'

import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { onAdminDashboardMount } from '@/lib/speculativePrefetch'

/**
 * The six exception tiles (task 9.2, R8.6; finding ADM-02).
 *
 * Each entry pairs the metric that answers the tile with the registered roster
 * query its link opens — the frontend half of the backend's own `DASHBOARD_TILES`
 * pairing. The number and the page it opens therefore describe the same set by
 * construction, and `rosterDeepLink` keeps the link in registered parameter names
 * (task 9.1).
 *
 * The tone is the tile's tone **only while the metric answered**. An unknown
 * metric renders neutral, because a coloured "urgent" tile over a number the
 * platform does not have is the ADM-02 defect in a new costume.
 */
const EXCEPTION_TILES: ReadonlyArray<{
  metric: DashboardMetricKey
  to: string
  label: string
  cta: string
  icon: LucideIcon
  tone: 'destructive' | 'warning' | 'info'
}> = [
  { metric: 'overdue_reviews', to: rosterDeepLink('overdueReviews'), label: 'Reviews past SLA', cta: 'Clear overdue work', icon: TimerReset, tone: 'destructive' },
  { metric: 'decision_queue', to: rosterDeepLink('pendingReview'), label: 'Pending review', cta: 'Review now', icon: ClipboardList, tone: 'warning' },
  { metric: 'pending_documents', to: rosterDeepLink('pendingDocuments'), label: 'Documents to verify', cta: 'Verify documents', icon: FileCheck, tone: 'info' },
  { metric: 'payment_review', to: rosterDeepLink('pendingPayments'), label: 'Payments pending', cta: 'Review payments', icon: CreditCard, tone: 'destructive' },
  { metric: 'upcoming_interviews', to: rosterDeepLink('upcomingInterviews'), label: 'Upcoming interviews', cta: 'View schedule', icon: Video, tone: 'info' },
  { metric: 'deadline_pressure', to: rosterDeepLink('deadlinePressure'), label: 'Deadlines in 48h', cta: 'Follow up now', icon: CalendarClock, tone: 'warning' },
]

/**
 * Volume and outcome numbers, each rendered with the server's own sentence.
 *
 * This replaces `RealtimeMetricsDisplay`, which animated eight numbers it could
 * not label and could not report as unknown — two of them (`avgProcessingTime`,
 * `activeUsers`) had no source in the payload at all (ADM-02, MAINT-02).
 */
const VOLUME_METRICS: ReadonlyArray<{ metric: DashboardMetricKey; label: string }> = [
  { metric: 'today_activity', label: 'Active today' },
  { metric: 'applications_this_week', label: 'This week' },
  { metric: 'applications_this_month', label: 'This month' },
  { metric: 'payment_resolved', label: 'Payment resolved' },
  { metric: 'payment_unpaid', label: 'Payment outstanding' },
  { metric: 'rejected', label: 'Declined' },
]

export default function AdminDashboard() {
  const { user, profileLoading: _profileLoading } = useAuth()
  const { profile } = useProfileQuery()

  useEffect(() => { onAdminDashboardMount() }, [])

  const { selectedInstitutionId } = useInstitutionScope()
  const loader = useAdminDashboardLoader(shouldLoadAdminDashboard(user) ? user : null, selectedInstitutionId)
  const {
    metrics,
    health,
    freshness,
    recentActivity,
    error,
    errorIsNetwork,
    hasLoadedOnce,
    isInitialLoading,
    isRefreshing,
    noSchoolAccess,
    load: loadDashboardStats,
    patchMetrics,
    patchActivity,
  } = loader

  const portalBrand = usePortalBrand()
  const scope = resolveDashboardScope({ user, noSchoolAccess })

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
    // ADM-02: the poll must ask the *same* question the page asked. Without this
    // the poll fetched platform-wide totals and replaced a selected school's
    // numbers with them, silently, under the same heading.
    institutionId: selectedInstitutionId,
    onMetricsChange: (payload) => {
      patchMetrics({
        metrics: payload.metrics,
        health: payload.health,
        freshness: payload.freshness,
        institutionId: payload.institutionId,
      })
    },
    onActivityChange: (activity) => {
      patchActivity(activity)
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

  const adminFirstName = useMemo(() => {
    const name = sanitizeForDisplay(getAdminDisplayName(profile, user))
    return name.split(' ')[0] || 'Admin'
  }, [profile, user])

  const refreshing = isRefreshing || isManualRefreshing

  if (isInitialLoading) {
    return (
      <>
        <Seo
          title="Admin Dashboard | Beanola Admissions"
          description="Manage Beanola admissions, monitor application metrics, and review operational alerts from the admin dashboard."
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
          title="Admin Dashboard Unavailable | Beanola Admissions"
          description="The Beanola admin dashboard could not load. Reconnect and retry to continue admissions administration."
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
          title="Admin Sign In Required | Beanola Admissions"
          description="Sign in with an authorized admin account to access Beanola admissions operations."
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

  // R11.6: a non-super-admin caller with no membership/grant scope must see an
  // explicit "No school access assigned" state with a support path — never the
  // (correct-but-misleading) zero counts the backend returns for an empty scope.
  if (scope === 'no-scope') {
    const supportEmail = portalBrand.supportEmail || 'admissions@beanola.com'
    return (
      <>
        <Seo
          title="No School Access | Beanola Admissions"
          description="Your account is not yet linked to a school. Contact a super administrator to be granted admissions access."
          path="/admin/dashboard"
          noindex
        />
        <PageShell
          title="Admin dashboard"
          eyebrow="Operations Overview"
          subtitle="Your account is not yet linked to a school."
          maxWidth="4xl"
          tone="admin"
        >
          <SectionCard>
            <EmptyState
              icon={<Building2 />}
              heading="No school access assigned"
              description="Your account is not linked to any school yet, so there is no admissions data to show. Contact a super administrator to be granted access."
              action={{
                label: 'Contact support',
                onClick: () => {
                  window.location.href = `mailto:${supportEmail}?subject=${encodeURIComponent('Request for school access')}`
                },
                variant: 'primary',
              }}
            />
          </SectionCard>
        </PageShell>
      </>
    )
  }

  const isGlobal = scope === 'global'
  const overviewSubtitle = isGlobal
    ? 'Admissions volume and queue pressure across every school. Each number states what it counts.'
    : 'Applications and queue pressure for your school. Each number states what it counts.'

  // Every number the page renders comes from the registry. `metrics[key]` is
  // `undefined` until a read lands and absent whenever its source failed, and
  // `formatMetricValue` turns both into "Unknown" — so there is no code path on
  // this page that can render a zero the platform did not measure (ADM-02).
  // Optional chaining, not a default: an absent registry is "nothing measured",
  // which `formatMetricValue` already renders as "Unknown". Substituting `{}`
  // here would be the same instinct — supply something so the page keeps
  // going — that produced the zeros this task removes.
  const metric = (key: DashboardMetricKey) => metrics?.[key]

  // The read's own health, derived by the backend from whether each source
  // answered. `null` means nothing has been measured, which is rendered as
  // "Unknown" rather than as the friendliest word in an enum.
  const healthState = health?.state ?? null
  const healthIcon = healthState === 'operational'
    ? <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
    : healthState === 'degraded'
      ? <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
      : <HelpCircle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
  const healthLabel = healthState ?? UNKNOWN_METRIC_LABEL
  const degradedNotice = healthNotice(health)
  const stale = isStale(freshness)
  // Which population every number on this page describes. Stated in words
  // because a scoped read and a platform-wide read look identical otherwise —
  // the confusion ADM-02's polling defect produced silently.
  const scopeLabel = selectedInstitutionId
    ? 'the selected school'
    : isGlobal
      ? 'every school'
      : 'your school'

  return (
    <>
      <Seo
        title="Admin Dashboard | Beanola Admissions"
        description="Manage Beanola admissions, monitor application metrics, and review operational alerts from the admin dashboard."
        path="/admin/dashboard"
        noindex
      />
      <PageShell
        title={`Welcome back, ${adminFirstName}`}
        eyebrow={isGlobal ? 'Cross-school Overview' : 'Your School Overview'}
        subtitle={overviewSubtitle}
        maxWidth="7xl"
        tone="admin"
        metrics={[
          {
            label: 'Applications',
            value: formatMetricValue(metric('total_applications')),
            helper: metricHelper(metric('total_applications')),
          },
          {
            label: 'Decision queue',
            value: formatMetricValue(metric('decision_queue')),
            helper: metricHelper(metric('decision_queue')),
          },
          {
            label: 'Accepted path',
            value: formatMetricValue(metric('accepted_path')),
            helper: metricHelper(metric('accepted_path')),
          },
          {
            // MAINT-02: this used to read "System health" with the helper
            // "N active users online". Nothing in the payload has ever measured
            // presence, and the health grade was a frontend default. Both are
            // now the thing they actually are.
            label: 'Staff accounts enabled',
            value: formatMetricValue(metric('staff_accounts_enabled')),
            helper: metricHelper(metric('staff_accounts_enabled')),
          },
        ]}
        actions={(
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            <InstitutionSwitcher />
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualRefresh}
              disabled={refreshing}
              className="flex min-h-[44px] w-full items-center gap-2 sm:w-auto"
              loading={refreshing}
            >
              {!refreshing && <RefreshCw className="h-4 w-4" />}
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        )}
      >
        {/* Read state: what answered, how current it is, and who it describes. */}
        <ErrorBoundary level="section" onError={(err, info) => reportError(err, { component: 'AdminDashboard.ReadState', ...info })}>
          <div className="mb-6 sm:mb-8">
            <div className="rounded-lg border border-border/60 bg-card p-4 sm:p-6 shadow-sm">
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm">
                <div className="flex items-center gap-2">
                  {healthIcon}
                  <span className="text-foreground" data-testid="dashboard-read-health">
                    Data sources: {healthLabel}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={stale ? 'text-warning' : 'text-muted-foreground'}
                    data-testid="dashboard-freshness"
                  >
                    {freshnessLabel(freshness)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Counting {scopeLabel}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isPolling ? 'bg-success animate-pulse' : 'bg-muted-foreground/50'}`} aria-hidden="true" />
                  <span className="text-xs text-muted-foreground">{isPolling ? 'Live' : 'Paused'}</span>
                </div>
              </div>
              {degradedNotice && (
                <p className="mt-3 text-xs text-warning" role="status" data-testid="dashboard-health-notice">
                  {degradedNotice}
                </p>
              )}
            </div>
          </div>
        </ErrorBoundary>

        {/* Needs Attention */}
        <ErrorBoundary level="section" onError={(err, info) => reportError(err, { component: 'AdminDashboard.NeedsAttention', ...info })}>
          <div className="mb-6 sm:mb-8">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Needs attention</h3>
            <StaggerContainer>
              <NeedsAttentionGrid>
                {EXCEPTION_TILES.map((tile) => {
                  const entry = metric(tile.metric)
                  const unknown = isMetricUnknown(entry)
                  const rendered = formatMetricValue(entry)
                  return (
                    <StaggerItem key={tile.metric}>
                      <MetricTile
                        as={Link}
                        to={tile.to}
                        tone={unknown ? 'neutral' : tile.tone}
                        icon={unknown ? HelpCircle : tile.icon}
                        value={rendered}
                        label={tile.label}
                        helper={metricHelper(entry)}
                        cta={unknown ? 'Open the roster to count' : tile.cta}
                        ariaLabel={`${tile.label}: ${rendered}`}
                        data-metric={tile.metric}
                        data-metric-state={unknown ? 'unknown' : 'ok'}
                      />
                    </StaggerItem>
                  )
                })}
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3 sm:items-center">
                <AlertTriangle className="h-6 w-6 text-destructive flex-shrink-0" aria-hidden="true" />
                <div className="min-w-0 break-words text-sm font-medium text-destructive sm:text-base">
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
                className="min-h-[44px] w-full sm:w-auto"
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

        {/* Volume and outcomes — every number with the server's own definition. */}
        <ErrorBoundary level="section" onError={(err, info) => reportError(err, { component: 'AdminDashboard.Volume', ...info })}>
          <SectionCard
            className="mb-6 sm:mb-8"
            title="Volume and outcomes"
            icon={<BarChart3 className="h-5 w-5" />}
          >
            <NeedsAttentionGrid>
              {VOLUME_METRICS.map(({ metric: key, label }) => {
                const entry = metric(key)
                return (
                  <MetricTile
                    key={key}
                    compact
                    tone="neutral"
                    value={formatMetricValue(entry)}
                    label={label}
                    helper={metricHelper(entry)}
                    data-metric={key}
                    data-metric-state={isMetricUnknown(entry) ? 'unknown' : 'ok'}
                  />
                )
              })}
            </NeedsAttentionGrid>
          </SectionCard>
        </ErrorBoundary>

        <ErrorBoundary level="section" onError={(err, info) => reportError(err, { component: 'AdminDashboard.ActivityAndActions', ...info })}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            <div className="lg:col-span-2">
              <DashboardActivityFeed items={recentActivity} />
            </div>
            <div>
              <DashboardQuickActions
                pendingApplications={metric('decision_queue')?.value ?? null}
                staffAccounts={metric('staff_accounts_total')?.value ?? null}
              />
            </div>
          </div>
        </ErrorBoundary>

        {/* Cross-school control surfaces — Super_Admin only (R11.4) */}
        {isGlobal && (
          <ErrorBoundary level="section" onError={(err, info) => reportError(err, { component: 'AdminDashboard.CrossSchool', ...info })}>
            <SectionCard
              className="mt-8"
              title="Cross-school operations"
              icon={<Building2 className="h-5 w-5" />}
            >
              <p className="text-sm text-muted-foreground mb-4">
                Per-institution settlement, routing, branding, and tenant configuration across every school.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="outline" size="sm" className="min-h-[44px]">
                  <Link to="/admin/tenants">Manage schools</Link>
                </Button>
              </div>
            </SectionCard>
          </ErrorBoundary>
        )}
      </PageShell>
    </>
  )
}
