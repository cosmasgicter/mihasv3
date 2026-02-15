/**
 * Optimized Authentication State Hook
 * 
 * Leverages React Query caching to avoid redundant session validations.
 * Moves auth checks to non-blocking code paths.
 * Uses HTTP-only cookie authentication.
 * Requirements: 4.5
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import type { User, UserProfile } from '@/types/auth'
import { CACHE_CONFIG } from '@/hooks/queries/useSupabaseQuery'

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
      const response = await authFetch('/api/auth?action=session')

      if (!response.ok) {
        if (response.status === 401) {
          return null
        }
        throw new Error(`Session error: ${response.statusText}`)
      }

      const result = await response.json()
      return normalizeSessionResult(result)
    },
    staleTime: CACHE_CONFIG.auth.staleTime, // 10 minutes
    gcTime: CACHE_CONFIG.auth.gcTime, // 30 minutes
    refetchOnMount: false, // Don't refetch on every mount
    refetchOnWindowFocus: false, // Don't refetch on window focus
    // CRITICAL FIX: Disable all retries until auth is stable
    retry: false,
  })
}

/**
 * Fetch user profile with caching
 * Leverages existing React Query cache from login flow
 * 
 * CRITICAL FIX: Disabled retries to prevent infinite loops
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
        throw new Error(`Profile query error: ${error.message}`)
      }

      return data as UserProfile | null
    },
    enabled: Boolean(userId), // Only run if userId exists
    staleTime: CACHE_CONFIG.auth.staleTime, // 10 minutes
    gcTime: CACHE_CONFIG.auth.gcTime, // 30 minutes
    refetchOnMount: false, // Don't refetch on every mount
    refetchOnWindowFocus: false, // Don't refetch on window focus
    // CRITICAL FIX: Disable all retries until auth is stable
    retry: false,
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
  const { data: sessionData, isLoading: sessionLoading } = useSessionQuery()
  
  // Fetch profile with caching (only if user exists)
  const { data: profile, isLoading: profileLoading } = useProfileQueryOptimized(
    sessionData?.user?.id
  )

  const user = sessionData?.user || null
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
