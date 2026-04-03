import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { notificationService } from '@/services/notifications'
import { CACHE_CONFIG } from './useQueryConfig'

export const useNotificationPreferences = (userId?: string) => {
  return useQuery({
    queryKey: ['notification_preferences', userId],
    queryFn: async () => {
      const result = await notificationService.getPreferences()
      return result ?? null
    },
    enabled: !!userId,
    ...CACHE_CONFIG.users
  })
}

/**
 * Granular selector: returns only whether email notifications are enabled.
 * Shares the same cache as useNotificationPreferences — only re-renders when this flag changes.
 * Requirement 11.3: React Query granular selectors to prevent unnecessary re-renders.
 */
export const useEmailNotificationsEnabled = (userId?: string) => {
  return useQuery({
    queryKey: ['notification_preferences', userId],
    queryFn: async (): Promise<Record<string, unknown> | null> => {
      const result = await notificationService.getPreferences()
      return (result as Record<string, unknown>) ?? null
    },
    enabled: !!userId,
    select: useCallback((data: Record<string, unknown> | null) => {
      return data?.email_enabled === true
    }, []),
    ...CACHE_CONFIG.users
  })
}

export const useUpdateNotificationPreferences = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ userId, preferences }: { userId: string; preferences: Record<string, unknown> }) => {
      const result = await notificationService.updatePreferences(preferences)
      return result
    },
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ['notification_preferences', userId] })
    }
  })
}
