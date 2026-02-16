// @ts-nocheck
/**
 * Dashboard Data Preloader
 * 
 * Preloads critical dashboard data during login redirect to improve perceived performance.
 * Requirements: 4.4
 * 
 * NOTE: Supabase calls have been removed. The preload functions now return empty data
 * as no-ops. Full API-based preloading will be implemented in a later migration task.
 */

import { QueryClient } from '@tanstack/react-query'
import type { UserProfile } from '@/types/database'
import { CACHE_CONFIG } from '@/hooks/queries/useSupabaseQuery'

/**
 * Identify critical dashboard queries based on user role
 */
export function getCriticalDashboardQueries(role: string): string[] {
  if (role === 'admin' || role === 'super_admin') {
    return [
      'admin-applications',
      'admin-stats',
      'admin-notifications'
    ]
  }
  
  // Student role
  return [
    'student-applications',
    'student-notifications',
    'active-intakes'
  ]
}

/**
 * Preload student dashboard data
 * 
 * TODO: Replace with API-based preloading (applicationService, notificationService, catalogService)
 */
async function preloadStudentDashboard(_userId: string) {
  // No-op: Supabase calls removed. Full API migration in a later task.
  return {
    applications: [],
    notifications: [],
    intakes: []
  }
}

/**
 * Preload admin dashboard data
 * 
 * TODO: Replace with API-based preloading (applicationService, apiClient)
 */
async function preloadAdminDashboard() {
  // No-op: Supabase calls removed. Full API migration in a later task.
  return {
    applications: [],
    stats: null,
    notifications: []
  }
}

/**
 * Preload dashboard data based on user role
 * 
 * This function:
 * 1. Identifies critical dashboard data based on role
 * 2. Fetches data in parallel
 * 3. Caches data in React Query with appropriate staleTime
 * 
 * Requirements: 4.4
 */
export async function preloadDashboardData(
  queryClient: QueryClient,
  userId: string,
  profile: UserProfile | null
): Promise<void> {
  if (!profile) {
    return
  }

  const role = profile.role || 'student'

  try {
    if (role === 'admin' || role === 'super_admin') {
      // Preload admin dashboard
      const data = await preloadAdminDashboard()

      // Cache applications
      if (data.applications) {
        queryClient.setQueryData(
          ['applications'],
          data.applications,
          {
            updatedAt: Date.now()
          }
        )
      }

      // Cache stats
      if (data.stats) {
        queryClient.setQueryData(
          ['dashboard-stats'],
          data.stats,
          {
            updatedAt: Date.now()
          }
        )
      }

      // Cache notifications
      if (data.notifications) {
        queryClient.setQueryData(
          ['notifications', userId],
          data.notifications,
          {
            updatedAt: Date.now()
          }
        )
      }
    } else {
      // Preload student dashboard
      const data = await preloadStudentDashboard(userId)

      // Cache applications
      if (data.applications) {
        queryClient.setQueryData(
          ['applications', userId],
          data.applications,
          {
            updatedAt: Date.now()
          }
        )
      }

      // Cache notifications
      if (data.notifications) {
        queryClient.setQueryData(
          ['notifications', userId],
          data.notifications,
          {
            updatedAt: Date.now()
          }
        )
      }

      // Cache intakes
      if (data.intakes) {
        queryClient.setQueryData(
          ['intakes'],
          data.intakes,
          {
            updatedAt: Date.now()
          }
        )
      }
    }
  } catch (error) {
    console.error('Error preloading dashboard data:', error)
    // Don't throw - preloading is optional
  }
}

/**
 * Prefetch dashboard queries using React Query
 * 
 * TODO: Replace with API-based prefetching (applicationService, catalogService)
 */
export async function prefetchDashboardQueries(
  _queryClient: QueryClient,
  _userId: string,
  _role: string
): Promise<void> {
  // No-op: Supabase calls removed. Full API migration in a later task.
  return
}
