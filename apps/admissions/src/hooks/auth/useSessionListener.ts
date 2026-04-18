/**
 * Consolidated Session Listener Hook — Django JWT Cookie Authentication
 *
 * Merges useOptimizedAuthState's React Query caching and profile fetching
 * into a single hook that provides both state AND actions.
 *
 * This is the single source of truth for auth state — no competing hooks.
 *
 * Authentication relies on HTTP-only cookies (`access_token`, `refresh_token`)
 * set by the Django backend with cross-subdomain cookie attributes
 * (`Domain=.mihas.edu.zm`; production uses `SameSite=None; Secure`).
 * The frontend never reads or writes these cookies directly.
 *
 * Session validation:
 *   - On mount: GET /api/v1/auth/session/ validates the current cookie
 *   - On visibility change: AuthContext invalidates the session query
 *   - On 401: API client attempts single refresh via /api/v1/auth/refresh/
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
 */

import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { User, UserProfile, SignInResult, SignUpResult, PasswordResetResult } from '@/types/auth'
import { CACHE_CONFIG } from '@/hooks/queries/useQueryConfig'
import { getDisplayName } from '@/utils/userDisplayName'
import { authService } from '@/services/auth'
import { isAdminRole } from '@/lib/auth/roles'
import { extractAuthUser as extractAuthUserFromResult } from '@/lib/authSession'
import { clearCsrfToken } from '@/lib/csrfToken'
import { secureStorage } from '@/lib/secureStorage'
import { broadcastLogin, broadcastLogout } from '@/lib/authBroadcast'
import {
  buildProfileFromUser,
  fetchCurrentProfile,
  fetchSessionData,
  profileQueryKey,
  PROFILE_STALE_TIME_MS,
  SESSION_QUERY_KEY,
  type SessionQueryData,
} from './authQueries'

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

export function extractAuthUser(result: unknown): User | null {
  const direct = extractAuthUserFromResult(result)
  if (!direct) {
    console.warn(
      '[auth] Unexpected auth response shape — could not extract user:',
      typeof result === 'object' && result !== null ? Object.keys(result as object) : typeof result
    )
  }
  return direct
}

