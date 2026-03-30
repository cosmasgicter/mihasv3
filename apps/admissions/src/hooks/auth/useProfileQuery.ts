import { useCallback, useMemo } from 'react'
import { logger } from '@/lib/logger'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import type { User, UserProfile } from '@/types/auth'
import { sanitizeForDisplay } from '@/lib/sanitize'

/**
 * Password update mutation — relocated from useAuthMutations.ts
 * Uses the reset-password endpoint for password changes.
 */
export const useUpdateUser = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (updates: { email?: string; password?: string; full_name?: string }) => {
      if (updates.password) {
        throw new Error('Authenticated password changes are not implemented in the Django backend yet')
      }
      throw new Error('Only password updates are currently supported')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'user'] })
    }
  })
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
      return sanitizeProfile({
        id: user.id,
        user_id: user.id,
        email: user.email,
        role: user.role || 'student',
        full_name: user.full_name,
      })
    }
  })

  const updateProfileMutation = useMutation<UserProfile, Error, ProfileUpdate>({
    mutationFn: async (updates: ProfileUpdate): Promise<UserProfile> => {
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
        'nrc_number',
        'address',
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

      logger.info('Attempting to update profile for user:', user.id)
      logger.info('Sanitized updates:', sanitizedUpdates)
      throw new Error('Profile updates are not implemented in the Django backend yet')
    },
    onSuccess: async (data: UserProfile) => {
      queryClient.setQueryData(PROFILE_QUERY_KEY(user?.id), (current: UserProfile | null | undefined) => ({
        ...(current ?? {}),
        ...data,
      }))
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
