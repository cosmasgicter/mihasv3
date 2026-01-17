/**
 * Dashboard Stats Unit Tests
 * 
 * Tests that the dashboard stats API calls use the correct RPC function:
 * - `get_admin_dashboard_stats` (NOT `get_dashboard_stats`)
 * - Response structure matches expected format
 * - No 404 errors when fetching stats
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Create mock functions that we can track
const mockEq = vi.fn()
const mockOrder = vi.fn()
const mockLimit = vi.fn()
const mockSelect = vi.fn()
const mockFrom = vi.fn()
const mockRpc = vi.fn()
const mockSingle = vi.fn()

// Mock Supabase before importing the module under test
vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    from: mockFrom,
    rpc: mockRpc
  })),
  isSupabaseConfigured: true
}))

// Import after mocking
import { preloadDashboardData, prefetchDashboardQueries } from '@/services/dashboardPreloader'

describe('Dashboard Stats RPC Function Name', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Reset mock chain for queries
    mockLimit.mockResolvedValue({ data: [], error: null })
    mockOrder.mockReturnValue({ limit: mockLimit })
    mockEq.mockReturnValue({ eq: mockEq, order: mockOrder })
    mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder })
    mockFrom.mockReturnValue({ select: mockSelect })
    
    // Reset mock chain for RPC
    mockSingle.mockResolvedValue({ 
      data: {
        total_applications: 25,
        draft_applications: 3,
        submitted_applications: 6,
        under_review_applications: 1,
        approved_applications: 13,
        rejected_applications: 2
      }, 
      error: null 
    })
    mockRpc.mockReturnValue({ single: mockSingle })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('preloadDashboardData', () => {
    it('should call get_admin_dashboard_stats RPC function for admin users', async () => {
      const mockQueryClient = {
        setQueryData: vi.fn()
      } as any

      const mockProfile = {
        id: 'admin-user-id',
        role: 'admin'
      } as any

      await preloadDashboardData(mockQueryClient, 'admin-user-id', mockProfile)

      // Verify the correct RPC function is called
      expect(mockRpc).toHaveBeenCalledWith('get_admin_dashboard_stats')
      
      // Verify the old function name is NOT called
      expect(mockRpc).not.toHaveBeenCalledWith('get_dashboard_stats')
    })

    it('should call get_admin_dashboard_stats RPC function for super_admin users', async () => {
      const mockQueryClient = {
        setQueryData: vi.fn()
      } as any

      const mockProfile = {
        id: 'super-admin-user-id',
        role: 'super_admin'
      } as any

      await preloadDashboardData(mockQueryClient, 'super-admin-user-id', mockProfile)

      // Verify the correct RPC function is called
      expect(mockRpc).toHaveBeenCalledWith('get_admin_dashboard_stats')
      
      // Verify the old function name is NOT called
      expect(mockRpc).not.toHaveBeenCalledWith('get_dashboard_stats')
    })

    it('should NOT call dashboard stats RPC for student users', async () => {
      const mockQueryClient = {
        setQueryData: vi.fn()
      } as any

      const mockProfile = {
        id: 'student-user-id',
        role: 'student'
      } as any

      await preloadDashboardData(mockQueryClient, 'student-user-id', mockProfile)

      // Verify no dashboard stats RPC is called for students
      expect(mockRpc).not.toHaveBeenCalledWith('get_admin_dashboard_stats')
      expect(mockRpc).not.toHaveBeenCalledWith('get_dashboard_stats')
    })
  })

  describe('prefetchDashboardQueries', () => {
    it('should call get_admin_dashboard_stats RPC function for admin role', async () => {
      const mockQueryClient = {
        prefetchQuery: vi.fn().mockResolvedValue(undefined)
      } as any

      await prefetchDashboardQueries(mockQueryClient, 'admin-user-id', 'admin')

      // Verify prefetchQuery was called
      expect(mockQueryClient.prefetchQuery).toHaveBeenCalled()
      
      // Get the queryFn from the prefetchQuery call for dashboard-stats
      const prefetchCalls = mockQueryClient.prefetchQuery.mock.calls
      const dashboardStatsCall = prefetchCalls.find(
        (call: any) => call[0]?.queryKey?.[0] === 'dashboard-stats'
      )
      
      expect(dashboardStatsCall).toBeDefined()
      
      // Execute the queryFn to verify it calls the correct RPC
      if (dashboardStatsCall) {
        await dashboardStatsCall[0].queryFn()
        expect(mockRpc).toHaveBeenCalledWith('get_admin_dashboard_stats')
        expect(mockRpc).not.toHaveBeenCalledWith('get_dashboard_stats')
      }
    })

    it('should call get_admin_dashboard_stats RPC function for super_admin role', async () => {
      const mockQueryClient = {
        prefetchQuery: vi.fn().mockResolvedValue(undefined)
      } as any

      await prefetchDashboardQueries(mockQueryClient, 'super-admin-user-id', 'super_admin')

      // Verify prefetchQuery was called
      expect(mockQueryClient.prefetchQuery).toHaveBeenCalled()
      
      // Get the queryFn from the prefetchQuery call for dashboard-stats
      const prefetchCalls = mockQueryClient.prefetchQuery.mock.calls
      const dashboardStatsCall = prefetchCalls.find(
        (call: any) => call[0]?.queryKey?.[0] === 'dashboard-stats'
      )
      
      expect(dashboardStatsCall).toBeDefined()
      
      // Execute the queryFn to verify it calls the correct RPC
      if (dashboardStatsCall) {
        await dashboardStatsCall[0].queryFn()
        expect(mockRpc).toHaveBeenCalledWith('get_admin_dashboard_stats')
        expect(mockRpc).not.toHaveBeenCalledWith('get_dashboard_stats')
      }
    })
  })

  describe('Response Structure', () => {
    it('should handle successful stats response with correct structure', async () => {
      const expectedStats = {
        total_applications: 25,
        draft_applications: 3,
        submitted_applications: 6,
        under_review_applications: 1,
        approved_applications: 13,
        rejected_applications: 2
      }
      
      mockSingle.mockResolvedValue({ data: expectedStats, error: null })

      const mockQueryClient = {
        setQueryData: vi.fn()
      } as any

      const mockProfile = {
        id: 'admin-user-id',
        role: 'admin'
      } as any

      await preloadDashboardData(mockQueryClient, 'admin-user-id', mockProfile)

      // Verify stats were cached
      const setDataCalls = mockQueryClient.setQueryData.mock.calls
      const statsCall = setDataCalls.find(
        (call: any) => call[0]?.[0] === 'dashboard-stats'
      )
      
      expect(statsCall).toBeDefined()
      expect(statsCall[1]).toEqual(expectedStats)
    })

    it('should handle RPC error gracefully without throwing', async () => {
      mockSingle.mockResolvedValue({ 
        data: null, 
        error: { message: 'Function not found', code: '404' } 
      })

      const mockQueryClient = {
        setQueryData: vi.fn()
      } as any

      const mockProfile = {
        id: 'admin-user-id',
        role: 'admin'
      } as any

      // Should not throw even with errors
      await expect(
        preloadDashboardData(mockQueryClient, 'admin-user-id', mockProfile)
      ).resolves.not.toThrow()
    })

    it('should verify approval rate can be calculated from response', async () => {
      const stats = {
        total_applications: 25,
        draft_applications: 3,
        submitted_applications: 6,
        under_review_applications: 1,
        approved_applications: 13,
        rejected_applications: 2
      }
      
      mockSingle.mockResolvedValue({ data: stats, error: null })

      const mockQueryClient = {
        setQueryData: vi.fn()
      } as any

      const mockProfile = {
        id: 'admin-user-id',
        role: 'admin'
      } as any

      await preloadDashboardData(mockQueryClient, 'admin-user-id', mockProfile)

      // Verify stats were cached
      const setDataCalls = mockQueryClient.setQueryData.mock.calls
      const statsCall = setDataCalls.find(
        (call: any) => call[0]?.[0] === 'dashboard-stats'
      )
      
      expect(statsCall).toBeDefined()
      
      // Calculate approval rate from cached data
      const cachedStats = statsCall[1]
      const approvalRate = (cachedStats.approved_applications / cachedStats.total_applications) * 100
      
      // Should be 52% (13/25 * 100)
      expect(approvalRate).toBe(52)
    })
  })
})
