/**
 * Notification Query Unit Tests
 * 
 * Tests that notification queries use the correct column names:
 * - `notifications` table uses `is_read` column
 * - Queries should not return 400 errors
 * 
 * Requirements: 2.1, 2.2, 2.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Create mock functions that we can track
const mockEq = vi.fn()
const mockOrder = vi.fn()
const mockLimit = vi.fn()
const mockSelect = vi.fn()
const mockFrom = vi.fn()
const mockRpc = vi.fn()

// Mock Supabase before importing the module under test
vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    from: mockFrom,
    rpc: mockRpc
  })),
  isSupabaseConfigured: true
}))

// Import after mocking
import { preloadDashboardData } from '@/services/dashboardPreloader'

describe('Notification Query Column Names', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Reset mock chain
    mockLimit.mockResolvedValue({ data: [], error: null })
    mockOrder.mockReturnValue({ limit: mockLimit })
    mockEq.mockReturnValue({ eq: mockEq, order: mockOrder })
    mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder })
    mockFrom.mockReturnValue({ select: mockSelect })
    mockRpc.mockReturnValue({ single: vi.fn().mockResolvedValue({ data: {}, error: null }) })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('dashboardPreloader notification queries', () => {
    it('should use is_read column for student notifications query', async () => {
      const mockQueryClient = {
        setQueryData: vi.fn()
      } as any

      const mockProfile = {
        id: 'test-user-id',
        role: 'student'
      } as any

      await preloadDashboardData(mockQueryClient, 'test-user-id', mockProfile)

      // Verify that is_read column is used (not 'read')
      // The eq function should be called with 'is_read' for notifications
      const eqCalls = mockEq.mock.calls
      
      // Find calls with 'is_read' column
      const isReadCalls = eqCalls.filter(call => call[0] === 'is_read')
      const readCalls = eqCalls.filter(call => call[0] === 'read')

      expect(isReadCalls.length).toBeGreaterThan(0)
      expect(isReadCalls[0][1]).toBe(false)
      expect(readCalls.length).toBe(0)
    })

    it('should use is_read column for admin notifications query', async () => {
      const mockQueryClient = {
        setQueryData: vi.fn()
      } as any

      const mockProfile = {
        id: 'admin-user-id',
        role: 'admin'
      } as any

      await preloadDashboardData(mockQueryClient, 'admin-user-id', mockProfile)

      // Verify that is_read column is used (not 'read')
      const eqCalls = mockEq.mock.calls
      
      // Find calls with 'is_read' column
      const isReadCalls = eqCalls.filter(call => call[0] === 'is_read')
      const readCalls = eqCalls.filter(call => call[0] === 'read')

      expect(isReadCalls.length).toBeGreaterThan(0)
      expect(isReadCalls[0][1]).toBe(false)
      expect(readCalls.length).toBe(0)
    })

    it('should query notifications table for unread notifications', async () => {
      const mockQueryClient = {
        setQueryData: vi.fn()
      } as any

      const mockProfile = {
        id: 'test-user-id',
        role: 'student'
      } as any

      await preloadDashboardData(mockQueryClient, 'test-user-id', mockProfile)

      // Verify notifications table is queried
      const fromCalls = mockFrom.mock.calls
      const notificationsCalls = fromCalls.filter(call => call[0] === 'notifications')
      
      expect(notificationsCalls.length).toBeGreaterThan(0)
    })

    it('should not return 400 errors when fetching notifications with correct column', async () => {
      // Mock successful response (no error)
      mockLimit.mockResolvedValue({
        data: [{ id: 'notif-1', title: 'Test', is_read: false }],
        error: null
      })

      const mockQueryClient = {
        setQueryData: vi.fn()
      } as any

      const mockProfile = {
        id: 'test-user-id',
        role: 'student'
      } as any

      // Should not throw
      await expect(
        preloadDashboardData(mockQueryClient, 'test-user-id', mockProfile)
      ).resolves.not.toThrow()

      // Verify data was cached successfully
      expect(mockQueryClient.setQueryData).toHaveBeenCalled()
    })

    it('should handle notification fetch errors gracefully', async () => {
      // Mock error response (simulating what would happen with wrong column name)
      mockLimit.mockResolvedValue({
        data: null,
        error: { message: 'column "read" does not exist', code: '42703' }
      })

      const mockQueryClient = {
        setQueryData: vi.fn()
      } as any

      const mockProfile = {
        id: 'test-user-id',
        role: 'student'
      } as any

      // Should not throw even with errors
      await expect(
        preloadDashboardData(mockQueryClient, 'test-user-id', mockProfile)
      ).resolves.not.toThrow()
    })
  })
})
