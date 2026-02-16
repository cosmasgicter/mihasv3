import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { applicationService } from '@/services/applications'
import { apiClient } from '@/services/client'
import { CACHE_CONFIG } from './useSupabaseQuery'

export const useApplicationDrafts = (userId?: string) => {
  return useQuery({
    queryKey: ['application_drafts', userId],
    queryFn: async () => {
      const result = await applicationService.list({ mine: true, status: 'draft' })
      return result?.applications ?? []
    },
    enabled: !!userId,
    ...CACHE_CONFIG.applications
  })
}

export const useApplicationAnalytics = () => {
  return useQuery({
    queryKey: ['application_analytics'],
    queryFn: async () => {
      const result = await apiClient.request<{ data: unknown[] }>('/admin?action=stats')
      return result?.data ?? []
    },
    ...CACHE_CONFIG.analytics
  })
}

export const useInsertAnalytics = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (analyticsData: Record<string, unknown>) => {
      // Analytics tracking is non-critical — fire-and-forget
      try {
        await apiClient.request('/applications?action=analytics', {
          method: 'POST',
          body: JSON.stringify(analyticsData)
        })
      } catch {
        // Silently swallow — analytics is non-critical
        console.error('Analytics insert failed (non-critical)')
      }
      return null
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['application_analytics'] })
    }
  })
}
