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
import { apiClient } from '@/services/client'
import { isAdminRole } from '@/lib/auth/roles'
import { clearCsrfToken } from '@/lib/csrfToken'
import { secureStorage } from '@/lib/secureStorage'

export type { User, UserProfile, SignInResult, SignUpResult, PasswordResetResult } from '@/types/auth'
export type AuthUser = User

/**
 * Check if user has admin role (deterministic, no DB lookup)
 */
export function checkIsAdmin(user: User | null): boolean {
  if (!user) return false
  const role = (user.role || user.user_metadata?.role || user.app_metadata?.role) as string | undefined
  return isAdminRole(role)
}

/**
 * Normalize a session API result envelope
 */
export function normalizeSessionResult<T>(result: { success: boolean; data: T } | null | undefined): T | null {
  return result?.success ? result.data : null
}

function normalizeAuthUser(
  payload: (Partial<User> & { first_name?: string; last_name?: string }) | null | undefined
): User | null {
  if (!payload?.id || !payload.email) {
    return null
  }

  const firstName = typeof payload.first_name === 'string' ? payload.first_name.trim() : ''
  const lastName = typeof payload.last_name === 'string' ? payload.last_name.trim() : ''
  const fullName = typeof payload.full_name === 'string' && payload.full_name.trim()
    ? payload.full_name.trim()
    : [firstName, lastName].filter(Boolean).join(' ').trim()

  return {
    ...payload,
    id: String(payload.id),
    email: payload.email,
    role: payload.role || 'student',
    full_name: fullName || undefined,
  }
}

function extractAuthUser(result: User | { user?: User } | null | undefined): User | null {
  if (!result) {
    return null
  }

  if (typeof result === 'object' && 'user' in result) {
    return normalizeAuthUser(result.user)
  }

  return normalizeAuthUser(result)
}

