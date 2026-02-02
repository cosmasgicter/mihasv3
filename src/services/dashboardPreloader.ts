// @ts-nocheck
/**
 * Dashboard Data Preloader
 * 
 * Preloads critical dashboard data during login redirect to improve perceived performance.
 * Requirements: 4.4
 * 
 * @deprecated This module uses the deprecated Supabase stub.
 * TODO: Migrate to API endpoints when dashboard preloader is reactivated.
 */

import { QueryClient } from '@tanstack/react-query'
import { getSupabaseClient, isSupabaseConfigured, UserProfile } from '@/lib/supabase'
import { CACHE_CONFIG } from '@/hooks/queries/useSupabaseQuery'

/**
 * Identify critical dashboard data based on user role
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
 */
async function preloadStudentDashboard(userId: string) {
  if (!isSupabaseConfigured) {
    return {}
  }

  const supabase = getSupabaseClient()

  try {
    // Fetch critical data in parallel
    const [applicationsResult, notificationsResult, intakesResult] = await Promise.allSettled([
      // Student applications
      supabase
        .from('applications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10),
      
      // Recent notifications
      supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(5),
      
      // Active intakes
      supabase
        .from('intakes')
        .select('*')
        .eq('is_active', true)
        .order('start_date', { ascending: false })
        .limit(5)
    ])

    return {
      applications: applicationsResult.status === 'fulfilled' ? applicationsResult.value.data : [],
      notifications: notificationsResult.status === 'fulfilled' ? notificationsResult.value.data : [],
      intakes: intakesResult.status === 'fulfilled' ? intakesResult.value.data : []
    }
  } catch (error) {
    console.error('Error preloading student dashboard:', error)
    return {}
  }
}

/**
 * Preload admin dashboard data
 */
async function preloadAdminDashboard() {
  if (!isSupabaseConfigured) {
    return {}
  }

  const supabase = getSupabaseClient()

  try {
    // Fetch critical data in parallel
    const [applicationsResult, statsResult, notificationsResult] = await Promise.allSettled([
      // Recent applications
      supabase
        .from('applications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20),
      
      // Dashboard stats
      supabase
        .rpc('get_admin_dashboard_stats')
        .single(),
      
      // System notifications
      supabase
        .from('notifications')
        .select('*')
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(10)
    ])

    return {
      applications: applicationsResult.status === 'fulfilled' ? applicationsResult.value.data : [],
      stats: statsResult.status === 'fulfilled' ? statsResult.value.data : null,
      notifications: notificationsResult.status === 'fulfilled' ? notificationsResult.value.data : []
    }
  } catch (error) {
    console.error('Error preloading admin dashboard:', error)
    return {}
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
 * Alternative approach using React Query's prefetch API
 */
export async function prefetchDashboardQueries(
  queryClient: QueryClient,
  userId: string,
  role: string
): Promise<void> {
  if (!isSupabaseConfigured) {
    return
  }

  const supabase = getSupabaseClient()

  try {
    if (role === 'admin' || role === 'super_admin') {
      // Prefetch admin queries
      await Promise.allSettled([
        queryClient.prefetchQuery({
          queryKey: ['applications'],
          queryFn: async () => {
            const { data } = await supabase
              .from('applications')
              .select('*')
              .order('created_at', { ascending: false })
              .limit(20)
            return data
          },
          staleTime: CACHE_CONFIG.applications.staleTime
        }),
        queryClient.prefetchQuery({
          queryKey: ['dashboard-stats'],
          queryFn: async () => {
            const { data } = await supabase.rpc('get_admin_dashboard_stats').single()
            return data
          },
          staleTime: CACHE_CONFIG.analytics.staleTime
        })
      ])
    } else {
      // Prefetch student queries
      await Promise.allSettled([
        queryClient.prefetchQuery({
          queryKey: ['applications', userId],
          queryFn: async () => {
            const { data } = await supabase
              .from('applications')
              .select('*')
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
              .limit(10)
            return data
          },
          staleTime: CACHE_CONFIG.applications.staleTime
        }),
        queryClient.prefetchQuery({
          queryKey: ['intakes'],
          queryFn: async () => {
            const { data } = await supabase
              .from('intakes')
              .select('*')
              .eq('is_active', true)
              .order('start_date', { ascending: false })
              .limit(5)
            return data
          },
          staleTime: CACHE_CONFIG.static.staleTime
        })
      ])
    }
  } catch (error) {
    console.error('Error prefetching dashboard queries:', error)
    // Don't throw - prefetching is optional
  }
}
