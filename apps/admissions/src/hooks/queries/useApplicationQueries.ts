import { useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { applicationService } from '@/services/applications'
import { adminDashboardService } from '@/services/admin/dashboard'
import { CACHE_CONFIG } from './useQueryConfig'

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

/**
 * Granular selector: returns only the draft count from the application drafts query.
 * Shares the same cache as useApplicationDrafts — only re-renders when the count changes.
 * Requirement 11.3: React Query granular selectors to prevent unnecessary re-renders.
 */
export const useApplicationDraftCount = (userId?: string) => {
  return useQuery({
    queryKey: ['application_drafts', userId],
    queryFn: async () => {
      const result = await applicationService.list({ mine: true, status: 'draft' })
      return result?.applications ?? []
    },
    enabled: !!userId,
    select: useCallback((data: unknown[]) => data.length, []),
    ...CACHE_CONFIG.applications
  })
}

export const useApplicationAnalytics = () => {
  return useQuery({
    queryKey: ['application_analytics'],
    queryFn: async () => {
      const result = await adminDashboardService.getOverview()
      return result.recentActivity ?? []
    },
    ...CACHE_CONFIG.analytics
  })
}
