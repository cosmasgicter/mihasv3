# Cache Monitoring System

## Overview

The Cache Monitoring System provides comprehensive tracking and analysis of React Query cache performance in the MIHAS Application System. It helps identify performance bottlenecks, optimize cache strategies, and ensure efficient data fetching.

**Validates: Requirements 3.5**

## Features

### 1. Real-time Metrics Collection

- **Cache Hit Rate**: Percentage of requests served from cache vs. network
- **Query Performance**: Average query execution time and slow query detection
- **Cache Size**: Approximate memory usage of cached data
- **Query Status**: Breakdown of queries by status (success, error, loading, idle)

### 2. Performance Logging

- Detailed logs of cache operations
- Slow query detection (>1000ms threshold)
- Historical metrics tracking
- Export functionality for analysis

### 3. Automatic Monitoring

- Initializes automatically in production
- Collects metrics every 30 seconds
- Maintains rolling history (last 100 metrics)
- Logs warnings for poor performance

## Usage

### Basic Usage in Components

```typescript
import { useCacheMonitor } from '@/hooks/useCacheMonitor'

function MyComponent() {
  const { metrics, stats, isMonitoring } = useCacheMonitor({
    autoRefresh: true,
    refreshInterval: 5000
  })

  return (
    <div>
      <h2>Cache Performance</h2>
      <p>Hit Rate: {stats.hitRate.toFixed(2)}%</p>
      <p>Total Queries: {metrics?.totalQueries}</p>
      <p>Average Query Time: {stats.averageQueryTime.toFixed(2)}ms</p>
    </div>
  )
}
```

### Admin Dashboard

A complete cache monitoring dashboard is available for administrators:

```typescript
import { CacheMonitorDashboard } from '@/components/admin/CacheMonitorDashboard'

function AdminPage() {
  return <CacheMonitorDashboard />
}
```

### Manual Tracking

Track individual query performance:

```typescript
import { useQueryPerformanceTracker } from '@/hooks/useCacheMonitor'

function MyComponent() {
  const trackQuery = useQueryPerformanceTracker()
  
  const { data } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const startTime = Date.now()
      const result = await fetchUsers()
      trackQuery(['users'], startTime)
      return result
    }
  })
}
```

### Programmatic Access

Access cache monitor directly:

```typescript
import { cacheMonitor } from '@/services/cacheMonitor'

// Get current metrics
const metrics = cacheMonitor.getCurrentMetrics()

// Get statistics
const stats = cacheMonitor.getCacheStats()

// Get performance logs
const logs = cacheMonitor.getPerformanceLogs(50)

// Export all data
const exported = cacheMonitor.exportMetrics()

// Reset monitoring data
cacheMonitor.reset()
```

## Metrics Explained

### Cache Hit Rate

The percentage of requests served from cache without making a network request.

- **Good**: >70% - Cache is working efficiently
- **Fair**: 50-70% - Room for improvement
- **Poor**: <50% - Consider increasing staleTime

### Average Query Time

The average time taken for queries to complete.

- **Good**: <500ms - Fast queries
- **Fair**: 500-1000ms - Acceptable performance
- **Poor**: >1000ms - Optimization needed

### Slow Queries

Queries that take longer than 1000ms to complete. These should be investigated and optimized.

### Cache Size

Approximate memory usage of cached data. Large cache sizes may impact performance on low-memory devices.

## Performance Recommendations

### Low Cache Hit Rate (<50%)

**Problem**: Too many network requests, cache not being utilized effectively.

**Solutions**:
- Increase `staleTime` for frequently accessed data
- Review cache invalidation logic
- Consider prefetching common queries

```typescript
// Example: Increase staleTime for static data
useQuery({
  queryKey: ['programs'],
  queryFn: fetchPrograms,
  staleTime: 30 * 60 * 1000 // 30 minutes
})
```

### High Average Query Time (>1000ms)

**Problem**: Queries are taking too long to complete.

**Solutions**:
- Optimize API endpoints
- Add database indexes
- Implement pagination
- Use query result caching

### Large Cache Size (>5MB)

**Problem**: Cache is consuming significant memory.

**Solutions**:
- Reduce `gcTime` to clean up old data faster
- Implement selective caching
- Clear cache for unused queries

```typescript
// Example: Reduce gcTime
useQuery({
  queryKey: ['temporary-data'],
  queryFn: fetchData,
  gcTime: 5 * 60 * 1000 // 5 minutes instead of default
})
```

### Multiple Slow Queries

**Problem**: Several queries are performing poorly.

**Solutions**:
- Review and optimize slow queries individually
- Consider implementing query batching
- Use parallel queries where possible
- Add loading states to improve perceived performance

## Configuration

### Cache Monitor Settings

Located in `src/services/cacheMonitor.ts`:

