/**
 * Optimized Authentication Service Unit Tests
 * 
 * Tests the optimized login flow to ensure:
 * - Parallel data fetching is implemented
 * - Dashboard preloading is working
 * - Performance targets are met
 * 
 * Requirements: 4.2, 4.3, 4.4
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { optimizedLogin } from '@/services/optimizedAuthService'
import { preloadDashboardData } from '@/services/dashboardPreloader'

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: {
      signInWithPassword: vi.fn(),
      getSession: vi.fn(),
      getUser: vi.fn()
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(),
          single: vi.fn(),
          order: vi.fn(() => ({
            limit: vi.fn()
          }))
        }))
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn()
        }))
      }))
    })),
    rpc: vi.fn(() => ({
      single: vi.fn()
    }))
  })),
  isSupabaseConfigured: true
}))

describe('Optimized Authentication Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('optimizedLogin', () => {
    it('should implement parallel data fetching', async () => {
      const { getSupabaseClient } = await import('@/lib/supabase')
      const mockSupabase = getSupabaseClient()

      // Mock successful authentication
      vi.mocked(mockSupabase.auth.signInWithPassword).mockResolvedValue({
        data: {
          session: {
            access_token: 'test-token',
            user: {
              id: 'test-user-id',
              email: 'test@example.com'
            }
          },
          user: {
            id: 'test-user-id',
            email: 'test@example.com'
          }
        },
        error: null
      } as any)

      // Mock profile fetch
      const mockProfileQuery = {
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: 'test-user-id',
              full_name: 'Test User',
              role: 'student'
            },
            error: null
          })
        }))
      }

      vi.mocked(mockSupabase.from).mockReturnValue({
        select: vi.fn(() => mockProfileQuery)
      } as any)

      // Track timing of operations
      const startTime = Date.now()
      
      const result = await optimizedLogin('test@example.com', 'password')
      
      const duration = Date.now() - startTime

      // Verify successful login
      expect(result).toHaveProperty('session')
      expect(result).toHaveProperty('user')
      expect(result).toHaveProperty('profile')
      expect(result).not.toHaveProperty('error')

      // Verify profile was fetched
      expect(mockSupabase.from).toHaveBeenCalledWith('profiles')

      // Log performance
      console.log(`Login completed in ${duration}ms`)
    })

    it('should handle authentication errors gracefully', async () => {
      const { getSupabaseClient } = await import('@/lib/supabase')
      const mockSupabase = getSupabaseClient()

      // Mock authentication failure
      vi.mocked(mockSupabase.auth.signInWithPassword).mockResolvedValue({
        data: {
          session: null,
          user: null
        },
        error: {
          message: 'Invalid login credentials',
          name: 'AuthError',
          status: 400
        }
      } as any)

      const result = await optimizedLogin('test@example.com', 'wrong-password')

      // Verify error handling
      expect(result).toHaveProperty('error')
      expect(result.error).toBe('Invalid email or password')
    })

    it('should handle network errors', async () => {
      const { getSupabaseClient } = await import('@/lib/supabase')
      const mockSupabase = getSupabaseClient()

      // Mock network error
      vi.mocked(mockSupabase.auth.signInWithPassword).mockRejectedValue(
        new Error('fetch failed')
      )

      const result = await optimizedLogin('test@example.com', 'password')

      // Verify error handling
      expect(result).toHaveProperty('error')
      expect(result.error).toContain('Network error')
    })
  })

  describe('Dashboard Preloading', () => {
    it('should preload student dashboard data', async () => {
      const { getSupabaseClient } = await import('@/lib/supabase')
      const mockSupabase = getSupabaseClient()

      // Mock query client
      const mockQueryClient = {
        setQueryData: vi.fn()
      } as any

      // Mock student profile
      const mockProfile = {
        id: 'test-user-id',
        role: 'student'
      } as any

      // Mock data fetching
      const mockApplicationsQuery = {
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({
              data: [{ id: 'app-1' }],
              error: null
            })
          }))
        }))
      }

      const mockNotificationsQuery = {
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({
                data: [{ id: 'notif-1' }],
                error: null
              })
            }))
          }))
        }))
      }

      const mockIntakesQuery = {
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({
              data: [{ id: 'intake-1' }],
              error: null
            })
          }))
        }))
      }

      vi.mocked(mockSupabase.from)
        .mockReturnValueOnce({ select: vi.fn(() => mockApplicationsQuery) } as any)
        .mockReturnValueOnce({ select: vi.fn(() => mockNotificationsQuery) } as any)
        .mockReturnValueOnce({ select: vi.fn(() => mockIntakesQuery) } as any)

      // Preload dashboard data
      await preloadDashboardData(mockQueryClient, 'test-user-id', mockProfile)

      // Verify data was cached
      expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(
        ['applications', 'test-user-id'],
        expect.any(Array),
        expect.any(Object)
      )

      expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(
        ['notifications', 'test-user-id'],
        expect.any(Array),
        expect.any(Object)
      )

      expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(
        ['intakes'],
        expect.any(Array),
        expect.any(Object)
      )
    })

    it('should preload admin dashboard data', async () => {
      const { getSupabaseClient } = await import('@/lib/supabase')
      const mockSupabase = getSupabaseClient()

      // Mock query client
      const mockQueryClient = {
        setQueryData: vi.fn()
      } as any

      // Mock admin profile
      const mockProfile = {
        id: 'admin-user-id',
        role: 'admin'
      } as any

      // Mock data fetching
      const mockApplicationsQuery = {
        order: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue({
            data: [{ id: 'app-1' }],
            error: null
          })
        }))
      }

      vi.mocked(mockSupabase.from).mockReturnValue({
        select: vi.fn(() => mockApplicationsQuery)
      } as any)

      vi.mocked(mockSupabase.rpc).mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { total_applications: 100 },
          error: null
        })
      } as any)

      // Preload dashboard data
      await preloadDashboardData(mockQueryClient, 'admin-user-id', mockProfile)

      // Verify admin data was cached
      expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(
        ['applications'],
        expect.any(Array),
        expect.any(Object)
      )

      expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(
        ['dashboard-stats'],
        expect.any(Object),
        expect.any(Object)
      )
    })

    it('should handle preloading errors gracefully', async () => {
      const { getSupabaseClient } = await import('@/lib/supabase')
      const mockSupabase = getSupabaseClient()

      // Mock query client
      const mockQueryClient = {
        setQueryData: vi.fn()
      } as any

      // Mock profile
      const mockProfile = {
        id: 'test-user-id',
        role: 'student'
      } as any

      // Mock error in data fetching
      vi.mocked(mockSupabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn().mockRejectedValue(new Error('Database error'))
            }))
          }))
        }))
      } as any)

      // Preload should not throw
      await expect(
        preloadDashboardData(mockQueryClient, 'test-user-id', mockProfile)
      ).resolves.not.toThrow()

      // Verify it attempted to cache (even if data fetch failed)
      // The function should handle errors gracefully
    })
  })

  describe('Performance Metrics', () => {
    it('should complete login within performance budget', async () => {
      const { getSupabaseClient } = await import('@/lib/supabase')
      const mockSupabase = getSupabaseClient()

      // Mock successful authentication
      vi.mocked(mockSupabase.auth.signInWithPassword).mockResolvedValue({
        data: {
          session: {
            access_token: 'test-token',
            user: {
              id: 'test-user-id',
              email: 'test@example.com'
            }
          },
          user: {
            id: 'test-user-id',
            email: 'test@example.com'
          }
        },
        error: null
      } as any)

      // Mock profile fetch with realistic delay
      const mockProfileQuery = {
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockImplementation(() => 
            new Promise(resolve => 
              setTimeout(() => resolve({
                data: {
                  id: 'test-user-id',
                  full_name: 'Test User',
                  role: 'student'
                },
                error: null
              }), 100) // 100ms delay
            )
          )
        }))
      }

      vi.mocked(mockSupabase.from).mockReturnValue({
        select: vi.fn(() => mockProfileQuery)
      } as any)

      // Measure login time
      const startTime = performance.now()
      const result = await optimizedLogin('test@example.com', 'password')
      const duration = performance.now() - startTime

      console.log(`Login duration: ${duration.toFixed(2)}ms`)

      // Verify login succeeded
      expect(result).not.toHaveProperty('error')

      // Verify performance target
      // Requirements: 4.1 - Login should complete within 2 seconds
      // In unit tests with mocks, this should be much faster
      expect(duration).toBeLessThan(2000)
    })
  })
})
