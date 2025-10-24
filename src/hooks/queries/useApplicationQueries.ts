import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { CACHE_CONFIG } from './useSupabaseQuery'

export const useApplicationDrafts = (userId?: string) => {
  return useQuery({
    queryKey: ['application_drafts', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('application_drafts')
        .select('*')
        .eq('user_id', userId)
      if (error) throw error
      return data
    },
    enabled: !!userId,
    ...CACHE_CONFIG.applications
  })
}

export const useApplicationAnalytics = () => {
  return useQuery({
    queryKey: ['application_analytics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('application_analytics')
        .select('*')
      if (error) throw error
      return data
    },
    ...CACHE_CONFIG.analytics
  })
}

export const useInsertAnalytics = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (analyticsData: any) => {
      const { data, error } = await supabase
        .from('application_analytics')
        .insert(analyticsData)
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['application_analytics'] })
    }
  })
}