```typescript
// Maximum metrics history to keep
MAX_METRICS_HISTORY = 100

// Maximum performance logs to keep
MAX_PERFORMANCE_LOGS = 500

// Threshold for slow query detection
SLOW_QUERY_THRESHOLD_MS = 1000

// Monitoring interval
MONITORING_INTERVAL_MS = 30000 // 30 seconds
```

### React Query Cache Configuration

Located in `src/hooks/queries/useSupabaseQuery.ts`:

```typescript
export const CACHE_CONFIG = {
  auth: { 
    staleTime: 10 * 60 * 1000,  // 10 minutes
    gcTime: 30 * 60 * 1000       // 30 minutes
  },
  applications: { 
    staleTime: 1 * 60 * 1000,    // 1 minute
    gcTime: 5 * 60 * 1000        // 5 minutes
  },
  users: { 
    staleTime: 15 * 60 * 1000,   // 15 minutes
    gcTime: 30 * 60 * 1000       // 30 minutes
  },
  analytics: { 
    staleTime: 30 * 60 * 1000,   // 30 minutes
    gcTime: 60 * 60 * 1000       // 60 minutes
  },
  static: { 
    staleTime: 2 * 60 * 60 * 1000,  // 2 hours
    gcTime: 24 * 60 * 60 * 1000     // 24 hours
  },
  realtime: { 
    staleTime: 15 * 1000,        // 15 seconds
    gcTime: 60 * 1000            // 60 seconds
  }
}
```

## Monitoring in Production

The cache monitor is automatically initialized in production mode:

```typescript
// src/App.tsx
if (import.meta.env.PROD) {
  cacheMonitor.initialize(queryClient)
}
```

### Accessing Metrics in Production

1. **Admin Dashboard**: Navigate to `/admin/cache-monitor` (if route is configured)
2. **Browser Console**: Access via `window.cacheMonitor` (if exposed)
3. **Export Data**: Use the export button in the admin dashboard

### Console Warnings

The cache monitor logs warnings for:
- Low cache hit rate (<50%)
- Slow queries (>1000ms)
- Multiple slow queries detected

## API Reference

### CacheMonitorService

#### Methods

- `initialize(queryClient: QueryClient)`: Initialize monitoring
- `stopMonitoring()`: Stop monitoring
- `getCurrentMetrics()`: Get current metrics snapshot
- `getMetricsHistory(limit?)`: Get historical metrics
- `getPerformanceLogs(limit?)`: Get performance logs
- `getCacheStats()`: Get statistics summary
- `trackQueryTime(queryKey, startTime)`: Track query execution time
- `reset()`: Reset all monitoring data
- `exportMetrics()`: Export all metrics data
- `getStatus()`: Get monitoring status

### useCacheMonitor Hook

#### Options

- `autoRefresh`: Enable automatic refresh (default: false)
- `refreshInterval`: Refresh interval in ms (default: 5000)
- `enableLogging`: Enable console logging (default: false)

#### Returns

- `metrics`: Current cache metrics
- `stats`: Cache statistics summary
- `isMonitoring`: Whether monitoring is active
- `refresh()`: Manually refresh metrics
- `exportData()`: Export all metrics data

## Troubleshooting

### Monitoring Not Working

1. Check if cache monitor is initialized:
   ```typescript
   const status = cacheMonitor.getStatus()
   console.log(status.initialized, status.isMonitoring)
   ```

2. Verify QueryClient is passed correctly:
   ```typescript
   cacheMonitor.initialize(queryClient)
   ```

3. Check browser console for errors

### Metrics Not Updating

1. Ensure auto-refresh is enabled in the hook
2. Check monitoring interval (default: 30 seconds)
3. Verify queries are actually being executed

### High Memory Usage

1. Reduce `MAX_METRICS_HISTORY` and `MAX_PERFORMANCE_LOGS`
2. Call `cacheMonitor.reset()` periodically
3. Reduce React Query cache sizes

## Best Practices

1. **Monitor in Production**: Enable monitoring in production to catch real-world performance issues
2. **Regular Reviews**: Review cache metrics weekly to identify trends
3. **Set Alerts**: Configure alerts for low hit rates or slow queries
4. **Export Data**: Regularly export metrics for long-term analysis
5. **Optimize Iteratively**: Use metrics to guide cache optimization efforts
6. **Document Changes**: Track cache configuration changes and their impact

## Related Documentation

- [React Query Documentation](https://tanstack.com/query/latest)
- [Performance Optimization Guide](./PERFORMANCE_OPTIMIZATION_PLAN.md)
- [Caching Strategies](./guides/CACHE_OPTIMIZATION_QUICK_REFERENCE.md)

## Support

For issues or questions about cache monitoring:
1. Check this documentation
2. Review console warnings and logs
3. Export metrics data for analysis
4. Contact the development team with exported data
