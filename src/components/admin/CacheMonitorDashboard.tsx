/**
 * Cache Monitor Dashboard Component
 * 
 * Displays React Query cache performance metrics for administrators
 * 
 * Validates: Requirements 3.5
 */

import React from 'react'
import { useCacheMonitor } from '@/hooks/useCacheMonitor'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function CacheMonitorDashboard() {
  const { metrics, stats, isMonitoring, refresh, exportData } = useCacheMonitor({
    autoRefresh: true,
    refreshInterval: 5000
  })

  const handleExport = () => {
    const data = exportData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cache-metrics-${new Date().toISOString()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!metrics) {
    return (
      <Card className="p-6">
        <p className="text-muted-foreground">Loading cache metrics...</p>
      </Card>
    )
  }

  const hitRateColor = stats.hitRate >= 70 ? 'text-green-600' : stats.hitRate >= 50 ? 'text-yellow-600' : 'text-red-600'
  const avgQueryTimeColor = stats.averageQueryTime <= 500 ? 'text-green-600' : stats.averageQueryTime <= 1000 ? 'text-yellow-600' : 'text-red-600'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Cache Performance Monitor</h2>
          <p className="text-sm text-muted-foreground">
            Real-time React Query cache metrics
            {isMonitoring && <span className="ml-2 text-green-600">● Monitoring Active</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={refresh} variant="outline" size="sm">
            Refresh
          </Button>
          <Button onClick={handleExport} variant="outline" size="sm">
            Export Data
          </Button>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Cache Hit Rate</div>
          <div className={`text-3xl font-bold ${hitRateColor}`}>
            {stats.hitRate.toFixed(1)}%
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {stats.totalHits} hits / {stats.totalRequests} requests
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Total Queries</div>
          <div className="text-3xl font-bold">{metrics.totalQueries}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {metrics.activeQueries} active, {metrics.staleQueries} stale
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Cache Size</div>
          <div className="text-3xl font-bold">
            {(metrics.totalCacheSize / 1024).toFixed(1)} KB
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Approximate memory usage
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Avg Query Time</div>
          <div className={`text-3xl font-bold ${avgQueryTimeColor}`}>
            {stats.averageQueryTime.toFixed(0)}ms
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {stats.slowQueriesCount} slow queries
          </div>
        </Card>
      </div>

      {/* Query Status Breakdown */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Query Status Breakdown</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-sm text-muted-foreground">Success</div>
            <div className="text-2xl font-bold text-green-600">
              {metrics.queriesByStatus.success}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Error</div>
            <div className="text-2xl font-bold text-red-600">
              {metrics.queriesByStatus.error}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Loading</div>
            <div className="text-2xl font-bold text-blue-600">
              {metrics.queriesByStatus.loading}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Idle</div>
            <div className="text-2xl font-bold text-gray-600">
              {metrics.queriesByStatus.idle}
            </div>
          </div>
        </div>
      </Card>

      {/* Slow Queries */}
      {metrics.slowQueries.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Slow Queries (>{1000}ms)</h3>
          <div className="space-y-2">
            {metrics.slowQueries.map((query, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-muted rounded-lg"
              >
                <div className="flex-1">
                  <code className="text-sm">
                    {JSON.stringify(query.queryKey)}
                  </code>
                  <div className="text-xs text-muted-foreground mt-1">
                    Status: {query.status}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-red-600">
                    {query.duration.toFixed(0)}ms
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(query.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Performance Recommendations */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Performance Recommendations</h3>
        <div className="space-y-2">
          {stats.hitRate < 50 && stats.totalRequests > 10 && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="font-semibold text-yellow-800">Low Cache Hit Rate</div>
              <div className="text-sm text-yellow-700">
                Consider increasing staleTime for frequently accessed data to improve cache efficiency.
              </div>
            </div>
          )}
          
          {stats.averageQueryTime > 1000 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="font-semibold text-red-800">High Average Query Time</div>
              <div className="text-sm text-red-700">
                Queries are taking longer than expected. Consider optimizing API endpoints or adding indexes.
              </div>
            </div>
          )}
          
          {metrics.totalCacheSize > 5 * 1024 * 1024 && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="font-semibold text-orange-800">Large Cache Size</div>
              <div className="text-sm text-orange-700">
                Cache is using significant memory. Consider reducing gcTime or implementing selective caching.
              </div>
            </div>
          )}
          
          {stats.slowQueriesCount > 5 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="font-semibold text-red-800">Multiple Slow Queries</div>
              <div className="text-sm text-red-700">
                {stats.slowQueriesCount} queries are taking longer than 1 second. Review and optimize these queries.
              </div>
            </div>
          )}
          
          {stats.hitRate >= 70 && stats.averageQueryTime <= 500 && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="font-semibold text-green-800">Excellent Performance</div>
              <div className="text-sm text-green-700">
                Cache is performing well with good hit rate and fast query times.
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Last Updated */}
      <div className="text-sm text-muted-foreground text-center">
        Last updated: {metrics.timestamp.toLocaleString()}
      </div>
    </div>
  )
}
