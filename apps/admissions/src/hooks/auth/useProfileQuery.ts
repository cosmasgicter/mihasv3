import { useCallback, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/services/client'
import type { User, UserProfile } from '@/types/auth'
import { sanitizeForDisplay } from '@/lib/sanitize'

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
  const queryClient = useQueryClient()
  const user = options.user ?? contextUser
  const enabled = options.enabled ?? Boolean(user?.id)


  const profileQuery = useQuery({
    queryKey: PROFILE_QUERY_KEY(user?.id),
    enabled: enabled && Boolean(user?.id),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!user?.id) return null
      try {
        const data = await apiClient.request<UserProfile>('/auth/profile/', {
          method: 'GET',
        })
        return sanitizeProfile(data as Record<string, unknown> | null)
      } catch (err) {
        // If this is an auth error (401 after failed refresh), don't mask it
        // with minimal data — let the auth cascade handle logout properly.
        // Only fall back to session data for non-auth errors (network, 500, etc.)
        if (err && typeof err === 'object' && (
          ('name' in err && (err as Error).name === 'AuthenticationError') ||
          ('status' in err && (err as Record<string, unknown>).status === 401)
        )) {
          throw err
        }
        return sanitizeProfile({
          id: user.id,
          user_id: user.id,
          email: user.email,
          role: user.role || 'student',
          full_name: user.full_name,
          first_name: user.first_name ?? user.full_name?.split(/\s+/)[0],
          last_name: user.last_name ?? user.full_name?.split(/\s+/).slice(1).join(' '),
        })
      }
    }
  })


  const updateProfileMutation = useMutation<
    UserProfile, Error, ProfileUpdate,
    { previousProfile: UserProfile | null }
  >({
    mutationFn: async (updates: ProfileUpdate): Promise<UserProfile> => {
      const data = await apiClient.request<UserProfile>('/auth/profile/', {
        method: 'PATCH',
        body: JSON.stringify(updates),
      })
      return sanitizeProfile(data as Record<string, unknown> | null) as UserProfile
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: PROFILE_QUERY_KEY(user?.id) })
      const previousProfile = queryClient.getQueryData<UserProfile | null>(
        PROFILE_QUERY_KEY(user?.id)
      ) ?? null
      if (previousProfile) {
        queryClient.setQueryData<UserProfile>(PROFILE_QUERY_KEY(user?.id), {
          ...previousProfile,
          ...updates,
        })
      }
      return { previousProfile }
    },
    onError: (_error, _updates, context) => {
      if (context?.previousProfile !== undefined) {
        queryClient.setQueryData(PROFILE_QUERY_KEY(user?.id), context.previousProfile)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY(user?.id) })
    },
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
