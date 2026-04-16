/**
 * useAdminDashboardPolling Hook
 *
 * Provides polling-based data fetching for admin dashboard.
 * Polls GET /api/v1/admin/dashboard/ via the admin dashboard service at 30-second intervals.
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

/** Threshold in ms after which polling stops entirely when tab is hidden */
const HIDDEN_PAUSE_THRESHOLD = 300000 // 5 minutes
const MAX_RETRY_ATTEMPTS = 2
const RETRY_BASE_DELAY_MS = 1000
const RETRY_MAX_DELAY_MS = 10000

export interface AdminDashboardStats {
  totalApplications: number
  pendingApplications: number
  approvedApplications: number
  rejectedApplications: number
  todayApplications: number
  weekApplications: number
}

export interface UseAdminDashboardPollingOptions {
  enabled?: boolean
  pollingInterval?: number
  onDataChange?: (stats: AdminDashboardStats) => void
}

export interface UseAdminDashboardPollingReturn {
  stats: AdminDashboardStats | null
  isLoading: boolean
  isPolling: boolean
  error: Error | null
  refresh: () => void
  lastUpdated: Date | null
}

const POLLING_INTERVAL = 30000

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
  return `${stats.totalApplications}:${stats.pendingApplications}:${stats.approvedApplications}:${stats.rejectedApplications}:${stats.todayApplications}:${stats.weekApplications}`
}

async function fetchDashboardStats(): Promise<AdminDashboardStats> {
  const overview = await adminDashboardService.getOverview()
  const stats = overview.stats

  return {
    totalApplications: stats.totalApplications ?? 0,
    pendingApplications: stats.pendingApplications ?? 0,
    approvedApplications: stats.approvedApplications ?? 0,
    rejectedApplications: stats.rejectedApplications ?? 0,
    todayApplications: stats.todayApplications ?? 0,
    weekApplications: stats.weekApplications ?? 0,
  }
}

export function useAdminDashboardPolling(
  options: UseAdminDashboardPollingOptions = {}
): UseAdminDashboardPollingReturn {
  const {
    enabled = true,
    pollingInterval = POLLING_INTERVAL,
    onDataChange,
  } = options

  const queryClient = useQueryClient()
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const previousFingerprintRef = useRef<string | null>(null)
  const onDataChangeRef = useRef<typeof onDataChange>(onDataChange)
  const hiddenSinceRef = useRef<number | null>(null)

  useEffect(() => {
    onDataChangeRef.current = onDataChange
  }, [onDataChange])

  // Track page visibility to pause polling when hidden > 5 minutes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenSinceRef.current = Date.now()
      } else {
        hiddenSinceRef.current = null
        // Invalidate to get fresh data when tab becomes visible again
        queryClient.invalidateQueries({ queryKey: ['admin-dashboard-polling'] })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [queryClient])

  const fetchStats = useCallback(async (): Promise<AdminDashboardStats> => {
    try {
      return await fetchDashboardStats()
    } catch (error) {
      console.error('[useAdminDashboardPolling] Error:', error instanceof Error ? error.message : error)
      throw error
    }
  }, [])

  const query = useQuery({
    queryKey: ['admin-dashboard-polling'],
    queryFn: fetchStats,
    enabled,
    refetchInterval: enabled
      ? () => {
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
    retry: (failureCount) => failureCount <= MAX_RETRY_ATTEMPTS,
    retryDelay: (attemptIndex) => getDashboardRetryDelay(attemptIndex),
  })

  useEffect(() => {
    if (!query.data) return

    const fp = statsFingerprint(query.data)
    if (fp === previousFingerprintRef.current) {
      // Identical data — skip callback and timestamp update
      return
    }

    previousFingerprintRef.current = fp
    setLastUpdated(new Date())
    onDataChangeRef.current?.(query.data)
  }, [query.data])

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['admin-dashboard-polling'] })
  }, [queryClient])

  return {
    stats: query.data || null,
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
export function useAdminPendingCount(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options

  return useQuery({
    queryKey: ['admin-dashboard-polling'],
    queryFn: fetchDashboardStats,
    enabled,
    select: (data) => data.pendingApplications,
    staleTime: POLLING_INTERVAL / 2,
  })
}

/**
 * Granular selector: returns only the total application count from admin dashboard polling.
 * Shares the same cache — only re-renders when total count changes.
 * Requirement 11.3: React Query granular selectors to prevent unnecessary re-renders.
 */
export function useAdminTotalApplicationCount(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options

  return useQuery({
    queryKey: ['admin-dashboard-polling'],
    queryFn: fetchDashboardStats,
    enabled,
    select: (data) => data.totalApplications,
    staleTime: POLLING_INTERVAL / 2,
  })
}
