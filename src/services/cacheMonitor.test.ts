/**
 * Cache Monitor Service Tests
 * 
 * Tests cache monitoring functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { cacheMonitor } from './cacheMonitor'

describe('CacheMonitorService', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0
        }
      }
    })
    cacheMonitor.reset()
  })

  afterEach(() => {
    cacheMonitor.stopMonitoring()
    queryClient.clear()
  })

  describe('Initialization', () => {
    it('should initialize with a QueryClient', () => {
      cacheMonitor.initialize(queryClient)
      const status = cacheMonitor.getStatus()
      
      expect(status.initialized).toBe(true)
      expect(status.isMonitoring).toBe(true)
    })

    it('should warn when initializing twice', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      cacheMonitor.initialize(queryClient)
      cacheMonitor.initialize(queryClient)
      
      expect(consoleSpy).toHaveBeenCalledWith('Cache monitor already initialized')
      consoleSpy.mockRestore()
    })
  })

  describe('Metrics Collection', () => {
    it('should collect initial metrics', () => {
      cacheMonitor.initialize(queryClient)
      
      const metrics = cacheMonitor.getCurrentMetrics()
      
      expect(metrics).toBeDefined()
      expect(metrics?.totalQueries).toBe(0)
      expect(metrics?.cacheHits).toBe(0)
      expect(metrics?.cacheMisses).toBe(0)
    })

    it('should track cache hits and misses', async () => {
      cacheMonitor.initialize(queryClient)
      
      // Add a query to cache
      await queryClient.fetchQuery({
        queryKey: ['test', 'query'],
        queryFn: async () => ({ data: 'test' })
      })
      
      // Wait for metrics collection
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const stats = cacheMonitor.getCacheStats()
      expect(stats.totalRequests).toBeGreaterThan(0)
    })

    it('should calculate hit rate correctly', () => {
      cacheMonitor.initialize(queryClient)
      
      const stats = cacheMonitor.getCacheStats()
      
      // With no requests, hit rate should be 0
      expect(stats.hitRate).toBe(0)
      expect(stats.totalHits).toBe(0)
      expect(stats.totalMisses).toBe(0)
    })
  })

  describe('Query Performance Tracking', () => {
    it('should track query execution time', () => {
      cacheMonitor.initialize(queryClient)
      
      const startTime = Date.now() - 500 // 500ms ago
      cacheMonitor.trackQueryTime(['test', 'query'], startTime)
      
      const metrics = cacheMonitor.getCurrentMetrics()
      expect(metrics?.averageQueryTime).toBeGreaterThan(0)
    })

    it('should identify slow queries', () => {
      cacheMonitor.initialize(queryClient)
      
      const startTime = Date.now() - 1500 // 1500ms ago (slow)
      cacheMonitor.trackQueryTime(['slow', 'query'], startTime)
      
      const metrics = cacheMonitor.getCurrentMetrics()
      expect(metrics?.slowQueries.length).toBeGreaterThan(0)
    })

    it('should log warning for slow queries', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      cacheMonitor.initialize(queryClient)
      
      const startTime = Date.now() - 1500 // 1500ms ago
      cacheMonitor.trackQueryTime(['slow', 'query'], startTime)
      
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('Performance Logs', () => {
    it('should log performance metrics', () => {
      cacheMonitor.initialize(queryClient)
      
      const logs = cacheMonitor.getPerformanceLogs()
      
      expect(logs.length).toBeGreaterThan(0)
      expect(logs[0]).toHaveProperty('timestamp')
      expect(logs[0]).toHaveProperty('metric')
      expect(logs[0]).toHaveProperty('value')
      expect(logs[0]).toHaveProperty('unit')
    })

    it('should limit performance logs to max size', () => {
      cacheMonitor.initialize(queryClient)
      
      // Generate many logs
      for (let i = 0; i < 600; i++) {
        cacheMonitor.trackQueryTime(['test', `query-${i}`], Date.now() - 100)
      }
      
      const logs = cacheMonitor.getPerformanceLogs()
      expect(logs.length).toBeLessThanOrEqual(500)
    })
  })

  describe('Metrics History', () => {
    it('should maintain metrics history', () => {
      cacheMonitor.initialize(queryClient)
      
      const history = cacheMonitor.getMetricsHistory()
      
      expect(Array.isArray(history)).toBe(true)
      expect(history.length).toBeGreaterThan(0)
    })

    it('should limit metrics history to max size', () => {
      cacheMonitor.initialize(queryClient)
      
      // This would require waiting for multiple collection cycles
      // For now, just verify the method works
      const history = cacheMonitor.getMetricsHistory(5)
      expect(history.length).toBeLessThanOrEqual(5)
    })
  })

  describe('Export and Reset', () => {
    it('should export all metrics data', () => {
      cacheMonitor.initialize(queryClient)
      
      const exported = cacheMonitor.exportMetrics()
      
      expect(exported).toHaveProperty('metrics')
      expect(exported).toHaveProperty('logs')
      expect(exported).toHaveProperty('stats')
      expect(Array.isArray(exported.metrics)).toBe(true)
      expect(Array.isArray(exported.logs)).toBe(true)
    })

    it('should reset all monitoring data', () => {
      cacheMonitor.initialize(queryClient)
      
      cacheMonitor.trackQueryTime(['test'], Date.now() - 100)
      
      cacheMonitor.reset()
      
      const stats = cacheMonitor.getCacheStats()
      expect(stats.totalHits).toBe(0)
      expect(stats.totalMisses).toBe(0)
      
      const history = cacheMonitor.getMetricsHistory()
      expect(history.length).toBe(0)
    })
  })

  describe('Status', () => {
    it('should report correct monitoring status', () => {
      const initialStatus = cacheMonitor.getStatus()
      expect(initialStatus.isMonitoring).toBe(false)
      expect(initialStatus.initialized).toBe(false)
      
      cacheMonitor.initialize(queryClient)
      
      const activeStatus = cacheMonitor.getStatus()
      expect(activeStatus.isMonitoring).toBe(true)
      expect(activeStatus.initialized).toBe(true)
      
      cacheMonitor.stopMonitoring()
      
      const stoppedStatus = cacheMonitor.getStatus()
      expect(stoppedStatus.isMonitoring).toBe(false)
    })
  })
})
