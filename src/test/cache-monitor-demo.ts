/**
 * Cache Monitor Demonstration
 * 
 * This script demonstrates the cache monitoring functionality
 * Run with: node --loader tsx src/test/cache-monitor-demo.ts
 */

import { QueryClient } from '@tanstack/react-query'
import { cacheMonitor } from '../services/cacheMonitor'

async function demonstrateCacheMonitoring() {
  console.log('🚀 Starting Cache Monitor Demonstration\n')

  // Create a QueryClient
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5000,
        gcTime: 10000
      }
    }
  })

  // Initialize cache monitor
  console.log('📊 Initializing cache monitor...')
  cacheMonitor.initialize(queryClient)
  
  const status = cacheMonitor.getStatus()
  console.log('✅ Cache monitor initialized:', status)
  console.log('')

  // Simulate some queries
  console.log('🔄 Simulating queries...\n')

  // Query 1: Fast query
  const startTime1 = Date.now()
  await queryClient.fetchQuery({
    queryKey: ['users', 'list'],
    queryFn: async () => {
      await new Promise(resolve => setTimeout(resolve, 100))
      return { users: ['Alice', 'Bob', 'Charlie'] }
    }
  })
  cacheMonitor.trackQueryTime(['users', 'list'], startTime1)
  console.log('✓ Query 1 completed (fast)')

  // Query 2: Slow query
  const startTime2 = Date.now()
  await queryClient.fetchQuery({
    queryKey: ['reports', 'analytics'],
    queryFn: async () => {
      await new Promise(resolve => setTimeout(resolve, 1200))
      return { data: 'analytics data' }
    }
  })
  cacheMonitor.trackQueryTime(['reports', 'analytics'], startTime2)
  console.log('✓ Query 2 completed (slow)')

  // Query 3: Another fast query
  const startTime3 = Date.now()
  await queryClient.fetchQuery({
    queryKey: ['applications', 'recent'],
    queryFn: async () => {
      await new Promise(resolve => setTimeout(resolve, 200))
      return { applications: [] }
    }
  })
  cacheMonitor.trackQueryTime(['applications', 'recent'], startTime3)
  console.log('✓ Query 3 completed (fast)')

  // Query 4: Cache hit (refetch same query)
  console.log('\n🔄 Refetching cached query...')
  await queryClient.fetchQuery({
    queryKey: ['users', 'list'],
    queryFn: async () => {
      await new Promise(resolve => setTimeout(resolve, 100))
      return { users: ['Alice', 'Bob', 'Charlie'] }
    }
  })
  console.log('✓ Query 4 completed (cache hit)')

  // Wait a moment for metrics to be collected
  await new Promise(resolve => setTimeout(resolve, 500))

  // Display metrics
  console.log('\n📈 Cache Metrics:\n')
  const metrics = cacheMonitor.getCurrentMetrics()
  
  if (metrics) {
    console.log('Cache Performance:')
    console.log(`  Hit Rate: ${metrics.hitRate.toFixed(1)}%`)
    console.log(`  Total Queries: ${metrics.totalQueries}`)
    console.log(`  Cache Hits: ${metrics.cacheHits}`)
    console.log(`  Cache Misses: ${metrics.cacheMisses}`)
    console.log(`  Cache Size: ${(metrics.totalCacheSize / 1024).toFixed(2)} KB`)
    console.log(`  Average Query Time: ${metrics.averageQueryTime.toFixed(0)}ms`)
    console.log('')

    console.log('Query Status:')
    console.log(`  Success: ${metrics.queriesByStatus.success}`)
    console.log(`  Error: ${metrics.queriesByStatus.error}`)
    console.log(`  Loading: ${metrics.queriesByStatus.loading}`)
    console.log(`  Idle: ${metrics.queriesByStatus.idle}`)
    console.log('')

    if (metrics.slowQueries.length > 0) {
      console.log('⚠️  Slow Queries Detected:')
      metrics.slowQueries.forEach((query, index) => {
        console.log(`  ${index + 1}. ${JSON.stringify(query.queryKey)} - ${query.duration.toFixed(0)}ms`)
      })
      console.log('')
    }
  }

  // Display statistics
  const stats = cacheMonitor.getCacheStats()
  console.log('📊 Cache Statistics:')
  console.log(`  Total Requests: ${stats.totalRequests}`)
  console.log(`  Hit Rate: ${stats.hitRate.toFixed(1)}%`)
  console.log(`  Average Query Time: ${stats.averageQueryTime.toFixed(0)}ms`)
  console.log(`  Slow Queries Count: ${stats.slowQueriesCount}`)
  console.log('')

  // Display performance logs
  const logs = cacheMonitor.getPerformanceLogs(10)
  console.log('📝 Recent Performance Logs:')
  logs.slice(-5).forEach(log => {
    console.log(`  ${log.metric}: ${log.value.toFixed(2)} ${log.unit}`)
  })
  console.log('')

  // Export data
  console.log('💾 Exporting metrics data...')
  const exported = cacheMonitor.exportMetrics()
  console.log(`  Metrics collected: ${exported.metrics.length}`)
  console.log(`  Logs collected: ${exported.logs.length}`)
  console.log('')

  // Cleanup
  console.log('🧹 Cleaning up...')
  cacheMonitor.stopMonitoring()
  queryClient.clear()
  
  console.log('✅ Demonstration complete!')
}

// Run demonstration
demonstrateCacheMonitoring().catch(console.error)
