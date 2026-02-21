import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
