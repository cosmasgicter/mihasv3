import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/services/client'
import { CACHE_CONFIG } from './useQueryConfig'

// Prediction analytics — feature REMOVED in simplification.
// Returns empty so existing callers don't break.
export const usePredictionResults = () => {
  return useQuery({
    queryKey: ['prediction_results'],
    queryFn: async () => [] as unknown[],
    ...CACHE_CONFIG.analytics,
  })
}

// Workflow engine — feature REMOVED in simplification.
export const useWorkflowLogs = () => {
  return useQuery({
    queryKey: ['workflow_execution_logs'],
    queryFn: async () => [] as unknown[],
    ...CACHE_CONFIG.analytics,
  })
}

export const useNotificationLogs = () => {
  return useQuery({
    queryKey: ['notification_logs'],
    queryFn: async () => {
      try {
        const result = await apiClient.request<{ data: unknown[] }>('/admin?action=stats')
        return result?.data ?? []
      } catch {
        return []
      }
    },
    ...CACHE_CONFIG.analytics
  })
}

// Prediction accuracy — feature REMOVED in simplification.
export const usePredictionAccuracy = () => {
  return useQuery({
    queryKey: ['prediction_accuracy'],
    queryFn: async () => [] as unknown[],
    ...CACHE_CONFIG.analytics,
  })
}
