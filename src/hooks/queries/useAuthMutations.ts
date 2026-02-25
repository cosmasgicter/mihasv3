import { apiClient } from '@/services/client'

/**
 * Auth Mutations - Uses HTTP-only cookie authentication via canonical ApiClient
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'

export const useSignOut = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async () => {
      await apiClient.request('/api/auth?action=logout', {
        method: 'POST',
      })
    },
    onSuccess: () => {
      queryClient.clear()
    }
  })
}

export const useRefreshSession = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async () => {
      return await apiClient.request('/api/auth?action=refresh', {
        method: 'POST',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth'] })
    }
  })
}

export const useUpdateUser = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (updates: { email?: string; password?: string; full_name?: string }) => {
      // For password updates, use the reset-password endpoint
      if (updates.password) {
        return await apiClient.request('/api/auth?action=reset-password', {
          method: 'POST',
          body: JSON.stringify({ newPassword: updates.password }),
        })
      }
      
      // For other updates, we'd need a profile update endpoint
      // For now, throw an error for unsupported updates
      throw new Error('Only password updates are currently supported')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'user'] })
    }
  })
}
