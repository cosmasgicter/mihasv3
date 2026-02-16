/**
 * useAdminDashboardPolling Hook
 *
 * Provides polling-based data fetching for admin dashboard.
 * Uses API client for data fetching (30-second intervals).
 *
 * @module hooks/useAdminDashboardPolling
 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { apiClient } from '@/services/client'

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

  const fetchStats = useCallback(async (): Promise<AdminDashboardStats> => {
    try {
      const result = await apiClient.request<{
        totalApplications?: number
        pendingApplications?: number
        approvedApplications?: number
        rejectedApplications?: number
        todayApplications?: number
        weekApplications?: number
        pendingReviews?: number
        [key: string]: unknown
      }>('/admin?action=stats')

      return {
        totalApplications: result?.totalApplications ?? 0,
        pendingApplications: result?.pendingApplications ?? result?.pendingReviews ?? 0,
        approvedApplications: result?.approvedApplications ?? 0,
        rejectedApplications: result?.rejectedApplications ?? 0,
        todayApplications: result?.todayApplications ?? 0,
        weekApplications: result?.weekApplications ?? 0,
      }
    } catch (error) {
      console.error('[useAdminDashboardPolling] Error:', error instanceof Error ? error.message : error)
      throw error
    }
  }, [])

  const query = useQuery({
    queryKey: ['admin-dashboard-polling'],
    queryFn: fetchStats,
    enabled,
    refetchInterval: enabled ? pollingInterval : false,
    staleTime: pollingInterval / 2,
  })

  useEffect(() => {
    if (query.data) {
      setLastUpdated(new Date())
      onDataChange?.(query.data)
    }
  }, [query.data, onDataChange])

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
