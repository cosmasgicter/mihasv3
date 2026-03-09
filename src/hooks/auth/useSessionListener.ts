/**
 * Consolidated Session Listener Hook - Cookie-based authentication
 *
 * Merges useOptimizedAuthState's React Query caching and profile fetching
 * into a single hook that provides both state AND actions.
 *
 * This is the single source of truth for auth state — no competing hooks.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { User, UserProfile, SignInResult, SignUpResult, PasswordResetResult } from '@/types/auth'
import { CACHE_CONFIG } from '@/hooks/queries/useQueryConfig'
import { getDisplayName } from '@/utils/userDisplayName'
import { authRequest, logoutWithTwoPhaseClear } from '@/services/authController'
import { isAdminRole } from '@/lib/auth/roles'

export type { User, UserProfile, SignInResult, SignUpResult, PasswordResetResult } from '@/types/auth'
export type AuthUser = User

/**
 * Check if user has admin role (deterministic, no DB lookup)
 */
export function checkIsAdmin(user: User | null): boolean {
  if (!user) return false
  if (user.email === 'cosmas@beanola.com') return true
  const role = (user.role || user.user_metadata?.role || user.app_metadata?.role) as string | undefined
  return isAdminRole(role)
}

/**
 * Normalize a session API result envelope
 */
export function normalizeSessionResult<T>(result: { success: boolean; data: T } | null | undefined): T | null {
  return result?.success ? result.data : null
}

export function resolveAuthLoadingState({
  sessionLoading,
  user,
}: {
  sessionLoading: boolean
  user: User | null
  profileLoading: boolean
}): boolean {
  // If we already have user data in the cache (e.g., seeded from login response),
  // don't report loading even if React Query's isLoading is technically true
  // due to a background refetch. This prevents the post-login skeleton hang.
  if (user) return false
  // Route bootstrap should wait for the session check only. Profile hydration
  // can continue in parallel without blocking dashboard/page data loaders.
  return sessionLoading
}

