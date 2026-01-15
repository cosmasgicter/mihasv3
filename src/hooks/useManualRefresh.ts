/**
 * useManualRefresh Hook
 * 
 * Provides manual refresh functionality for dashboard components.
 * Uses React Query's resetQueries and refetchQueries to bypass cache
 * and fetch fresh data from the server.
 * 
 * @requirements 1.5, 4.5 - Manual refresh button that forces data reload
 */

import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'

export interface UseManualRefreshOptions {
  /** Query keys to refresh. If not provided, refreshes all application-related queries */
  queryKeys?: readonly (readonly string[])[]
  /** Callback to run after successful refresh */
  onSuccess?: () => void
  /** Callback to run on refresh error */
  onError?: (error: Error) => void
}

export interface UseManualRefreshReturn {
  /** Function to trigger a manual refresh */
  forceRefresh: () => Promise<void>
  /** Whether a refresh is currently in progress */
  isRefreshing: boolean
  /** Last refresh timestamp */
  lastRefreshed: Date | null
}

// Default query keys to refresh for dashboard data
const DEFAULT_QUERY_KEYS = [
  ['applications'],
  ['applications', 'stats'],
  ['applications', 'recent-activity'],
  ['student-dashboard'],
  ['admin-dashboard'],
  ['payment-status'],
  ['payment-stats'],
  ['notifications'],
  ['application-stats'],
  ['application-history']
] as const

/**
 * Hook for manual refresh functionality
 * 
 * Provides a forceRefresh function that:
 * 1. Resets all matching queries (clears cache)
 * 2. Refetches all active queries
 * 3. Tracks loading state for UI feedback
 * 
 * @example
 * ```tsx
 * const { forceRefresh, isRefreshing } = useManualRefresh()
 * 
 * return (
 *   <Button onClick={forceRefresh} disabled={isRefreshing}>
 *     {isRefreshing ? 'Refreshing...' : 'Refresh'}
 *   </Button>
 * )
 * ```
 */
export function useManualRefresh(options: UseManualRefreshOptions = {}): UseManualRefreshReturn {
  const { queryKeys = DEFAULT_QUERY_KEYS, onSuccess, onError } = options
  const queryClient = useQueryClient()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  const forceRefresh = useCallback(async () => {
    if (isRefreshing) return // Prevent concurrent refreshes

    setIsRefreshing(true)

    try {
      // Reset all matching queries to clear stale cache
      const resetPromises = queryKeys.map(queryKey =>
        queryClient.resetQueries({
          queryKey: queryKey as readonly string[],
          exact: false
        })
      )
      await Promise.all(resetPromises)

      // Refetch all active queries to get fresh data
      const refetchPromises = queryKeys.map(queryKey =>
        queryClient.refetchQueries({
          queryKey: queryKey as readonly string[],
          type: 'active'
        })
      )
      await Promise.all(refetchPromises)

      // Update last refreshed timestamp
      setLastRefreshed(new Date())

      // Call success callback if provided
      onSuccess?.()
    } catch (error) {
      console.error('Manual refresh failed:', error)
      // Call error callback if provided
      onError?.(error instanceof Error ? error : new Error('Refresh failed'))
    } finally {
      setIsRefreshing(false)
    }
  }, [queryClient, queryKeys, isRefreshing, onSuccess, onError])

  return {
    forceRefresh,
    isRefreshing,
    lastRefreshed
  }
}

/**
 * Specialized hook for student dashboard refresh
 * Pre-configured with student-specific query keys
 */
export function useStudentDashboardRefresh(options: Omit<UseManualRefreshOptions, 'queryKeys'> = {}) {
  return useManualRefresh({
    ...options,
    queryKeys: [
      ['applications'],
      ['applications', 'stats'],
      ['student-dashboard'],
      ['payment-status'],
      ['notifications']
    ]
  })
}

/**
 * Specialized hook for admin dashboard refresh
 * Pre-configured with admin-specific query keys
 */
export function useAdminDashboardRefresh(options: Omit<UseManualRefreshOptions, 'queryKeys'> = {}) {
  return useManualRefresh({
    ...options,
    queryKeys: [
      ['applications'],
      ['applications', 'stats'],
      ['applications', 'recent-activity'],
      ['admin-dashboard'],
      ['payment-status'],
      ['payment-stats'],
      ['application-history']
    ]
  })
}

export default useManualRefresh
