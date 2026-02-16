import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/services/client'
import { CACHE_CONFIG } from './useSupabaseQuery'

export const usePredictionResults = () => {
  return useQuery({
    queryKey: ['prediction_results'],
    queryFn: async () => {
      // Prediction analytics removed in simplification — return empty
      return []
    },
    ...CACHE_CONFIG.analytics
  })
}

export const useWorkflowLogs = () => {
  return useQuery({
    queryKey: ['workflow_execution_logs'],
    queryFn: async () => {
      // Workflow engine removed in simplification — return empty
      return []
    },
    ...CACHE_CONFIG.analytics
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

export const usePredictionAccuracy = () => {
  return useQuery({
    queryKey: ['prediction_accuracy'],
    queryFn: async () => {
      // Prediction analytics removed in simplification — return empty
      return []
    },
    ...CACHE_CONFIG.analytics
  })
}
