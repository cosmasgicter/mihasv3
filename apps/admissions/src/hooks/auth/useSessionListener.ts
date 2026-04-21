/**
 * Consolidated Session Listener Hook — Django JWT Cookie Authentication
 *
 * Single source of truth for auth state and actions.
 *
 * Same-origin API proxy delivers cookies automatically.
 * DRF is the sole auth authority — token refresh is handled by the API client.
 * ProtectedRoute uses simple three-state logic (loading / authenticated / redirect).
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
import { resetAuthFailureDebounce } from '@/lib/sessionHardening'
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

function extractAuthUser(result: unknown): User | null {
  const direct = extractAuthUserFromResult(result)
  if (!direct) {
    console.warn(
      '[auth] Unexpected auth response shape — could not extract user:',
      typeof result === 'object' && result !== null ? Object.keys(result as object) : typeof result
    )
  }
  return direct
}

export function useSessionListener() {
  const queryClient = useQueryClient()

  // Session query — GET /api/v1/auth/session/ validates the cookie.
  // Visibility-change revalidation is handled by AuthContext.
  const { data: sessionData, isLoading: sessionLoading } = useQuery<SessionQueryData>({
    queryKey: SESSION_QUERY_KEY,
    queryFn: async () => {
      try {
        return await fetchSessionData()
      } catch (error) {
        const cached = queryClient.getQueryData<SessionQueryData>(SESSION_QUERY_KEY)
        const msg = error instanceof Error ? error.message.toLowerCase() : ''
        const isTransient =
          error instanceof TypeError ||
          (error instanceof Error && (
            error.name === 'TimeoutError' ||
            error.name === 'AbortError' ||
            msg.includes('failed to fetch') ||
            msg.includes('network') ||
            msg.includes('timeout') ||
            msg.includes('load failed') ||
            msg.includes('aborted')
          ))
        if (isTransient && cached?.user) return cached
        return null
      }
    },
    staleTime: CACHE_CONFIG.auth.staleTime,
    gcTime: CACHE_CONFIG.auth.gcTime,
    retry: false,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  })

  const user = sessionData?.user ?? null

  // Profile query — full profile for downstream consumers (e.g. completion badge).
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

  const isAdmin = user ? isAdminRole(user.role as string | undefined) : false
  // If we already have user data cached (e.g. seeded from login), don't block on loading.
  const loading = user ? false : sessionLoading

  // signIn — posts login, seeds cache immediately from response
  const signIn = useCallback(async (email: string, password: string): Promise<SignInResult> => {
    try {
      await queryClient.cancelQueries({ queryKey: SESSION_QUERY_KEY })
      const result = await authService.login({ email, password }) as { user?: User; profile?: UserProfile } | null
      await queryClient.cancelQueries({ queryKey: SESSION_QUERY_KEY })

      const authUser = extractAuthUser(result)
      if (!authUser) return { error: 'Login failed' }

      queryClient.setQueryData(SESSION_QUERY_KEY, { user: authUser })
      const normalizedProfile = buildProfileFromUser(authUser)
      queryClient.setQueryData(profileQueryKey(authUser.id), normalizedProfile, { updatedAt: 0 })

      queryClient.removeQueries({
        predicate: (query) => {
          const key = query.queryKey
          if (key[0] === 'auth') return false
          if (key[0] === 'user-profile' && key[1] === authUser.id) return false
          return true
        },
      })

      broadcastLogin(authUser.id)
      resetAuthFailureDebounce()
      window.dispatchEvent(new CustomEvent('userLoggedIn', { detail: { userId: authUser.id } }))

      return { user: authUser, profile: normalizedProfile }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Login failed' }
    }
  }, [queryClient])

  // signUp — register, auto-login, seed cache
  const signUp = useCallback(async (email: string, password: string, userData: Record<string, any>): Promise<SignUpResult> => {
    const { confirmPassword, turnstileToken, full_name, ...cleanUserData } = userData
    const normalizedFullName = typeof full_name === 'string' ? full_name.trim() : ''
    const [firstName, ...lastNameParts] = normalizedFullName.split(/\s+/).filter(Boolean)
    const lastName = lastNameParts.join(' ')

    if (!firstName || !lastName) {
      return { error: 'Please provide your full name (first and last name).' }
    }

    try {
      await queryClient.cancelQueries({ queryKey: SESSION_QUERY_KEY })
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
        await queryClient.cancelQueries({ queryKey: SESSION_QUERY_KEY })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to sign in after account creation'
        if (/invalid credentials|unauthorized/i.test(message)) {
          return { error: 'We could not sign you in after registration. If this email is already registered, please sign in instead.' }
        }
        return { error: message }
      }

      const userPayload = extractAuthUser(loginResult) ?? extractAuthUser(registerResult)
      if (userPayload) {
        queryClient.setQueryData(SESSION_QUERY_KEY, { user: userPayload })
        const normalizedProfile = buildProfileFromUser(userPayload)
        queryClient.setQueryData(profileQueryKey(userPayload.id), normalizedProfile, { updatedAt: 0 })

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
      return { error: error instanceof Error ? error.message : 'Unable to create account' }
    }
  }, [queryClient])

  // signOut — cancel queries, POST logout, clear everything, broadcast
  const signOut = useCallback(async () => {
    const currentUserId = user?.id

    await queryClient.cancelQueries({ queryKey: ['auth'] })
    await queryClient.cancelQueries({ queryKey: ['user-profile'] })

    try {
      await authService.logout()
    } catch { /* best-effort */ }

    clearCsrfToken()
    queryClient.setQueryData(SESSION_QUERY_KEY, null)
    if (currentUserId) queryClient.setQueryData(profileQueryKey(currentUserId), null)
    queryClient.setQueryData(profileQueryKey(undefined), null)
    queryClient.clear()

    try { await secureStorage.clearSession() } catch { /* best-effort */ }

    if (typeof window !== 'undefined') {
      localStorage.removeItem('mihas:post-auth-redirect')
      sessionStorage.removeItem('mihas:post-auth-redirect')
      localStorage.removeItem('mihas:wizard-auth-redirect-guard')
      sessionStorage.removeItem('mihas:wizard-auth-redirect-guard')
      window.dispatchEvent(new CustomEvent('authSignedOut'))
      window.dispatchEvent(new CustomEvent('mihas:auth-redirect', {
        detail: { to: '/auth/signin', replace: true },
      }))
    }

    broadcastLogout()
  }, [queryClient, user?.id])

  const requestPasswordReset = useCallback(async (email: string): Promise<PasswordResetResult> => {
    try {
      await authService.passwordReset({ email })
      return {}
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unable to send reset instructions' }
    }
  }, [])

  const updatePassword = useCallback(async (password: string, token?: string): Promise<PasswordResetResult> => {
    if (!token) return { error: 'Password reset token missing' }
    try {
      await authService.passwordResetConfirm({ token, newPassword: password })
      return {}
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unable to reset password' }
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
 * Lightweight auth check hook for route guards.
 * Subscribes to the same session query — React Query deduplicates.
 */
export function useAuthCheck(): {
  isAuthenticated: boolean
  isLoading: boolean
  user: User | null
  retrySessionCheck: () => Promise<unknown>
} {
  const queryClient = useQueryClient()

  const { data: sessionData, isLoading } = useQuery<SessionQueryData>({
    queryKey: SESSION_QUERY_KEY,
    queryFn: async () => {
      try { return await fetchSessionData() } catch { return null }
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
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY })
      return queryClient.refetchQueries({ queryKey: SESSION_QUERY_KEY })
    },
  }
}
