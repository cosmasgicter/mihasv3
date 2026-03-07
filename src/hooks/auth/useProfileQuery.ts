import { useCallback, useMemo } from 'react'
import { logger } from '@/lib/logger'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import type { UserProfile } from '@/types/auth'
import { sanitizeForDisplay } from '@/lib/sanitize'
import { authRequest } from '@/services/authController'

interface User {
  id: string
  email?: string
  user_metadata?: Record<string, any>
}

export interface UseProfileQueryOptions {
  user?: User | null
  enabled?: boolean
}

type ProfileUpdate = Partial<UserProfile>

type ProfileQueryResult = {
  profile: UserProfile | null
  isLoading: boolean
  isFetching: boolean
  error: unknown
  refetch: () => Promise<any>
  updateProfile: (updates: ProfileUpdate) => Promise<UserProfile>
  updatingProfile: boolean
  updateError: unknown
}

const PROFILE_QUERY_KEY = (userId?: string | null) => ['user-profile', userId]

function sanitizeProfile(data: Record<string, unknown> | null): UserProfile | null {
  if (!data) return null

  return Object.entries(data).reduce((acc, [key, value]) => {
    (acc as Record<string, unknown>)[key] = typeof value === 'string'
      ? sanitizeForDisplay(value)
      : value
    return acc
  }, {} as UserProfile)
}

export function useProfileQuery(options: UseProfileQueryOptions = {}): ProfileQueryResult {
  const { user: contextUser } = useAuth()
  const user = options.user ?? contextUser
  const enabled = options.enabled ?? Boolean(user?.id)
  const queryClient = useQueryClient()

  const profileQuery = useQuery({
    queryKey: PROFILE_QUERY_KEY(user?.id),
    enabled: enabled && Boolean(user?.id),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!user?.id) {
        return null
      }

      const result = await authRequest<UserProfile | { user?: UserProfile }>('/api/auth?action=profile')
      if (!result.success) {
        return null
      }

      const payload = (result?.data as { user?: UserProfile })?.user ?? result.data
      return sanitizeProfile(payload ?? null)
    }
  })

  const updateProfileMutation = useMutation({
    mutationFn: async (updates: ProfileUpdate) => {
      if (!user?.id) {
        throw new Error('User not authenticated or user ID missing')
      }

      const allowedFields = [
        'full_name',
        'phone',
        'date_of_birth',
        'sex',
        'residence_town',
        'country',
        'nationality',
        'next_of_kin_name',
        'next_of_kin_phone'
      ]

      const sanitizedUpdates: Record<string, any> = {}

      for (const [key, value] of Object.entries(updates)) {
        if (!allowedFields.includes(key)) {
          continue
        }

        if (value === undefined) {
          continue
        }

        if (value === null || value === '') {
          sanitizedUpdates[key] = null
          continue
        }

        if (typeof value === 'string') {
          const trimmed = value.trim()
          const cleaned = trimmed.replace(/[<>]/g, '')
          sanitizedUpdates[key] = cleaned === '' ? null : cleaned
        } else {
          sanitizedUpdates[key] = value
        }
      }

      if (Object.keys(sanitizedUpdates).length === 0) {
        throw new Error('No valid fields to update')
      }

      logger.log('Attempting to update profile for user:', user.id)
      logger.log('Sanitized updates:', sanitizedUpdates)

      const result = await authRequest<UserProfile>('/api/auth?action=profile', {
        method: 'PATCH',
        body: JSON.stringify(sanitizedUpdates),
      })

      if (!result.success) {
        throw new Error(result.error || 'Failed to update profile')
      }

      const data = sanitizeProfile(result?.data ?? null)

      if (!data) {
        throw new Error('Profile update returned no data. The profile may not exist.')
      }

      logger.log('Profile updated successfully:', data)
      return data as UserProfile
    },
    onSuccess: async (data) => {
      queryClient.setQueryData(PROFILE_QUERY_KEY(user?.id), data)
      await queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY(user?.id) })
    }
  })

  const updateProfile = useCallback(async (updates: ProfileUpdate) => {
    const result = await updateProfileMutation.mutateAsync(updates)
    return result
  }, [updateProfileMutation])

  return useMemo(() => ({
    profile: profileQuery.data ?? null,
    isLoading: profileQuery.isLoading,
    isFetching: profileQuery.isFetching,
    error: profileQuery.error,
    refetch: profileQuery.refetch,
    updateProfile,
    updatingProfile: updateProfileMutation.isPending,
    updateError: updateProfileMutation.error
  }), [
    profileQuery.data,
    profileQuery.isLoading,
    profileQuery.isFetching,
    profileQuery.error,
    profileQuery.refetch,
    updateProfile,
    updateProfileMutation.isPending,
    updateProfileMutation.error
  ])
}