function buildProfileFromUser(user: User | null): UserProfile | null {
  if (!user) {
    return null
  }

  return {
    id: user.id,
    user_id: user.id,
    email: user.email,
    role: user.role,
    full_name: user.full_name,
  }
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
      const result = await apiClient.request<User | { user?: User }>('/auth?action=session')
      const normalizedUser = extractAuthUser(result)
      return normalizedUser ? { user: normalizedUser } : null
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
      return buildProfileFromUser(user)
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
    try {
      const result = await apiClient.request<{ user?: User; profile?: UserProfile }>(
        '/auth?action=login',
        { method: 'POST', body: JSON.stringify({ email, password }) },
      )

      const authUser = extractAuthUser(result)

      if (!authUser) {
        return { error: 'Login failed' }
      }

      // Seed auth session cache FIRST — this makes isAuthenticated=true immediately
      // and resolveAuthLoadingState returns false (no loading) since user data exists.
      queryClient.setQueryData(['auth', 'session'], { user: authUser })

      const normalizedProfile = buildProfileFromUser(authUser)
      queryClient.setQueryData(['user-profile', authUser.id], normalizedProfile)

      // Clear stale non-auth queries (e.g., previous user's data) WITHOUT touching auth cache.
      // This replaces the old queryClient.clear() that caused the skeleton hang.
      // IMPORTANT: Also invalidate all remaining queries to force refetch with new user context.
      // This fixes the role-switch bug where student dashboard data persists after admin login.
      queryClient.removeQueries({
        predicate: (query) => {
          const key = query.queryKey
          // Keep auth session and user-profile caches we just seeded
          if (key[0] === 'auth') return false
          if (key[0] === 'user-profile' && key[1] === authUser.id) return false
          return true
        },
      })

      // Force invalidation of any remaining cached queries so they refetch with new auth
      queryClient.invalidateQueries()

      window.dispatchEvent(new CustomEvent('userLoggedIn', {
        detail: { userId: authUser.id },
      }))

      return { user: authUser, profile: normalizedProfile }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed'
      return { error: message }
    }
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

    try {
      const registerResult = await apiClient.request<{ user?: User; profile?: UserProfile }>(
        '/auth?action=register',
        {
          method: 'POST',
          body: JSON.stringify({ email, password, first_name: firstName, last_name: lastName, ...cleanUserData }),
        },
      )

      let loginResult: { user?: User; profile?: UserProfile } | null = null
      try {
        loginResult = await apiClient.request<{ user?: User; profile?: UserProfile }>(
          '/auth?action=login',
          { method: 'POST', body: JSON.stringify({ email, password }) },
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to sign in after account creation'
        if (/invalid credentials|unauthorized/i.test(message)) {
          return {
            error: 'We could not sign you in after registration. If this email is already registered, please sign in instead.',
          }
        }
        return { error: message }
      }

      const userPayload = extractAuthUser(loginResult) ?? extractAuthUser(registerResult)
      if (userPayload) {
        // Seed auth cache FIRST, then clear stale data (same pattern as signIn)
        queryClient.setQueryData(['auth', 'session'], { user: userPayload })
        const normalizedProfile = buildProfileFromUser(userPayload)
        queryClient.setQueryData(['user-profile', userPayload.id], normalizedProfile)

        // Clear stale non-auth queries without touching the caches we just seeded
        queryClient.removeQueries({
          predicate: (query) => {
            const key = query.queryKey
            if (key[0] === 'auth') return false
            if (key[0] === 'user-profile' && key[1] === userPayload.id) return false
            return true
          },
        })
        queryClient.invalidateQueries()

        window.dispatchEvent(new CustomEvent('userLoggedIn', { detail: { userId: userPayload.id } }))
        return { user: userPayload, profile: normalizedProfile }
      }

      return { user: null }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create account'
      return { error: message }
    }
  }, [queryClient])

  // signOut — clear CSRF → POST logout → clear ALL caches → clear storage → dispatch events
  const signOut = useCallback(async () => {
    // 1. Clear CSRF token (local-only, safe to do first)
    clearCsrfToken()

    // 2. POST logout while cookies are still valid, then wipe all cached queries
    try {
      await apiClient.request('/auth?action=logout', { method: 'POST' })
    } catch {
      // Ignore — server logout is best-effort
    } finally {
      queryClient.clear()
    }

    // 3. Clear secure storage
    try {
      await secureStorage.clearSession()
    } catch {
      // Ignore — secure storage clear is best-effort
    }

    // 3b. Clear redirect/session intent keys to avoid cross-role stale redirects
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('mihas:post-auth-redirect')
      sessionStorage.removeItem('mihas:wizard-auth-redirect-guard')
    }

    // 4. Dispatch auth signed out event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('authSignedOut'))
    }

    // 5. Navigate to sign-in route using router-safe event dispatch
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mihas:auth-redirect', {
        detail: { to: '/auth/signin', replace: true },
      }))
    }
  }, [queryClient])

  const requestPasswordReset = useCallback(async (email: string): Promise<PasswordResetResult> => {
    try {
      await apiClient.request('/auth?action=forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      })
      return {}
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to send reset instructions'
      return { error: message }
    }
  }, [])

  const updatePassword = useCallback(async (password: string, token?: string): Promise<PasswordResetResult> => {
    if (!token) {
      return { error: 'Password reset token missing' }
    }

    try {
      await apiClient.request('/auth?action=reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, new_password: password }),
      })

      return {}
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to reset password'
      return { error: message }
    }
  }, [queryClient])

  return {
    user,
    profile,
    loading,
    profileLoading,
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
  retrySessionCheck: () => Promise<unknown>
} {
  const queryClient = useQueryClient()
  const { data: sessionData, isLoading, refetch } = useQuery({
    queryKey: ['auth', 'session'],
    queryFn: async () => {
      const result = await apiClient.request<User | { user?: User }>('/auth?action=session')
      const normalizedUser = extractAuthUser(result)
      return normalizedUser ? { user: normalizedUser } : null
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
    retrySessionCheck: async () => {
      await queryClient.invalidateQueries({ queryKey: ['auth', 'session'] })
      return refetch()
    },
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
