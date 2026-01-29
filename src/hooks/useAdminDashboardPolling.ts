/**
 * useAdminDashboardPolling Hook
 * 
 * Provides polling-based data fetching for admin dashboard.
 * Replaces Supabase Realtime with React Query polling (30-second intervals).
 * 
 * @module hooks/useAdminDashboardPolling
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface AdminDashboardStats {
  totalApplications: number
  pendingApplications: number
  approvedApplications: number
  rejectedApplications: number
  todayApplications: number
  weekApplications: number
}

export interface UseAdminDashboardPollingOptions {
  /** Whether to enable polling (default: true) */
  enabled?: boolean
  /** Polling interval in milliseconds (default: 30000 = 30 seconds) */
  pollingInterval?: number
  /** Callback when data changes */
  onDataChange?: (stats: AdminDashboardStats) => void
}

export interface UseAdminDashboardPollingReturn {
  /** Current dashboard statistics */
  stats: AdminDashboardStats | null
  /** Whether data is currently loading */
  isLoading: boolean
  /** Whether polling is active */
  isPolling: boolean
  /** Any error that occurred */
  error: Error | null
  /** Manually refresh data */
  refresh: () => void
  /** Last update timestamp */
  lastUpdated: Date | null
}

const POLLING_INTERVAL = 30000 // 30 seconds

/**
 * Hook for polling admin dashboard data
 * 
 * @example
 * ```tsx
 * function AdminDashboard() {
 *   const { stats, isLoading, isPolling, refresh } = useAdminDashboardPolling({
 *     onDataChange: (newStats) => {
 *       console.log('Dashboard updated:', newStats)
 *     }
 *   })
 *   
 *   return (
 *     <div>
 *       {isPolling && <span>Live updates active</span>}
 *       <p>Total: {stats?.totalApplications}</p>
 *       <button onClick={refresh}>Refresh Now</button>
 *     </div>
 *   )
 * }
 * ```
 */
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

  // Fetch dashboard stats
  const fetchStats = useCallback(async (): Promise<AdminDashboardStats> => {
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const [
      totalResult,
      pendingResult,
      approvedResult,
      rejectedResult,
      todayResult,
      weekResult,
    ] = await Promise.all([
      supabase.from('applications').select('*', { count: 'exact', head: true }),
      supabase.from('applications').select('*', { count: 'exact', head: true }).in('status', ['submitted', 'under_review']),
      supabase.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
      supabase.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
      supabase.from('applications').select('*', { count: 'exact', head: true }).gte('created_at', today),
      supabase.from('applications').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo),
    ])

    return {
      totalApplications: totalResult.count || 0,
      pendingApplications: pendingResult.count || 0,
      approvedApplications: approvedResult.count || 0,
      rejectedApplications: rejectedResult.count || 0,
      todayApplications: todayResult.count || 0,
      weekApplications: weekResult.count || 0,
    }
  }, [])

  const query = useQuery({
    queryKey: ['admin-dashboard-polling'],
    queryFn: fetchStats,
    enabled,
    refetchInterval: enabled ? pollingInterval : false,
    staleTime: pollingInterval / 2,
  })

  // Track last update and notify on change
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
