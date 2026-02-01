/**
 * Auth Mutations - Uses HTTP-only cookie authentication
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'

/**
 * Helper for authenticated API calls using HTTP-only cookies
 */
async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

export const useSignOut = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async () => {
      const response = await authFetch('/api/auth?action=logout', {
        method: 'POST',
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Sign out failed')
      }
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
      const response = await authFetch('/api/auth?action=refresh', {
        method: 'POST',
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Session refresh failed')
      }
      return response.json()
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
        const response = await authFetch('/api/auth?action=reset-password', {
          method: 'POST',
          body: JSON.stringify({ newPassword: updates.password }),
        })
        if (!response.ok) {
          const error = await response.json().catch(() => ({}))
          throw new Error(error.error || 'Password update failed')
        }
        return response.json()
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
