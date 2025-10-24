import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { CACHE_CONFIG } from './useSupabaseQuery'

export const useNotificationPreferences = (userId?: string) => {
  return useQuery({
    queryKey: ['notification_preferences', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!userId,
    ...CACHE_CONFIG.users
  })
}

export const useUpdateNotificationPreferences = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ userId, preferences }: { userId: string; preferences: any }) => {
      const { data, error } = await supabase
        .from('notification_preferences')
        .upsert({ user_id: userId, ...preferences })
      if (error) throw error
      return data
    },
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ['notification_preferences', userId] })
    }
  })
}
