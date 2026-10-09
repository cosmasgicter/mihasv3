/**
 * useAdminDashboardPolling Hook
 *
 * Provides polling-based data fetching for admin dashboard.
 * Polls GET /api/v1/admin/dashboard/ via the admin dashboard service at 60-second intervals.
 *
 * Polling Strategy:
 * - React Query polling against Django REST API
 * - Polling doubles interval when page is hidden (battery-friendly)
 * - React Query structural sharing prevents re-renders on identical data
 * - onDataChange callback uses ref pattern to avoid stale closure issues
 *
 * @module hooks/useAdminDashboardPolling
 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { adminDashboardService } from '@/services/admin/dashboard'
import type { AdminDashboardActivity } from '@/services/admin/dashboard'
import type {
  DashboardFreshness,
  DashboardHealth,
  DashboardHealthState,
  DashboardMetrics,
} from '@/pages/admin/lib/dashboardMetrics'
import { logger } from '@/lib/logger'

/** Threshold in ms after which polling stops entirely when tab is hidden */
const HIDDEN_PAUSE_THRESHOLD = 300000 // 5 minutes
const MAX_RETRY_ATTEMPTS = 2
const RETRY_BASE_DELAY_MS = 1000
const RETRY_MAX_DELAY_MS = 10000

export interface AdminDashboardStats {
  totalApplications: number
  pendingApplications: number
  approvedApplications: number
  conditionallyApprovedApplications: number
  enrolledApplications: number
  acceptedApplications: number
  rejectedApplications: number
  todayApplications: number
  weekApplications: number
  // Carried so the shared ['admin-dashboard-polling'] cache is the single
  // source for every admin metric consumer (R11.1). Additive: not part of
  // statsFingerprint, so they never affect the owner's dedup/onDataChange.
  avgProcessingTime: number
  systemHealth: DashboardHealthState | null
  activeUsers: number
}

export interface UseAdminDashboardPollingOptions {
  enabled?: boolean
  pollingInterval?: number
  /**
   * The school the dashboard is currently showing (task 9.2, ADM-02).
   *
   * **This is load-bearing, not cosmetic.** The poll used to call
   * `adminDashboardService.getOverview()` with no argument and cache under a
   * bare `['admin-dashboard-polling']` key, while the page's initial load was
   * scoped to the selected institution. So a super-admin who selected one school
   * saw that school's numbers for up to one polling interval, and then the poll
   * silently replaced them with **platform-wide** totals under the same "Your
   * School Overview" heading — with no visible event to explain the change.
   *
   * Passing it here puts the institution in the query key *and* on the wire, so a
   * poll answers the same question the page asked.
   */
  institutionId?: string | null
  onDataChange?: (stats: AdminDashboardStats) => void
  onActivityChange?: (activity: AdminDashboardActivity[]) => void
  /**
   * The metric registry from a poll that matched the current school.
   *
   * Fires on every scoped poll (not only when the numbers changed): freshness
   * moves even when no counter does, and a stale label that never updates is
   * itself a false statement about how current the page is.
   */
  onMetricsChange?: (payload: DashboardPollPayload) => void
}

/** The React Query key for one school's dashboard poll. */
export function adminDashboardPollingKey(institutionId?: string | null) {
  return ['admin-dashboard-polling', institutionId ?? 'all'] as const
}

export interface UseAdminDashboardPollingReturn {
  stats: AdminDashboardStats | null
  /** The metric registry from the last poll for the current school. */
  metrics: DashboardMetrics | null
  health: DashboardHealth | null
  freshness: DashboardFreshness | null
  isLoading: boolean
  isPolling: boolean
  error: Error | null
  refresh: () => void
  lastUpdated: Date | null
}

const POLLING_INTERVAL = 60000
export { POLLING_INTERVAL }

export function getDashboardRetryDelay(attemptIndex: number): number {
  const exponent = Math.max(0, attemptIndex)
  return Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** exponent)
}

export function estimateMaxDashboardRequestsOverWindow(windowMs: number, pollingIntervalMs: number): number {
  if (windowMs <= 0 || pollingIntervalMs <= 0) {
    return 0
  }

  const pollCyclesInWindow = Math.floor(windowMs / pollingIntervalMs) + 1
  return pollCyclesInWindow * (1 + MAX_RETRY_ATTEMPTS)
}

/**
 * Compute a fingerprint of admin stats for deduplication.
 * If the fingerprint is identical between polls, onDataChange is not fired.
 */
function statsFingerprint(stats: AdminDashboardStats): string {
  return `${stats.totalApplications}:${stats.pendingApplications}:${stats.approvedApplications}:${stats.conditionallyApprovedApplications}:${stats.enrolledApplications}:${stats.acceptedApplications}:${stats.rejectedApplications}:${stats.todayApplications}:${stats.weekApplications}`
}

