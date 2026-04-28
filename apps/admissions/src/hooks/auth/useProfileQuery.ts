import { useCallback, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { authService } from '@/services/auth'
import type { User, UserProfile } from '@/types/auth'
import {
  fetchCurrentProfile,
  isAuthProfileError,
  mergeProfileIntoSessionUser,
  ProfilePayloadError,
  profileQueryKey,
  PROFILE_STALE_TIME_MS,
  sanitizeProfile,
  SESSION_QUERY_KEY,
  type SessionQueryData,
} from './authQueries'

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

export function useProfileQuery(options: UseProfileQueryOptions = {}): ProfileQueryResult {
  const { user: contextUser } = useAuth()
  const queryClient = useQueryClient()
  const user = options.user ?? contextUser
  const isAuthRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/auth/')
  const enabled = options.enabled ?? Boolean(user?.id)


  const profileQuery = useQuery({
    queryKey: profileQueryKey(user?.id),
    enabled: enabled && Boolean(user?.id) && !isAuthRoute,
    staleTime: PROFILE_STALE_TIME_MS,
    retry: false,
    queryFn: async () => {
      if (!user?.id) return null
      try {
        return await fetchCurrentProfile(user)
      } catch (err) {
        // If this is an auth error (401 after failed refresh), don't mask it
        // with minimal data — let the auth cascade handle logout properly.
        // Only fall back to session data for non-auth errors (network, 500, etc.)
        if (isAuthProfileError(err)) {
          throw err
        }
        throw err
      }
    }
  })


  const updateProfileMutation = useMutation<
    UserProfile, Error, ProfileUpdate,
    { previousProfile: UserProfile | null; previousSession: SessionQueryData }
  >({
    mutationFn: async (updates: ProfileUpdate): Promise<UserProfile> => {
      const data = await authService.updateProfile(updates)
      const sanitized = sanitizeProfile(data as Record<string, unknown> | null)
      if (!sanitized?.id) {
        throw new ProfilePayloadError()
      }
      return sanitized
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: profileQueryKey(user?.id) })
      const previousProfile = queryClient.getQueryData<UserProfile | null>(
        profileQueryKey(user?.id)
      ) ?? null
      const previousSession = queryClient.getQueryData<SessionQueryData>(SESSION_QUERY_KEY) ?? null
      if (previousProfile) {
        queryClient.setQueryData<UserProfile>(profileQueryKey(user?.id), {
          ...previousProfile,
          ...updates,
        })
      }
      if (previousSession?.user) {
        queryClient.setQueryData<SessionQueryData>(SESSION_QUERY_KEY, {
          ...previousSession,
          user: mergeProfileIntoSessionUser(previousSession.user, updates as UserProfile),
        })
      }
      return { previousProfile, previousSession }
    },
    onError: (_error, _updates, context) => {
      if (context?.previousProfile !== undefined) {
        queryClient.setQueryData(profileQueryKey(user?.id), context.previousProfile)
      }
      if (context?.previousSession !== undefined) {
        queryClient.setQueryData(SESSION_QUERY_KEY, context.previousSession)
      }
    },
    onSuccess: (updatedProfile) => {
      if (!user?.id || !updatedProfile) return
      queryClient.setQueryData<UserProfile>(profileQueryKey(user.id), updatedProfile)
      queryClient.setQueryData<SessionQueryData>(SESSION_QUERY_KEY, current => {
        if (!current?.user) return current
        return {
          ...current,
          user: mergeProfileIntoSessionUser(current.user, updatedProfile),
        }
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: profileQueryKey(user?.id) })
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
