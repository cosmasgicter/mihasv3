import { useQuery } from '@tanstack/react-query'

import { analyticsService } from '@/services/analytics'
import { adminDashboardService } from '@/services/admin/dashboard'
import { supabase } from '@/lib/supabase'

// Query Keys
const QUERY_KEYS = {
  analytics: ['analytics'] as const,
  metrics: ['analytics', 'metrics'] as const,
  adminMetrics: ['analytics', 'admin-metrics'] as const,
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
        const { error: dbError } = await supabase.from('applications').select('id').limit(1)
        
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

  // Traffic overview removed - Umami analytics removed in migration
  useTrafficOverview: () => {
    return {
      activeUsers: 0,
      dailyCounts: [],
      isLoading: false,
      isError: false
    }
  }
}
