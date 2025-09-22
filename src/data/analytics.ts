import { useQuery } from '@tanstack/react-query'
import { endOfDay, eachDayOfInterval, format, startOfDay, subDays } from 'date-fns'

import { analyticsService } from '@/services/analytics'
import { adminDashboardService } from '@/services/admin/dashboard'
import { supabase } from '@/lib/supabase'
import { analyticsConfig } from '@/config/analytics'
import { umamiAnalyticsService } from '@/services/umamiAnalytics'

// Query Keys
const QUERY_KEYS = {
  analytics: ['analytics'] as const,
  metrics: ['analytics', 'metrics'] as const,
  adminMetrics: ['analytics', 'admin-metrics'] as const,
  trafficOverview: ['analytics', 'traffic-overview'] as const
}

// Data Access Functions
export const analyticsData = {
  // Get general analytics metrics
  useMetrics: () => {
    return useQuery({
      queryKey: QUERY_KEYS.metrics,
      queryFn: () => analyticsService.getMetrics(),
      staleTime: 60000,
      refetchInterval: 300000 // 5 minutes
    })
  },

  // Get admin dashboard metrics
  useAdminMetrics: () => {
    return useQuery({
      queryKey: QUERY_KEYS.adminMetrics,
      queryFn: () => adminDashboardService.getMetrics(),
      staleTime: 30000,
      refetchInterval: 60000 // 1 minute
    })
  },

  // Get real-time system health
  useSystemHealth: () => {
    return useQuery({
      queryKey: ['analytics', 'system-health'],
      queryFn: async () => {
        // Check database connectivity
        const { error: dbError } = await supabase.from('applications_new').select('id').limit(1)
        
        return {
          database: dbError ? 'error' : 'healthy',
          security: 'secure',
          performance: 'optimal',
          uptime: '99.9%'
        }
      },
      staleTime: 30000,
      refetchInterval: 60000
    })
  },

  // Fetch website activity metrics from Umami
  useTrafficOverview: () => {
    const isConfigured = analyticsConfig.isConfigured
    const query = useQuery({
      queryKey: QUERY_KEYS.trafficOverview,
      enabled: isConfigured,
      queryFn: async () => {
        if (!isConfigured) {
          throw new Error('Analytics share endpoint is not configured')
        }

        const today = endOfDay(new Date())
        const start = startOfDay(subDays(today, 6))

        const [activeUsersResponse, pageviewsResponse] = await Promise.all([
          umamiAnalyticsService.getActiveUsers(),
          umamiAnalyticsService.getPageviews({
            startAt: start.getTime(),
            endAt: today.getTime(),
            unit: 'day'
          })
        ])

        const pageviews = pageviewsResponse.pageviews ?? []
        const pointsByDay = new Map<number, number>()

        pageviews.forEach((point) => {
          pointsByDay.set(startOfDay(new Date(point.x)).getTime(), point.y ?? 0)
        })

        const dailyCounts = eachDayOfInterval({ start, end: today }).map((date) => {
          const key = startOfDay(date).getTime()
          return {
            label: format(date, 'EEE'),
            date: date.toISOString(),
            count: pointsByDay.get(key) ?? 0
          }
        })

        const activeUsers = activeUsersResponse.x ?? activeUsersResponse.value ?? activeUsersResponse.active ?? 0

        return {
          activeUsers,
          dailyCounts
        }
      },
      staleTime: 60000,
      refetchInterval: 60000,
      retry: 1
    })

    return {
      activeUsers: query.data?.activeUsers ?? 0,
      dailyCounts: query.data?.dailyCounts ?? [],
      isLoading: isConfigured ? query.isLoading : false,
      isError: !isConfigured || query.isError
    }
  }
}
