/**
 * React Hook for Cache Monitoring
 * 
 * Provides easy access to cache performance metrics in React components
 * 
 * Validates: Requirements 3.5
 */

import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { cacheMonitor, type CacheMetrics } from '@/services/cacheMonitor'

export interface UseCacheMonitorOptions {
  /**
   * Enable automatic refresh of metrics
   */
  autoRefresh?: boolean
  
  /**
   * Refresh interval in milliseconds (default: 5000ms)
   */
  refreshInterval?: number
  
  /**
   * Enable console logging of metrics
   */
  enableLogging?: boolean
}

export interface UseCacheMonitorReturn {
  /**
   * Current cache metrics
   */
  metrics: CacheMetrics | null
  
  /**
   * Cache statistics summary
   */
  stats: ReturnType<typeof cacheMonitor.getCacheStats>
  
  /**
   * Whether monitoring is active
   */
  isMonitoring: boolean
  
  /**
   * Manually refresh metrics
   */
  refresh: () => void
  
  /**
   * Export all metrics data
   */
  exportData: () => ReturnType<typeof cacheMonitor.exportMetrics>
}

/**
 * Hook to monitor React Query cache performance
 * 
 * @example
 * ```tsx
 * function CacheMonitorDashboard() {
 *   const { metrics, stats, isMonitoring } = useCacheMonitor({
 *     autoRefresh: true,
 *     refreshInterval: 5000
 *   })
 * 
 *   return (
 *     <div>
 *       <h2>Cache Performance</h2>
 *       <p>Hit Rate: {stats.hitRate.toFixed(2)}%</p>
 *       <p>Total Queries: {metrics?.totalQueries}</p>
 *       <p>Average Query Time: {stats.averageQueryTime.toFixed(2)}ms</p>
 *     </div>
 *   )
 * }
 * ```
 */
export function useCacheMonitor(options: UseCacheMonitorOptions = {}): UseCacheMonitorReturn {
  const {
    autoRefresh = false,
    refreshInterval = 5000,
    enableLogging = false
  } = options

  const queryClient = useQueryClient()
  const [metrics, setMetrics] = useState<CacheMetrics | null>(null)
  const [stats, setStats] = useState(cacheMonitor.getCacheStats())
  const [isMonitoring, setIsMonitoring] = useState(false)

  // Initialize cache monitor on mount
  useEffect(() => {
    const status = cacheMonitor.getStatus()
    
    if (!status.initialized) {
      cacheMonitor.initialize(queryClient)
    }
    
    setIsMonitoring(status.isMonitoring)
    
    // Initial metrics load
    refresh()
  }, [queryClient])

  // Auto-refresh metrics
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      refresh()
    }, refreshInterval)

    return () => clearInterval(interval)
  }, [autoRefresh, refreshInterval])

  // Log metrics if enabled
  useEffect(() => {
    if (enableLogging && metrics) {
      console.group('📊 Cache Metrics')
      console.log('Hit Rate:', `${metrics.hitRate.toFixed(2)}%`)
      console.log('Total Queries:', metrics.totalQueries)
      console.log('Active Queries:', metrics.activeQueries)
      console.log('Stale Queries:', metrics.staleQueries)
      console.log('Cache Size:', `${(metrics.totalCacheSize / 1024).toFixed(2)} KB`)
      console.log('Average Query Time:', `${metrics.averageQueryTime.toFixed(2)}ms`)
      
      if (metrics.slowQueries.length > 0) {
        console.warn('Slow Queries:', metrics.slowQueries)
      }
      
      console.groupEnd()
    }
  }, [metrics, enableLogging])

  const refresh = () => {
    const currentMetrics = cacheMonitor.getCurrentMetrics()
    const currentStats = cacheMonitor.getCacheStats()
    
    setMetrics(currentMetrics)
    setStats(currentStats)
  }

  const exportData = () => {
    return cacheMonitor.exportMetrics()
  }

  return {
    metrics,
    stats,
    isMonitoring,
    refresh,
    exportData
  }
}

/**
 * Hook to track individual query performance
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const trackQuery = useQueryPerformanceTracker()
 *   
 *   const { data } = useQuery({
 *     queryKey: ['users'],
 *     queryFn: async () => {
 *       const startTime = Date.now()
 *       const result = await fetchUsers()
 *       trackQuery(['users'], startTime)
 *       return result
 *     }
 *   })
 * }
 * ```
 */
export function useQueryPerformanceTracker() {
  return (queryKey: string[], startTime: number) => {
    cacheMonitor.trackQueryTime(queryKey, startTime)
  }
}
