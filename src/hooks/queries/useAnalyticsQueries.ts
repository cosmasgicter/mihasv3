import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { CACHE_CONFIG } from './useSupabaseQuery'

export const usePredictionResults = () => {
  return useQuery({
    queryKey: ['prediction_results'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('prediction_results')
        .select('*', { count: 'exact', head: true })
      if (error) throw error
      return data
    },
    ...CACHE_CONFIG.analytics
  })
}

export const useWorkflowLogs = () => {
  return useQuery({
    queryKey: ['workflow_execution_logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workflow_execution_logs')
        .select('*', { count: 'exact', head: true })
      if (error) throw error
      return data
    },
    ...CACHE_CONFIG.analytics
  })
}

export const useNotificationLogs = () => {
  return useQuery({
    queryKey: ['notification_logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_logs')
        .select('*', { count: 'exact', head: true })
      if (error) throw error
      return data
    },
    ...CACHE_CONFIG.analytics
  })
}

export const usePredictionAccuracy = () => {
  return useQuery({
    queryKey: ['prediction_accuracy'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('prediction_results')
        .select('accuracy')
      if (error) throw error
      return data
    },
    ...CACHE_CONFIG.analytics
  })
}
