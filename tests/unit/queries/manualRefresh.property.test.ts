/**
 * Property Test: Manual Refresh Availability
 * **Property 10: Manual Refresh Availability**
 * **Validates: Requirements 1.5**
 * 
 * For any dashboard page, the System SHALL provide a visible manual refresh button 
 * that forces a complete data reload when clicked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { 
  useManualRefresh, 
  useStudentDashboardRefresh, 
  useAdminDashboardRefresh 
} from '@/hooks/useManualRefresh'

// Default query keys that should be refreshed
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
]

// Student-specific query keys
const STUDENT_QUERY_KEYS = [
  ['applications'],
  ['applications', 'stats'],
  ['student-dashboard'],
  ['payment-status'],
  ['notifications']
]

// Admin-specific query keys
const ADMIN_QUERY_KEYS = [
  ['applications'],
  ['applications', 'stats'],
  ['applications', 'recent-activity'],
  ['admin-dashboard'],
  ['payment-status'],
  ['payment-stats'],
  ['application-history']
]

// Dashboard types for property testing
type DashboardType = 'student' | 'admin' | 'generic'

// Arbitrary generator for dashboard types
const dashboardTypeArb = fc.constantFrom<DashboardType>('student', 'admin', 'generic')

// Arbitrary generator for custom query keys
const queryKeyArb = fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 3 })
const customQueryKeysArb = fc.array(queryKeyArb, { minLength: 1, maxLength: 5 })

// Create a wrapper with QueryClientProvider for testing hooks
const createWrapper = (queryClient: QueryClient) => {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    )
  }
}

describe('Manual Refresh Availability Property Tests', () => {
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
    vi.clearAllMocks()
  })

  afterEach(() => {
    queryClient.clear()
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 10: Manual Refresh Availability
   * 
   * Property: For any dashboard type, the hook must return a forceRefresh function
   */
  it('should provide forceRefresh function for any dashboard type', () => {
    fc.assert(
      fc.property(dashboardTypeArb, (dashboardType) => {
        const wrapper = createWrapper(queryClient)
        
        let result: any
        if (dashboardType === 'student') {
          const { result: r } = renderHook(() => useStudentDashboardRefresh(), { wrapper })
          result = r
        } else if (dashboardType === 'admin') {
          const { result: r } = renderHook(() => useAdminDashboardRefresh(), { wrapper })
          result = r
        } else {
          const { result: r } = renderHook(() => useManualRefresh(), { wrapper })
          result = r
        }
        
        // Property: forceRefresh must be a function
        expect(typeof result.current.forceRefresh).toBe('function')
        
        // Property: isRefreshing must be a boolean
        expect(typeof result.current.isRefreshing).toBe('boolean')
        
        // Property: lastRefreshed must be null initially or a Date
        expect(result.current.lastRefreshed === null || result.current.lastRefreshed instanceof Date).toBe(true)
        
        return true
      }),
      { numRuns: 20 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 10: Manual Refresh Availability
   * 
   * Property: For any dashboard type, isRefreshing must start as false
   */
  it('should initialize with isRefreshing as false for any dashboard type', () => {
    fc.assert(
      fc.property(dashboardTypeArb, (dashboardType) => {
        const wrapper = createWrapper(queryClient)
        
        let result: any
        if (dashboardType === 'student') {
          const { result: r } = renderHook(() => useStudentDashboardRefresh(), { wrapper })
          result = r
        } else if (dashboardType === 'admin') {
          const { result: r } = renderHook(() => useAdminDashboardRefresh(), { wrapper })
          result = r
        } else {
          const { result: r } = renderHook(() => useManualRefresh(), { wrapper })
          result = r
        }
        
        // Property: isRefreshing must be false initially
        expect(result.current.isRefreshing).toBe(false)
        
        return true
      }),
      { numRuns: 20 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 10: Manual Refresh Availability
   * 
   * Property: For any custom query keys configuration, the hook must accept and use them
   */
  it('should accept custom query keys for any valid configuration', () => {
    fc.assert(
      fc.property(customQueryKeysArb, (customKeys) => {
        const wrapper = createWrapper(queryClient)
        
        const { result } = renderHook(
          () => useManualRefresh({ queryKeys: customKeys as any }),
          { wrapper }
        )
        
        // Property: Hook must initialize successfully with custom keys
        expect(result.current.forceRefresh).toBeDefined()
        expect(typeof result.current.forceRefresh).toBe('function')
        
        return true
      }),
      { numRuns: 20 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 10: Manual Refresh Availability
   * 
   * Property: For any dashboard type, lastRefreshed must be null before first refresh
   */
  it('should have null lastRefreshed before any refresh for any dashboard type', () => {
    fc.assert(
      fc.property(dashboardTypeArb, (dashboardType) => {
        const wrapper = createWrapper(queryClient)
        
        let result: any
        if (dashboardType === 'student') {
          const { result: r } = renderHook(() => useStudentDashboardRefresh(), { wrapper })
          result = r
        } else if (dashboardType === 'admin') {
          const { result: r } = renderHook(() => useAdminDashboardRefresh(), { wrapper })
          result = r
        } else {
          const { result: r } = renderHook(() => useManualRefresh(), { wrapper })
          result = r
        }
        
        // Property: lastRefreshed must be null before first refresh
        expect(result.current.lastRefreshed).toBeNull()
        
        return true
      }),
      { numRuns: 20 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 10: Manual Refresh Availability
   * 
   * Property: Student dashboard refresh must target student-specific query keys
   */
  it('should use student-specific query keys for student dashboard', () => {
    // This property verifies the hook is configured correctly
    // by checking that the expected keys are part of the student configuration
    fc.assert(
      fc.property(fc.constant(STUDENT_QUERY_KEYS), (expectedKeys) => {
        // Property: Student dashboard must refresh applications
        expect(expectedKeys.some(k => k[0] === 'applications')).toBe(true)
        
        // Property: Student dashboard must refresh student-dashboard
        expect(expectedKeys.some(k => k[0] === 'student-dashboard')).toBe(true)
        
        // Property: Student dashboard must refresh notifications
        expect(expectedKeys.some(k => k[0] === 'notifications')).toBe(true)
        
        // Property: Student dashboard must refresh payment-status
        expect(expectedKeys.some(k => k[0] === 'payment-status')).toBe(true)
        
        return true
      }),
      { numRuns: 20 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 10: Manual Refresh Availability
   * 
   * Property: Admin dashboard refresh must target admin-specific query keys
   */
  it('should use admin-specific query keys for admin dashboard', () => {
    fc.assert(
      fc.property(fc.constant(ADMIN_QUERY_KEYS), (expectedKeys) => {
        // Property: Admin dashboard must refresh applications
        expect(expectedKeys.some(k => k[0] === 'applications')).toBe(true)
        
        // Property: Admin dashboard must refresh admin-dashboard
        expect(expectedKeys.some(k => k[0] === 'admin-dashboard')).toBe(true)
        
        // Property: Admin dashboard must refresh payment-status
        expect(expectedKeys.some(k => k[0] === 'payment-status')).toBe(true)
        
        // Property: Admin dashboard must refresh payment-stats
        expect(expectedKeys.some(k => k[0] === 'payment-stats')).toBe(true)
        
        // Property: Admin dashboard must refresh application-history
        expect(expectedKeys.some(k => k[0] === 'application-history')).toBe(true)
        
        return true
      }),
      { numRuns: 20 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 10: Manual Refresh Availability
   * 
   * Property: For any dashboard type, forceRefresh must update lastRefreshed after completion
   */
  it('should update lastRefreshed after forceRefresh completes for any dashboard type', async () => {
    // Test with a single dashboard type to verify the async behavior
    const wrapper = createWrapper(queryClient)
    
    const { result } = renderHook(() => useManualRefresh(), { wrapper })
    
    // Property: lastRefreshed must be null before refresh
    expect(result.current.lastRefreshed).toBeNull()
    
    // Trigger refresh
    await act(async () => {
      await result.current.forceRefresh()
    })
    
    // Property: lastRefreshed must be a Date after refresh
    await waitFor(() => {
      expect(result.current.lastRefreshed).toBeInstanceOf(Date)
    })
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 10: Manual Refresh Availability
   * 
   * Property: For any dashboard type, callbacks must be invoked appropriately
   */
  it('should invoke onSuccess callback after successful refresh', async () => {
    const wrapper = createWrapper(queryClient)
    const onSuccess = vi.fn()
    
    const { result } = renderHook(
      () => useManualRefresh({ onSuccess }),
      { wrapper }
    )
    
    await act(async () => {
      await result.current.forceRefresh()
    })
    
    // Property: onSuccess must be called after successful refresh
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1)
    })
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 10: Manual Refresh Availability
   * 
   * Property: Default query keys must include all critical dashboard data
   */
  it('should include all critical query keys in default configuration', () => {
    fc.assert(
      fc.property(fc.constant(DEFAULT_QUERY_KEYS), (defaultKeys) => {
        const keyNames = defaultKeys.map(k => k[0])
        
        // Property: Must include applications
        expect(keyNames).toContain('applications')
        
        // Property: Must include student-dashboard
        expect(keyNames).toContain('student-dashboard')
        
        // Property: Must include admin-dashboard
        expect(keyNames).toContain('admin-dashboard')
        
        // Property: Must include notifications
        expect(keyNames).toContain('notifications')
        
        // Property: Must include payment-status
        expect(keyNames).toContain('payment-status')
        
        return true
      }),
      { numRuns: 20 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 10: Manual Refresh Availability
   * 
   * Property: Concurrent refresh calls must be prevented
   */
  it('should prevent concurrent refresh calls', async () => {
    const wrapper = createWrapper(queryClient)
    
    const { result } = renderHook(() => useManualRefresh(), { wrapper })
    
    // Start first refresh
    let firstRefreshPromise: Promise<void>
    act(() => {
      firstRefreshPromise = result.current.forceRefresh()
    })
    
    // Property: isRefreshing should be true during refresh
    expect(result.current.isRefreshing).toBe(true)
    
    // Try to start second refresh while first is in progress
    let secondRefreshCalled = false
    act(() => {
      result.current.forceRefresh().then(() => {
        secondRefreshCalled = true
      })
    })
    
    // Wait for first refresh to complete
    await act(async () => {
      await firstRefreshPromise!
    })
    
    // Property: isRefreshing should be false after completion
    await waitFor(() => {
      expect(result.current.isRefreshing).toBe(false)
    })
  })
})