// Exported for property/regression testing of the dedup core (R11.3). This is
// the exact deterministic function the polling owner uses to decide whether a
// poll result is a redundant update; exporting it does not change behavior.
export { statsFingerprint }

export interface DashboardPollPayload {
  stats: AdminDashboardStats
  activity: AdminDashboardActivity[]
  /** The metric registry — what the dashboard actually renders (task 9.2). */
  metrics: DashboardMetrics
  health: DashboardHealth | null
  freshness: DashboardFreshness
  sources: Record<string, { state: 'ok' | 'failed'; reason: string | null }>
  /** Which school this payload describes; `null` means "every school". */
  institutionId: string | null
}

/**
 * The one function that produces a cache entry for this key (task 9.2).
 *
 * Exported because three surfaces must seed or read the *same* shape —
 * `data/applications.ts:useStats`, `useAdminPendingCount`, and the speculative
 * prefetch. A second, partial producer desyncs the cache and crashes the poller
 * on `query.data.stats === undefined`, which is why the shape has exactly one
 * author.
 */
export async function fetchDashboardStats(institutionId?: string | null): Promise<DashboardPollPayload> {
  const overview = await adminDashboardService.getOverview(institutionId)
  const stats = overview.stats

  return {
    stats: {
      totalApplications: stats.totalApplications ?? 0,
      pendingApplications: stats.pendingApplications ?? 0,
      approvedApplications: stats.approvedApplications ?? 0,
      conditionallyApprovedApplications: stats.conditionallyApprovedApplications ?? 0,
      enrolledApplications: stats.enrolledApplications ?? 0,
      acceptedApplications: stats.acceptedApplications ?? 0,
      rejectedApplications: stats.rejectedApplications ?? 0,
      todayApplications: stats.todayApplications ?? 0,
      weekApplications: stats.weekApplications ?? 0,
      avgProcessingTime: stats.avgProcessingTime ?? 0,
      // No `?? 'good'`: an unmeasured health grade stays unmeasured (ADM-02).
      systemHealth: stats.systemHealth ?? null,
      activeUsers: stats.activeUsers ?? 0,
    },
    activity: overview.recentActivity ?? [],
    metrics: overview.metrics,
    health: overview.health,
    freshness: overview.freshness,
    sources: overview.sources,
    /**
     * The school this payload actually describes.
     *
     * Carried so the consumer can *verify* rather than assume: if a poll answered
     * for a different school than the page is showing (a race across an
     * institution switch), the consumer drops it instead of rendering it.
     */
    institutionId: institutionId ?? null,
  }
}

/** Fingerprint of the activity feed — changes when the latest events change. */
function activityFingerprint(activity: AdminDashboardActivity[]): string {
  return activity.map(a => `${a.id}:${a.timestamp}`).join('|')
}

