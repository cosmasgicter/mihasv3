import { useQuery } from '@tanstack/react-query'

import { analyticsService } from '@/services/analyticsService'
import { adminDashboardService } from '@/services/admin/dashboard'
import { apiClient } from '@/services/client'

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

  // Get real-time system health via the health endpoint
  useSystemHealth: () => {
    return useQuery({
      queryKey: ['analytics', 'system-health'],
      queryFn: async () => {
        try {
          const dbResult = await apiClient.request<{ status?: string }>('/health?action=db')
          return {
            database: dbResult?.status === 'ok' ? 'healthy' : 'degraded',
            lastChecked: new Date().toISOString(),
          }
        } catch {
          return {
            database: 'error',
            lastChecked: new Date().toISOString(),
          }
        }
      },
      staleTime: 30000,
      refetchInterval: 60000,
    })
  },

  // Traffic overview — Umami analytics removed in migration.
  // Returns static empty shape so existing callers don't break.
  // TODO: Remove this hook and its callers in a future cleanup pass.
  useTrafficOverview: () => {
    return {
      activeUsers: 0,
      dailyCounts: [],
      isLoading: false,
      isError: false,
    }
  },
}
