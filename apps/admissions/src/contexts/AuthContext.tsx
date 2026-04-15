/**
 * Auth Context — Django JWT Cookie Authentication
 *
 * Authentication relies on HTTP-only cookies (`access_token`, `refresh_token`)
 * set by the Django backend with `Domain=.mihas.edu.zm`, `SameSite=Lax`,
 * `Secure=true`. The frontend never reads or writes these cookies directly;
 * they are transmitted automatically via `credentials: 'include'` on every
 * cross-origin request to `api.mihas.edu.zm`.
 *
 * Session validation flow:
 *   - On page load: GET /api/v1/auth/session/ (via useSessionListener)
 *   - On visibility change (tab refocus): re-validate session
 *   - On 401 response: single token refresh via /api/v1/auth/refresh/
 *   - On refresh failure: clear caches, dispatch mihas:auth-expired, redirect
 *
 * CSRF tokens are exchanged via the X-CSRF-Token header and stored in-memory
 * (lib/csrfToken.ts). They are captured on login, refresh, and session check
 * responses.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
 */
import React, { createContext, useContext, useMemo, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { User, UserProfile, SignInResult, SignUpResult, PasswordResetResult } from '@/types/auth'
import { useSessionListener } from '@/hooks/auth/useSessionListener'
import { configureApiClientAuthFailure } from '@/services/client'
import { clearCsrfToken } from '@/lib/csrfToken'
import { secureStorage } from '@/lib/secureStorage'
import { useAuthBroadcast } from '@/lib/authBroadcast'
import { resetPrefetchState } from '@/lib/speculativePrefetch'

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  profileLoading: boolean
  isAdmin: boolean
  signIn: (email: string, password: string) => Promise<SignInResult>
  signUp: (email: string, password: string, userData: any) => Promise<SignUpResult>
  signOut: () => Promise<void>
  requestPasswordReset: (email: string) => Promise<PasswordResetResult>
  updatePassword: (password: string) => Promise<PasswordResetResult>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const auth = useSessionListener()
  useAuthBroadcast()

  // Configure the API client's auth failure callback.
  // When a 401 triggers a refresh attempt that also fails, the API client
  // invokes this callback to perform the full auth-expired cascade:
  //   1. Clear React Query cache (all queries)
  //   2. Clear CSRF token store (in-memory)
  //   3. Clear secure storage (encrypted localStorage)
  //   4. Dispatch mihas:auth-expired event (route guards listen for this)
  //   5. Redirect to login page
  useEffect(() => {
    configureApiClientAuthFailure(() => {
      // Clear auth state in React Query cache
      queryClient.setQueryData(['auth', 'session'], null)
      // Clear all caches
      queryClient.clear()
      // Clear CSRF token
      clearCsrfToken()
      // Clear speculative prefetch state so it re-runs on next login
      resetPrefetchState()
      // Clear secure storage (best-effort, fire-and-forget)
      secureStorage.clearSession().catch(() => {})
      // Redirect to sign-in
      const from = typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search}`
        : ''
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem('mihas:post-auth-redirect', from || '/')
          window.dispatchEvent(new CustomEvent('mihas:before-auth-redirect', {
            detail: { from },
          }))
        } catch {
          // best-effort state preservation
        }
      }
      const signInPath = from && from !== '/'
        ? `/auth/signin?redirect=${encodeURIComponent(from)}`
        : '/auth/signin'
      // Do not force a hard redirect here. Route guards and explicit user actions
      // should drive navigation so unsaved form state can be preserved.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mihas:auth-expired', {
          detail: { from, signInPath },
        }))
      }
    })
  }, [queryClient])

  // Re-validate session when the page becomes visible again (tab refocus).
  // This catches expired tokens after the user has been away, ensuring the
  // UI reflects the current auth state without waiting for a data fetch to 401.
  // Skip the first visibility event to avoid a duplicate request on initial load.
  useEffect(() => {
    let hasHiddenOnce = false

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        hasHiddenOnce = true
      } else if (document.visibilityState === 'visible' && hasHiddenOnce) {
        queryClient.invalidateQueries({ queryKey: ['auth', 'session'] })
      }
    }

    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        queryClient.setQueryData(['auth', 'session'], { pendingValidation: true })
        queryClient.invalidateQueries({ queryKey: ['auth', 'session'] })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pageshow', handlePageShow)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [queryClient])

  const value = useMemo(() => ({
    user: auth.user,
    profile: auth.profile,
    loading: auth.loading,
    profileLoading: auth.profileLoading,
    isAdmin: auth.isAdmin,
    signIn: auth.signIn,
    signUp: auth.signUp,
    signOut: auth.signOut,
    requestPasswordReset: auth.requestPasswordReset,
    updatePassword: auth.updatePassword,
  }), [
    auth.user,
    auth.profile,
    auth.loading,
    auth.profileLoading,
    auth.isAdmin,
    auth.signIn,
    auth.signUp,
    auth.signOut,
    auth.requestPasswordReset,
    auth.updatePassword,
  ])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