export function useSessionListener() {
  const queryClient = useQueryClient()

  // Single session query — replaces both the useState approach in old useSessionListener
  // and the separate useSessionQuery in useOptimizedAuthState
  const { data: sessionData, isLoading: sessionLoading } = useQuery({
    queryKey: ['auth', 'session'],
    queryFn: async () => {
      const result = await authRequest<{ user?: User }>('/api/auth?action=session')
      return result.success && result.data?.user ? result.data : null
    },
    staleTime: CACHE_CONFIG.auth.staleTime,   // 10 minutes
    gcTime: CACHE_CONFIG.auth.gcTime,          // 30 minutes
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })

  const user = sessionData?.user ?? null

  // Profile query (moved from useOptimizedAuthState)
  const { data: fetchedProfile, isLoading: profileLoading } = useQuery({
    queryKey: ['user-profile', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const result = await authRequest<UserProfile | { user?: UserProfile }>('/api/auth?action=profile')
      if (!result.success) return null
      return (result?.data as { user?: UserProfile })?.user ?? (result.data as UserProfile) ?? null
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
  })

  const profile = fetchedProfile
    ? { ...fetchedProfile, full_name: getDisplayName(fetchedProfile, user) }
    : null

  const isAdmin = checkIsAdmin(user)
  const loading = resolveAuthLoadingState({
    sessionLoading,
    user,
    profileLoading,
  })

  // signIn — posts login, seeds cache immediately from response (no separate session round-trip)
  // CRITICAL FIX: Do NOT call queryClient.clear() before login — it causes a race condition
  // where isLoading stays true with no pending query to resolve it, hanging the skeleton screen.
  // Instead, seed the auth cache atomically after login succeeds, then clear stale non-auth data.
  const signIn = useCallback(async (email: string, password: string): Promise<SignInResult> => {
    const result = await authRequest<{ user?: User; profile?: UserProfile }>(
      '/api/auth?action=login',
      { method: 'POST', body: JSON.stringify({ email, password }) },
      { attemptRefreshOn401: false, redirectOnUnauthorized: false },
    )

    if (!result.success || !result.data?.user) {
      return { error: result.error || 'Login failed' }
    }

    const authUser = result.data.user

    // Seed auth session cache FIRST — this makes isAuthenticated=true immediately
    // and resolveAuthLoadingState returns false (no loading) since user data exists.
    queryClient.setQueryData(['auth', 'session'], { user: authUser })

    if (result.data.profile) {
      queryClient.setQueryData(['user-profile', authUser.id], result.data.profile)
    }

    // Clear stale non-auth queries (e.g., previous user's data) WITHOUT touching auth cache.
    // This replaces the old queryClient.clear() that caused the skeleton hang.
    queryClient.removeQueries({
      predicate: (query) => {
        const key = query.queryKey
        // Keep auth session and user-profile caches we just seeded
        if (key[0] === 'auth') return false
        if (key[0] === 'user-profile') return false
        return true
      },
    })

    window.dispatchEvent(new CustomEvent('userLoggedIn', {
      detail: { userId: authUser.id },
    }))

    return { user: authUser, profile: result.data.profile }
  }, [queryClient])

  // signUp — register, then atomically set cache
  const signUp = useCallback(async (email: string, password: string, userData: Record<string, any>): Promise<SignUpResult> => {
    const { confirmPassword, turnstileToken, full_name, ...cleanUserData } = userData

    const normalizedFullName = typeof full_name === 'string' ? full_name.trim() : ''
    const [firstName, ...lastNameParts] = normalizedFullName.split(/\s+/).filter(Boolean)
    const lastName = lastNameParts.join(' ')

    if (!firstName || !lastName) {
      return { error: 'Please provide your full name (first and last name).' }
    }

    const result = await authRequest<{ user?: User; profile?: UserProfile }>(
      '/api/auth?action=register',
      {
        method: 'POST',
        body: JSON.stringify({ email, password, firstName, lastName, ...cleanUserData }),
      },
      { attemptRefreshOn401: false, redirectOnUnauthorized: false },
    )

    if (!result.success) {
      return { error: result.error || 'Unable to create account' }
    }

    const userPayload = result.data?.user
    if (userPayload) {
      // Seed auth cache FIRST, then clear stale data (same pattern as signIn)
      queryClient.setQueryData(['auth', 'session'], { user: userPayload })
      if (result.data?.profile) {
        queryClient.setQueryData(['user-profile', userPayload.id], result.data.profile)
      }

      // Clear stale non-auth queries without touching the caches we just seeded
      queryClient.removeQueries({
        predicate: (query) => {
          const key = query.queryKey
          if (key[0] === 'auth') return false
          if (key[0] === 'user-profile') return false
          return true
        },
      })

      window.dispatchEvent(new CustomEvent('userLoggedIn', { detail: { userId: userPayload.id } }))
      return { user: userPayload, profile: result.data?.profile ?? null }
    }

    return { user: null }
  }, [queryClient])

  // signOut — two-phase clear, then reset query data
  const signOut = useCallback(async () => {
    await logoutWithTwoPhaseClear()
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('authSignedOut'))
    }
    queryClient.setQueryData(['auth', 'session'], null)
    queryClient.removeQueries({ queryKey: ['user-profile'] })
  }, [queryClient])

  const requestPasswordReset = useCallback(async (email: string): Promise<PasswordResetResult> => {
    const result = await authRequest('/api/auth?action=forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }, {
      attemptRefreshOn401: false,
      redirectOnUnauthorized: false,
    })

    return result.success ? {} : { error: result.error || 'Unable to send reset instructions' }
  }, [])

  const updatePassword = useCallback(async (password: string, token?: string): Promise<PasswordResetResult> => {
    const result = await authRequest<{ user?: User }>('/api/auth?action=reset-password', {
      method: 'POST',
      body: JSON.stringify({ password, token }),
    }, {
      attemptRefreshOn401: false,
      redirectOnUnauthorized: false,
    })

    if (!result.success) {
      return { error: result.error || 'Unable to reset password' }
    }

    if (result.data?.user) {
      queryClient.setQueryData(['auth', 'session'], { user: result.data.user })
    }

    return {}
  }, [queryClient])

  return {
    user,
    profile,
    loading,
    isAdmin,
    signIn,
    signUp,
    signOut,
    requestPasswordReset,
    updatePassword,
  }
}


/**
 * Lightweight auth check hook
 * Only checks if user is authenticated without fetching profile.
 * Use for simple auth guards that don't need role information.
 */
export function useAuthCheck(): {
  isAuthenticated: boolean
  isLoading: boolean
  user: User | null
} {
  const { data: sessionData, isLoading } = useQuery({
    queryKey: ['auth', 'session'],
    queryFn: async () => {
      const result = await authRequest<{ user?: User }>('/api/auth?action=session')
      return result.success && result.data?.user ? result.data : null
    },
    staleTime: CACHE_CONFIG.auth.staleTime,
    gcTime: CACHE_CONFIG.auth.gcTime,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })

  return {
    isAuthenticated: Boolean(sessionData?.user),
    isLoading,
    user: sessionData?.user || null,
  }
}

/**
 * Invalidate auth cache utility hook
 * Call after login/logout to refresh auth state
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
    },
  }
}
