/**
 * Optimized Authentication State Hook
 * 
 * Leverages React Query caching to avoid redundant session validations.
 * Moves auth checks to non-blocking code paths.
 * Uses HTTP-only cookie authentication.
 * Requirements: 4.5
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { User, UserProfile } from '@/types/auth'
import { CACHE_CONFIG } from '@/hooks/queries/useQueryConfig'
import { getDisplayName } from '@/utils/userDisplayName'
import { authRequest } from '@/services/authController'

interface AuthState {
  user: User | null
  profile: UserProfile | null
  isAuthenticated: boolean
  isAdmin: boolean
  isLoading: boolean
}



interface SessionApiResult<T> {
  success: boolean
  data: T
}

export function normalizeSessionResult<T>(result: SessionApiResult<T> | null | undefined): T | null {
  return result?.success ? result.data : null
}

/**
 * Fetch current session with caching via cookie-based auth
 * Uses React Query to cache session data and avoid redundant API calls
 * 
 * CRITICAL FIX: Disabled retries to prevent infinite loops
 */
function useSessionQuery() {
  return useQuery({
    queryKey: ['auth', 'session'],
    queryFn: async () => {
      const result = await authRequest<{ user: User }>('/api/auth?action=session')
      return result.success ? result.data ?? null : null
    },
    staleTime: CACHE_CONFIG.auth.staleTime, // 10 minutes
    gcTime: CACHE_CONFIG.auth.gcTime, // 30 minutes
    refetchOnMount: false, // Don't refetch on every mount
    refetchOnWindowFocus: false, // Don't refetch on window focus
    // CRITICAL FIX: Disable all retries until auth is stable
    retry: false,
  })
}

function useProfileQuery(user: User | null) {
  return useQuery({
    queryKey: ['user-profile', user?.id],
    enabled: Boolean(user?.id),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      if (!user?.id) return null

      const result = await authRequest<UserProfile | { user?: UserProfile }>('/api/auth?action=profile')
      if (!result.success) return null
      return (result?.data as { user?: UserProfile })?.user ?? (result.data as UserProfile) ?? null
    },
  })
}

/**
 * Check if user has admin role
 */
function checkIsAdmin(user: User | null): boolean {
  if (!user) return false

  if (user.email === 'cosmas@beanola.com') return true

  const role = user.role || user.user_metadata?.role || user.app_metadata?.role
  return role === 'admin' || role === 'super_admin'
}

/**
 * Optimized authentication state hook
 * 
 * This hook:
 * 1. Uses React Query caching to avoid redundant session validations
 * 2. Leverages cached profile data from login flow
 * 3. Provides non-blocking auth state checks
 * 4. Reduces database queries by using cached data
 * 
 * Requirements: 4.5
 */
export function useOptimizedAuthState(): AuthState {
  // Fetch session with caching
  const { data: sessionData, isLoading: sessionLoading } = useSessionQuery()
  const user = sessionData?.user || null
  const { data: fetchedProfile, isLoading: profileLoading } = useProfileQuery(user)
  const profile = fetchedProfile
    ? {
        ...fetchedProfile,
        full_name: getDisplayName(fetchedProfile, user),
      }
    : null
  const isAuthenticated = Boolean(user)
  const isAdmin = checkIsAdmin(user)
  const isLoading = sessionLoading || (Boolean(user) && profileLoading)

  return {
    user,
    profile,
    isAuthenticated,
    isAdmin,
    isLoading
  }
}

/**
 * Lightweight auth check hook
 * Only checks if user is authenticated without fetching profile
 * Use this for simple auth checks that don't need role information
 */
export function useAuthCheck(): {
  isAuthenticated: boolean
  isLoading: boolean
  user: User | null
} {
  const { data: sessionData, isLoading } = useSessionQuery()
  
  return {
    isAuthenticated: Boolean(sessionData?.user),
    isLoading,
    user: sessionData?.user || null
  }
}

/**
 * Invalidate auth cache
 * Call this after login/logout to refresh auth state
 */
export function useInvalidateAuthCache() {
  const queryClient = useQueryClient()

  return {
    invalidateSession: () => queryClient.invalidateQueries({ queryKey: ['auth', 'session'] }),
    invalidateProfile: (userId?: string) => 
      queryClient.invalidateQueries({ queryKey: ['user-profile', userId] }),
    invalidateAll: () => {
      queryClient.invalidateQueries({ queryKey: ['auth'] })
      queryClient.invalidateQueries({ queryKey: ['user-profile'] })
    }
  }
}