export function useAdminDashboardPolling(
  options: UseAdminDashboardPollingOptions = {}
): UseAdminDashboardPollingReturn {
  const {
    enabled = true,
    pollingInterval = POLLING_INTERVAL,
    institutionId = null,
    onDataChange,
    onActivityChange,
    onMetricsChange,
  } = options
  const queryKey = adminDashboardPollingKey(institutionId)

  const queryClient = useQueryClient()
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const previousFingerprintRef = useRef<string | null>(null)
  const previousActivityFpRef = useRef<string | null>(null)
  const onDataChangeRef = useRef<typeof onDataChange>(onDataChange)
  const onActivityChangeRef = useRef<typeof onActivityChange>(onActivityChange)
  const onMetricsChangeRef = useRef<typeof onMetricsChange>(onMetricsChange)
  const hiddenSinceRef = useRef<number | null>(null)

  useEffect(() => {
    onDataChangeRef.current = onDataChange
  }, [onDataChange])

  useEffect(() => {
    onActivityChangeRef.current = onActivityChange
  }, [onActivityChange])

  useEffect(() => {
    onMetricsChangeRef.current = onMetricsChange
  }, [onMetricsChange])

  // Track page visibility to pause polling when hidden > 5 minutes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenSinceRef.current = Date.now()
      } else {
        hiddenSinceRef.current = null
        // Invalidate to get fresh data when tab becomes visible again. The prefix
        // form covers every school's entry, which is what a returning operator
        // wants: whichever school is on screen refetches.
        queryClient.invalidateQueries({ queryKey: ['admin-dashboard-polling'] })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [queryClient])

  const fetchStats = useCallback(async (): Promise<DashboardPollPayload> => {
    try {
      return await fetchDashboardStats(institutionId)
    } catch (error) {
      logger.error('[useAdminDashboardPolling] Error:', error instanceof Error ? error.message : error)
      throw error
    }
  }, [institutionId])

  const consecutiveErrorsRef = useRef(0)

  const query = useQuery({
    queryKey,
    queryFn: fetchStats,
    enabled,
    refetchInterval: enabled
      ? () => {
          // Back off on repeated errors (429 or otherwise)
          if (consecutiveErrorsRef.current > 0) {
            return Math.min(
              pollingInterval * Math.pow(2, consecutiveErrorsRef.current),
              5 * 60_000,
            )
          }
          if (document.visibilityState === 'visible') {
            return pollingInterval
          }
          // Tab is hidden — check how long
          const hiddenSince = hiddenSinceRef.current
          if (hiddenSince && Date.now() - hiddenSince >= HIDDEN_PAUSE_THRESHOLD) {
            return false // Stop polling entirely after 5 minutes hidden
          }
          return pollingInterval * 2
        }
      : false,
    staleTime: pollingInterval / 2,
    retry: (failureCount, error) => {
      const status = (error as { status?: number })?.status
      if (status === 429) return false
      return failureCount <= MAX_RETRY_ATTEMPTS
    },
    retryDelay: (attemptIndex) => getDashboardRetryDelay(attemptIndex),
  })

  // Reset or increment error counter
  useEffect(() => {
    if (query.isSuccess) consecutiveErrorsRef.current = 0
  }, [query.isSuccess])

  useEffect(() => {
    if (query.isError) consecutiveErrorsRef.current = Math.min(consecutiveErrorsRef.current + 1, 6)
  }, [query.isError, query.errorUpdateCount])

  useEffect(() => {
    const data = query.data
    // Guard against a cache entry seeded in a different shape (e.g. a stale
    // prefetch). Without this a bare-stats payload would make data.stats
    // undefined and crash statsFingerprint, taking down the whole route.
    if (!data || !data.stats) return

    // A payload that describes a different school than the one on screen is
    // discarded (task 9.2, ADM-02). The query key already separates the caches;
    // this closes the switch-in-flight race, where an in-flight poll for the
    // previous school resolves after the operator has moved on.
    if ((data.institutionId ?? null) !== institutionId) return

    const fp = statsFingerprint(data.stats)
    if (fp !== previousFingerprintRef.current) {
      previousFingerprintRef.current = fp
      setLastUpdated(new Date())
      onDataChangeRef.current?.(data.stats)
    }

    // Activity changes independently of stat counts (e.g. a payment event
    // that doesn't shift any status count), so track it with its own
    // fingerprint and push updates to the feed.
    const afp = activityFingerprint(data.activity ?? [])
    if (afp !== previousActivityFpRef.current) {
      previousActivityFpRef.current = afp
      onActivityChangeRef.current?.(data.activity ?? [])
    }

    onMetricsChangeRef.current?.(data)
  }, [query.data, institutionId])

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey })
  }, [queryClient, queryKey])

  const scopedData = (query.data?.institutionId ?? null) === institutionId ? query.data : undefined

  return {
    stats: scopedData?.stats || null,
    metrics: scopedData?.metrics ?? null,
    health: scopedData?.health ?? null,
    freshness: scopedData?.freshness ?? null,
    isLoading: query.isLoading,
    isPolling: enabled && !query.isLoading,
    error: query.error as Error | null,
    refresh,
    lastUpdated,
  }
}

export default useAdminDashboardPolling

/**
 * Granular selector: returns only the pending application count from admin dashboard polling.
 * Shares the same cache as useAdminDashboardPolling — only re-renders when pending count changes.
 * Requirement 11.3: React Query granular selectors to prevent unnecessary re-renders.
 */
export function useAdminPendingCount(
  options: { enabled?: boolean; institutionId?: string | null } = {},
) {
  const { enabled = true, institutionId = null } = options

  return useQuery({
    queryKey: adminDashboardPollingKey(institutionId),
    queryFn: () => fetchDashboardStats(institutionId),
    enabled,
    select: (data) => data.stats?.pendingApplications ?? 0,
    staleTime: POLLING_INTERVAL / 2,
  })
}

/**
 * Granular selector: returns only the total application count from admin dashboard polling.
 * Shares the same cache — only re-renders when total count changes.
 * Requirement 11.3: React Query granular selectors to prevent unnecessary re-renders.
 */
export function useAdminTotalApplicationCount(
  options: { enabled?: boolean; institutionId?: string | null } = {},
) {
  const { enabled = true, institutionId = null } = options

  return useQuery({
    queryKey: adminDashboardPollingKey(institutionId),
    queryFn: () => fetchDashboardStats(institutionId),
    enabled,
    select: (data) => data.stats?.totalApplications ?? 0,
    staleTime: POLLING_INTERVAL / 2,
  })
}
