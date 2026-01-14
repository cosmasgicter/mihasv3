/**
 * Cache Monitoring Service
 * 
 * Tracks React Query cache performance metrics including:
 * - Cache hit rates
 * - Cache size and memory usage
 * - Query performance
 * - Cache efficiency
 * 
 * Validates: Requirements 3.5
 */

import { QueryClient } from '@tanstack/react-query'

export interface CacheMetrics {
  timestamp: Date
  totalQueries: number
  activeQueries: number
  staleQueries: number
  cacheHits: number
  cacheMisses: number
  hitRate: number
  totalCacheSize: number
  queriesByStatus: {
    success: number
    error: number
    loading: number
    idle: number
  }
  averageQueryTime: number
  slowQueries: SlowQuery[]
}

export interface SlowQuery {
  queryKey: string[]
  duration: number
  timestamp: Date
  status: string
}

export interface CachePerformanceLog {
  timestamp: Date
  metric: string
  value: number
  unit: string
  context?: Record<string, any>
}

class CacheMonitorService {
  private queryClient: QueryClient | null = null
  private metrics: CacheMetrics[] = []
  private performanceLogs: CachePerformanceLog[] = []
  private queryTimings: Map<string, number> = new Map()
  private cacheHits = 0
  private cacheMisses = 0
  private isMonitoring = false
  private monitoringInterval: NodeJS.Timeout | null = null
  
  // Configuration
  private readonly MAX_METRICS_HISTORY = 100
  private readonly MAX_PERFORMANCE_LOGS = 500
  private readonly SLOW_QUERY_THRESHOLD_MS = 1000
  private readonly MONITORING_INTERVAL_MS = 30000 // 30 seconds

  /**
   * Initialize cache monitoring with a QueryClient instance
   */
  initialize(queryClient: QueryClient): void {
    if (this.queryClient) {
      console.warn('Cache monitor already initialized')
      return
    }

    this.queryClient = queryClient
    this.setupQueryObserver()
    this.startMonitoring()
    
    console.log('Cache monitoring initialized')
  }

  /**
   * Set up query observer to track cache hits/misses
   */
  private setupQueryObserver(): void {
    if (!this.queryClient) return

    const cache = this.queryClient.getQueryCache()
    
    // Subscribe to cache events
    cache.subscribe((event) => {
      if (!event) return

      const queryKey = event.query.queryKey
      const keyString = JSON.stringify(queryKey)

      switch (event.type) {
        case 'added':
          // New query added to cache
          this.cacheMisses++
          this.logPerformance('cache_miss', 1, 'count', { queryKey })
          break

        case 'updated':
          // Query updated - check if it was from cache or network
          const query = event.query
          if (query.state.dataUpdateCount > 0) {
            // Data was fetched from network
            this.cacheMisses++
            this.logPerformance('cache_miss', 1, 'count', { queryKey })
          } else if (query.state.data !== undefined) {
            // Data served from cache
            this.cacheHits++
            this.logPerformance('cache_hit', 1, 'count', { queryKey })
          }
          break

        case 'removed':
          // Query removed from cache
          this.queryTimings.delete(keyString)
          break
      }
    })
  }

