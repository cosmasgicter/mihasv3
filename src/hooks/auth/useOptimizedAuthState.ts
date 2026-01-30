/**
 * Optimized Authentication State Hook
 * 
 * Leverages React Query caching to avoid redundant session validations.
 * Moves auth checks to non-blocking code paths.
 * Requirements: 4.5
 */

import { useQuery } from '@tanstack/react-query'
import { User } from '@supabase/supabase-js'
import { getSupabaseClient, isSupabaseConfigured, UserProfile } from '@/lib/supabase'
import { CACHE_CONFIG } from '@/hooks/queries/useSupabaseQuery'

interface AuthState {
  user: User | null
  profile: UserProfile | null
  isAuthenticated: boolean
  isAdmin: boolean
  isLoading: boolean
}

/**
 * Fetch current session with caching
 * Uses React Query to cache session data and avoid redundant API calls
 */
function useSessionQuery() {
  return useQuery({
    queryKey: ['auth', 'session'],
    queryFn: async () => {
      if (!isSupabaseConfigured) {
        return null
      }

      const supabase = getSupabaseClient()
      const { data: { session }, error } = await supabase.auth.getSession()

      if (error) {
        console.error('[Auth] Session error:', error.message)
        // Throw error with status info for retry logic to handle
        throw new Error(`Session error: ${error.message}`)
      }

      return session
    },
    staleTime: CACHE_CONFIG.auth.staleTime, // 5 minutes
    gcTime: CACHE_CONFIG.auth.gcTime, // 10 minutes
    refetchOnMount: false, // Don't refetch on every mount
    refetchOnWindowFocus: false, // Don't refetch on window focus
    // Smart retry logic: stop on auth errors (401, 403), retry once for other errors
    // Requirements: 5.1, 5.3, 5.4
    retry: (failureCount, error) => {
      // Don't retry on auth errors (401, 403) - prevents infinite loops
      if (error instanceof Error && 
          (error.message.includes('401') || 
           error.message.includes('403') ||
           error.message.includes('unauthorized') ||
           error.message.includes('Unauthorized'))) {
        return false
      }
      // Maximum 1 retry for other errors (total 2 attempts)
      return failureCount < 1
    },
    // Exponential backoff: 1s, 2s, 4s, 8s, max 10s
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000)
  })
}

/**
 * Fetch user profile with caching
 * Leverages existing React Query cache from login flow
 */
function useProfileQueryOptimized(userId: string | undefined) {
  return useQuery({
    queryKey: ['user-profile', userId],
    queryFn: async () => {
      if (!userId || !isSupabaseConfigured) {
        return null
      }

      const supabase = getSupabaseClient()
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (error) {
        console.error('Profile query error:', error)
        // Throw error with status info for retry logic to handle
        throw new Error(`Profile query error: ${error.message}`)
      }

      return data as UserProfile | null
    },
    enabled: Boolean(userId), // Only run if userId exists
    staleTime: CACHE_CONFIG.auth.staleTime, // 5 minutes
    gcTime: CACHE_CONFIG.auth.gcTime, // 10 minutes
    refetchOnMount: false, // Don't refetch on every mount
    refetchOnWindowFocus: false, // Don't refetch on window focus
    // Smart retry logic: stop on auth errors (401, 403), retry once for other errors
    // Requirements: 5.3
    retry: (failureCount, error) => {
      // Don't retry on auth errors (401, 403) - prevents infinite loops
      if (error instanceof Error && 
          (error.message.includes('401') || 
           error.message.includes('403') ||
           error.message.includes('unauthorized') ||
           error.message.includes('Unauthorized'))) {
        return false
      }
      // Maximum 1 retry for other errors (total 2 attempts)
      return failureCount < 1
    },
    // Exponential backoff: 1s, 2s, 4s, 8s, max 10s
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000)
  })
}

/**
 * Check if user has admin role
 */
function checkIsAdmin(user: User | null, profile: UserProfile | null): boolean {
  if (!user) return false
  
  // Hardcoded super admin
  if (user.email === 'cosmas@beanola.com') return true
  
  // Check profile role
  const role = profile?.role || user.user_metadata?.role || user.app_metadata?.role
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
  const { data: session, isLoading: sessionLoading } = useSessionQuery()
  
  // Fetch profile with caching (only if user exists)
  const { data: profile, isLoading: profileLoading } = useProfileQueryOptimized(
    session?.user?.id
  )

  const user = session?.user || null
  const isAuthenticated = Boolean(user)
  const isAdmin = checkIsAdmin(user, profile)
  const isLoading = sessionLoading || (isAuthenticated && profileLoading)

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
  const { data: session, isLoading } = useSessionQuery()
  
  return {
    isAuthenticated: Boolean(session?.user),
    isLoading,
    user: session?.user || null
  }
}

/**
 * Invalidate auth cache
 * Call this after login/logout to refresh auth state
 */
export function useInvalidateAuthCache() {
  const { useQueryClient } = require('@tanstack/react-query')
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
