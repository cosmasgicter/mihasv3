import { useQuery } from '@tanstack/react-query'
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