export function resolveAuthLoadingState({
  sessionLoading,
  sessionPendingValidation = false,
  user,
}: {
  sessionLoading: boolean
  sessionPendingValidation?: boolean
  user: User | null
  profileLoading: boolean
}): boolean {
  if (sessionPendingValidation) return true
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

  // Single session query — validates auth on page load by calling
  // GET /api/v1/auth/session/. The Django backend checks the HTTP-only
  // access_token cookie and returns the current user or 401.
  // Visibility-change revalidation is handled by AuthContext invalidating
  // this query key when the tab regains focus.
  const { data: sessionData, isLoading: sessionLoading } = useQuery<SessionQueryData>({
    queryKey: SESSION_QUERY_KEY,
    queryFn: async () => {
      try {
        return await fetchSessionData()
      } catch (error) {
        const cachedSession = queryClient.getQueryData<SessionQueryData>(SESSION_QUERY_KEY)
        const message = error instanceof Error ? error.message.toLowerCase() : ''
        const isTransientSessionError =
          error instanceof TypeError ||
          (error instanceof Error && (
            error.name === 'TimeoutError' ||
            error.name === 'AbortError' ||
            message.includes('failed to fetch') ||
            message.includes('network') ||
            message.includes('timeout') ||
            message.includes('load failed') ||
            message.includes('aborted')
          ))

        if (isTransientSessionError && cachedSession?.user) {
          return cachedSession
        }

        // Session check failed for an unauthenticated visitor or unrecoverable
        // auth state. The API client already attempted refresh for expired
        // access cookies before this point.
        return null
      }
    },
    staleTime: CACHE_CONFIG.auth.staleTime,   // 10 minutes
    gcTime: CACHE_CONFIG.auth.gcTime,          // 30 minutes
    retry: false,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  })

  const sessionPendingValidation = sessionData?.pendingValidation === true
  const user = sessionData?.user ?? null

  // Profile query — fetches the full profile from the API so that downstream
  // consumers (e.g. profile completion badge) see all fields, not just the
  // minimal session payload.  Falls back to session-derived data on error.
  const { data: fetchedProfile, isLoading: profileLoading } = useQuery({
    queryKey: profileQueryKey(user?.id),
    enabled: Boolean(user?.id),
    queryFn: async () => {
      if (!user?.id) return buildProfileFromUser(user)
      return fetchCurrentProfile(user)
    },
    staleTime: PROFILE_STALE_TIME_MS,
    gcTime: 30 * 60 * 1000,
    retry: false,
  })

  const profile = fetchedProfile
    ? { ...fetchedProfile, full_name: getDisplayName(fetchedProfile, user) }
    : null

  const isAdmin = checkIsAdmin(user)
  const loading = resolveAuthLoadingState({
    sessionLoading,
    sessionPendingValidation,
    user,
    profileLoading,
  })

  // signIn — posts login, seeds cache immediately from response (no separate session round-trip)
  // CRITICAL FIX: Do NOT call queryClient.clear() before login — it causes a race condition
  // where isLoading stays true with no pending query to resolve it, hanging the skeleton screen.
  // Instead, seed the auth cache atomically after login succeeds, then clear stale non-auth data.
  const signIn = useCallback(async (email: string, password: string): Promise<SignInResult> => {
    try {
      await queryClient.cancelQueries({ queryKey: ['auth', 'session'] })
      const result = await authService.login({ email, password }) as { user?: User; profile?: UserProfile } | null
      await queryClient.cancelQueries({ queryKey: ['auth', 'session'] })

      const authUser = extractAuthUser(result)

      if (!authUser) {
        return { error: 'Login failed' }
      }

      // Seed auth session cache FIRST — this makes isAuthenticated=true immediately
      // and resolveAuthLoadingState returns false (no loading) since user data exists.
      queryClient.setQueryData(SESSION_QUERY_KEY, { user: authUser })

      const normalizedProfile = buildProfileFromUser(authUser)
      queryClient.setQueryData(profileQueryKey(authUser.id), normalizedProfile, { updatedAt: 0 })

      // Clear stale non-auth queries (e.g., previous user's data) WITHOUT touching auth cache.
      // This replaces the old queryClient.clear() that caused the skeleton hang.
      queryClient.removeQueries({
        predicate: (query) => {
          const key = query.queryKey
          // Keep auth session and user-profile caches we just seeded
          if (key[0] === 'auth') return false
          if (key[0] === 'user-profile' && key[1] === authUser.id) return false
          return true
        },
      })

      broadcastLogin(authUser.id)
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
      await queryClient.cancelQueries({ queryKey: ['auth', 'session'] })
      const registerResult = await authService.register({
        email,
        password,
        fullName: normalizedFullName,
        phone: typeof cleanUserData.phone === 'string' ? cleanUserData.phone : undefined,
        nationality: typeof cleanUserData.nationality === 'string' ? cleanUserData.nationality : undefined,
      }) as { user?: User; profile?: UserProfile } | null

      let loginResult: { user?: User; profile?: UserProfile } | null = null
      try {
        loginResult = await authService.login({ email, password }) as { user?: User; profile?: UserProfile } | null
        await queryClient.cancelQueries({ queryKey: ['auth', 'session'] })
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
        queryClient.setQueryData(SESSION_QUERY_KEY, { user: userPayload })
        const normalizedProfile = buildProfileFromUser(userPayload)
        queryClient.setQueryData(profileQueryKey(userPayload.id), normalizedProfile, { updatedAt: 0 })

        // Clear stale non-auth queries without touching the caches we just seeded
        queryClient.removeQueries({
          predicate: (query) => {
            const key = query.queryKey
            if (key[0] === 'auth') return false
            if (key[0] === 'user-profile' && key[1] === userPayload.id) return false
            return true
          },
        })

        broadcastLogin(userPayload.id)
        window.dispatchEvent(new CustomEvent('userLoggedIn', { detail: { userId: userPayload.id } }))
        return { user: userPayload, profile: normalizedProfile }
      }

      return { user: null }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create account'
      return { error: message }
    }
  }, [queryClient])

  // signOut — POST logout while CSRF/cookies are still valid, then clear local state
  const signOut = useCallback(async () => {
    const currentUserId = user?.id

    await queryClient.cancelQueries({ queryKey: ['auth'] })
    await queryClient.cancelQueries({ queryKey: ['user-profile'] })

    // 1. POST logout while cookies and CSRF token are still available
    try {
      await authService.logout()
    } catch {
      // Ignore — server logout is best-effort
    } finally {
      clearCsrfToken()

      // Explicitly null out session and profile queries before clearing.
      // queryClient.clear() removes queries from the cache but components
      // that are still mounted may not re-render with null state. Setting
      // the data to null first ensures observers see the unauthenticated
      // state immediately, preventing stale role routing on re-login.
      queryClient.setQueryData(SESSION_QUERY_KEY, null)
      if (currentUserId) {
        queryClient.setQueryData(profileQueryKey(currentUserId), null)
      }
      queryClient.setQueryData(profileQueryKey(undefined), null)

      queryClient.clear()
    }

    // 2. Clear secure storage
    try {
      await secureStorage.clearSession()
    } catch {
      // Ignore — secure storage clear is best-effort
    }

    // 2b. Clear redirect/session intent keys to avoid cross-role stale redirects
    if (typeof window !== 'undefined') {
      localStorage.removeItem('mihas:post-auth-redirect')
      sessionStorage.removeItem('mihas:post-auth-redirect')
      localStorage.removeItem('mihas:wizard-auth-redirect-guard')
      sessionStorage.removeItem('mihas:wizard-auth-redirect-guard')
    }

    // 3. Dispatch auth signed out event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('authSignedOut'))
    }

    broadcastLogout()

    // 4. Navigate to sign-in route using router-safe event dispatch
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mihas:auth-redirect', {
        detail: { to: '/auth/signin', replace: true },
      }))
    }
  }, [queryClient, user?.id])

  const requestPasswordReset = useCallback(async (email: string): Promise<PasswordResetResult> => {
    try {
      await authService.passwordReset({ email })
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
      await authService.passwordResetConfirm({ token, newPassword: password })

      return {}
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to reset password'
      return { error: message }
    }
  }, [])

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

  // Subscribe to the shared ['auth', 'session'] query managed by useSessionListener.
  // Uses the same queryKey so React Query deduplicates — only one network request.
  // The queryFn is identical to useSessionListener's to satisfy React Query's
  // requirement that all observers of a key share the same function shape.
  const { data: sessionData, isLoading } = useQuery<SessionQueryData>({
    queryKey: ['auth', 'session'],
    queryFn: async () => {
      try {
        return await fetchSessionData()
      } catch {
        return null
      }
    },
    staleTime: CACHE_CONFIG.auth.staleTime,
    gcTime: CACHE_CONFIG.auth.gcTime,
    retry: false,
    // Don't refetch on mount — useSessionListener already handles that.
    // This observer just subscribes to the same cache entry.
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })

  const sessionPendingValidation = sessionData?.pendingValidation === true

  return {
    isAuthenticated: Boolean(sessionData?.user),
    isLoading: isLoading || sessionPendingValidation,
    user: sessionData?.user || null,
    retrySessionCheck: async () => {
      await queryClient.invalidateQueries({ queryKey: ['auth', 'session'] })
      return queryClient.refetchQueries({ queryKey: ['auth', 'session'] })
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