  /**
   * Start periodic monitoring
   */
  private startMonitoring(): void {
    if (this.isMonitoring) return

    this.isMonitoring = true
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics()
    }, this.MONITORING_INTERVAL_MS)

    // Collect initial metrics
    this.collectMetrics()
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
    }
    this.isMonitoring = false
  }

  /**
   * Collect current cache metrics
   */
  private collectMetrics(): void {
    if (!this.queryClient) return

    const cache = this.queryClient.getQueryCache()
    const queries = cache.getAll()

    // Calculate metrics
    const totalQueries = queries.length
    const activeQueries = queries.filter(q => q.state.fetchStatus === 'fetching').length
    const staleQueries = queries.filter(q => q.isStale()).length

    const queriesByStatus = {
      success: queries.filter(q => q.state.status === 'success').length,
      error: queries.filter(q => q.state.status === 'error').length,
      loading: queries.filter(q => q.state.status === 'pending').length,
      idle: queries.filter(q => q.state.fetchStatus === 'idle').length
    }

    // Calculate cache hit rate
    const totalRequests = this.cacheHits + this.cacheMisses
    const hitRate = totalRequests > 0 ? (this.cacheHits / totalRequests) * 100 : 0

    // Calculate cache size (approximate)
    const totalCacheSize = this.estimateCacheSize(queries)

    // Find slow queries
    const slowQueries = this.findSlowQueries(queries)

    // Calculate average query time
    const queryTimes = Array.from(this.queryTimings.values())
    const averageQueryTime = queryTimes.length > 0
      ? queryTimes.reduce((sum, time) => sum + time, 0) / queryTimes.length
      : 0

    const metrics: CacheMetrics = {
      timestamp: new Date(),
      totalQueries,
      activeQueries,
      staleQueries,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      hitRate,
      totalCacheSize,
      queriesByStatus,
      averageQueryTime,
      slowQueries
    }

    // Store metrics
    this.metrics.push(metrics)
    if (this.metrics.length > this.MAX_METRICS_HISTORY) {
      this.metrics.shift()
    }

    // Log key metrics
    this.logPerformance('cache_hit_rate', hitRate, '%')
    this.logPerformance('total_queries', totalQueries, 'count')
    this.logPerformance('cache_size', totalCacheSize, 'bytes')
    this.logPerformance('average_query_time', averageQueryTime, 'ms')

    // Log summary in development
    if (import.meta.env.DEV) {
      console.log('[Cache Monitor] Metrics collected:', {
        hitRate: `${hitRate.toFixed(1)}%`,
        totalQueries,
        cacheSize: `${(totalCacheSize / 1024).toFixed(1)} KB`,
        avgQueryTime: `${averageQueryTime.toFixed(0)}ms`
      })
    }

    // Log warnings for poor performance
    if (hitRate < 50 && totalRequests > 10) {
      console.warn(`[Cache Monitor] Low cache hit rate: ${hitRate.toFixed(2)}%`)
    }

    if (slowQueries.length > 0) {
      console.warn(`[Cache Monitor] Found ${slowQueries.length} slow queries`)
    }
  }

  /**
   * Estimate cache size in bytes
   */
  private estimateCacheSize(queries: any[]): number {
    let totalSize = 0

    for (const query of queries) {
      try {
        // Rough estimation using JSON serialization
        const dataString = JSON.stringify(query.state.data)
        totalSize += dataString.length * 2 // UTF-16 encoding (2 bytes per char)
      } catch (error) {
        // Skip queries with circular references or non-serializable data
        continue
      }
    }

    return totalSize
  }

  /**
   * Find queries that took longer than threshold
   */
  private findSlowQueries(queries: any[]): SlowQuery[] {
    const slowQueries: SlowQuery[] = []

    for (const query of queries) {
      const keyString = JSON.stringify(query.queryKey)
      const duration = this.queryTimings.get(keyString)

      if (duration && duration > this.SLOW_QUERY_THRESHOLD_MS) {
        slowQueries.push({
          queryKey: query.queryKey,
          duration,
          timestamp: new Date(query.state.dataUpdatedAt),
          status: query.state.status
        })
      }
    }

    return slowQueries.sort((a, b) => b.duration - a.duration).slice(0, 10)
  }

  /**
   * Track query execution time
   */
  trackQueryTime(queryKey: string[], startTime: number): void {
    const duration = Date.now() - startTime
    const keyString = JSON.stringify(queryKey)
    this.queryTimings.set(keyString, duration)

    // Log slow queries immediately
    if (duration > this.SLOW_QUERY_THRESHOLD_MS) {
      console.warn(`Slow query detected: ${keyString} took ${duration}ms`)
      this.logPerformance('slow_query', duration, 'ms', { queryKey })
    }
  }

  /**
   * Log a performance metric
   */
  private logPerformance(
    metric: string,
    value: number,
    unit: string,
    context?: Record<string, any>
  ): void {
    const log: CachePerformanceLog = {
      timestamp: new Date(),
      metric,
      value,
      unit,
      context
    }

    this.performanceLogs.push(log)

    // Trim logs if exceeding max
    if (this.performanceLogs.length > this.MAX_PERFORMANCE_LOGS) {
      this.performanceLogs.shift()
    }
  }

  /**
   * Get current cache metrics
   */
  getCurrentMetrics(): CacheMetrics | null {
    return this.metrics[this.metrics.length - 1] || null
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(limit?: number): CacheMetrics[] {
    if (limit) {
      return this.metrics.slice(-limit)
    }
    return [...this.metrics]
  }

  /**
   * Get performance logs
   */
  getPerformanceLogs(limit?: number): CachePerformanceLog[] {
    if (limit) {
      return this.performanceLogs.slice(-limit)
    }
    return [...this.performanceLogs]
  }

  /**
   * Get cache statistics summary
   */
  getCacheStats(): {
    hitRate: number
    totalHits: number
    totalMisses: number
    totalRequests: number
    averageQueryTime: number
    slowQueriesCount: number
  } {
    const currentMetrics = this.getCurrentMetrics()
    const totalRequests = this.cacheHits + this.cacheMisses

    return {
      hitRate: currentMetrics?.hitRate || 0,
      totalHits: this.cacheHits,
      totalMisses: this.cacheMisses,
      totalRequests,
      averageQueryTime: currentMetrics?.averageQueryTime || 0,
      slowQueriesCount: currentMetrics?.slowQueries.length || 0
    }
  }

  /**
   * Reset monitoring statistics
   */
  reset(): void {
    this.metrics = []
    this.performanceLogs = []
    this.queryTimings.clear()
    this.cacheHits = 0
    this.cacheMisses = 0
  }

  /**
   * Export metrics for analysis
   */
  exportMetrics(): {
    metrics: CacheMetrics[]
    logs: CachePerformanceLog[]
    stats: ReturnType<typeof this.getCacheStats>
  } {
    return {
      metrics: this.getMetricsHistory(),
      logs: this.getPerformanceLogs(),
      stats: this.getCacheStats()
    }
  }

  /**
   * Get monitoring status
   */
  getStatus(): {
    isMonitoring: boolean
    metricsCount: number
    logsCount: number
    initialized: boolean
  } {
    return {
      isMonitoring: this.isMonitoring,
      metricsCount: this.metrics.length,
      logsCount: this.performanceLogs.length,
      initialized: this.queryClient !== null
    }
  }
}

// Export singleton instance
export const cacheMonitor = new CacheMonitorService()
