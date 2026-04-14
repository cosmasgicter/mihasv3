/**
 * Consolidated Session Listener Hook — Django JWT Cookie Authentication
 *
 * Merges useOptimizedAuthState's React Query caching and profile fetching
 * into a single hook that provides both state AND actions.
 *
 * This is the single source of truth for auth state — no competing hooks.
 *
 * Authentication relies on HTTP-only cookies (`access_token`, `refresh_token`)
 * set by the Django backend with `Domain=.mihas.edu.zm`, `SameSite=Lax`,
 * `Secure=true`. The frontend never reads or writes these cookies directly.
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
import { clearCsrfToken } from '@/lib/csrfToken'
import { secureStorage } from '@/lib/secureStorage'
import { broadcastLogin, broadcastLogout } from '@/lib/authBroadcast'

export type { User, UserProfile, SignInResult, SignUpResult, PasswordResetResult } from '@/types/auth'
export type AuthUser = User

type SessionQueryData = {
  user?: User
  pendingValidation?: true
} | null

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

  // Resolve role from top-level, then user_metadata, then app_metadata.
  // Django login responses may nest the role differently than expected.
  const resolvedRole =
    payload.role ||
    (typeof payload.user_metadata?.role === 'string' ? payload.user_metadata.role : undefined) ||
    (typeof payload.app_metadata?.role === 'string' ? payload.app_metadata.role : undefined) ||
    'student'

  return {
    ...payload,
    id: String(payload.id),
    email: payload.email,
    role: resolvedRole,
    full_name: fullName || undefined,
  }
}

type AuthUserEnvelope = {
  user?: (Partial<User> & { first_name?: string; last_name?: string }) | null
}

function hasUserEnvelope(result: unknown): result is AuthUserEnvelope {
  return Boolean(result && typeof result === 'object' && 'user' in result)
}

export function extractAuthUser(result: unknown): User | null {
  if (!result) {
    return null
  }

  if (hasUserEnvelope(result)) {
    return normalizeAuthUser(result.user ?? null)
  }

  const direct = normalizeAuthUser(result)
  if (!direct) {
    console.warn(
      '[auth] Unexpected auth response shape — could not extract user:',
      typeof result === 'object' ? Object.keys(result as object) : typeof result
    )
  }
  return direct
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
    queryKey: ['auth', 'session'],
    queryFn: async () => {
      try {
        const result = await authService.session() as User | { user?: User } | null
        const normalizedUser = extractAuthUser(result)
        if (normalizedUser) return { user: normalizedUser }

        // Session returned no user — the access token may have expired.
        // Attempt a silent refresh and retry the session check once.
        try {
          await authService.refresh()
          const retryResult = await authService.session() as User | { user?: User } | null
          const retryUser = extractAuthUser(retryResult)
          if (retryUser) return { user: retryUser }
        } catch {
          // Refresh failed — user is genuinely unauthenticated.
        }

        return null
      } catch {
        // Session check failed (401/403 for unauthenticated visitors).
        // Return null silently — this is expected on public pages.
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
  const user = sessionPendingValidation ? null : sessionData?.user ?? null

  // Profile query — fetches the full profile from the API so that downstream
  // consumers (e.g. profile completion badge) see all fields, not just the
  // minimal session payload.  Falls back to session-derived data on error.
  const { data: fetchedProfile, isLoading: profileLoading } = useQuery({
    queryKey: ['user-profile', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      if (!user?.id) return buildProfileFromUser(user)
      try {
        // Try fetching the full profile from the dedicated endpoint
        const profileData = await import('@/services/client').then(
          ({ apiClient }) => apiClient.request<Record<string, unknown>>('/auth/profile/', { method: 'GET' })
        )
        if (profileData && typeof profileData === 'object' && 'id' in profileData) {
          return profileData as unknown as UserProfile
        }
      } catch {
        // Fall back to minimal profile from session user
      }
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
      queryClient.setQueryData(['auth', 'session'], { user: authUser })

      const normalizedProfile = buildProfileFromUser(authUser)
      queryClient.setQueryData(['user-profile', authUser.id], normalizedProfile)

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
      queryClient.setQueryData(['auth', 'session'], null)
      if (currentUserId) {
        queryClient.setQueryData(['user-profile', currentUserId], null)
      }
      queryClient.setQueryData(['user-profile', undefined], null)

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
        const result = await authService.session() as User | { user?: User } | null
        const normalizedUser = extractAuthUser(result)
        return normalizedUser ? { user: normalizedUser } : null
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
    isAuthenticated: !sessionPendingValidation && Boolean(sessionData?.user),
    isLoading: isLoading || sessionPendingValidation,
    user: sessionPendingValidation ? null : sessionData?.user || null,
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
