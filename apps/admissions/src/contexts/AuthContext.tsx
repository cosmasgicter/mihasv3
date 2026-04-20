/**
 * Auth Context — Django JWT Cookie Authentication
 *
 * Authentication relies on HTTP-only cookies (`access_token`, `refresh_token`)
 * set by the Django backend with cross-subdomain cookie attributes
 * (`Domain=.mihas.edu.zm`; production uses `SameSite=None; Secure`).
 * The frontend never reads or writes these cookies directly;
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
import React, { createContext, useContext, useMemo, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { User, UserProfile, SignInResult, SignUpResult, PasswordResetResult } from '@/types/auth'
import { useSessionListener } from '@/hooks/auth/useSessionListener'
import { configureApiClientAuthFailure } from '@/services/client'
import { clearCsrfToken } from '@/lib/csrfToken'
import { secureStorage } from '@/lib/secureStorage'
import { useAuthBroadcast } from '@/lib/authBroadcast'
import { resetPrefetchState } from '@/lib/speculativePrefetch'
import { SESSION_MESSAGES } from '@/lib/sessionHardening'
import { isPaymentInProgress as _isPaymentInProgress } from '@/hooks/useApplicationPaymentAction'

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

const VISIBILITY_DEBOUNCE_MS = 3000

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const auth = useSessionListener()
  useAuthBroadcast()
  const lastSessionInvalidationRef = useRef<number>(0)
  const latestSessionUserRef = useRef(auth.user)

  useEffect(() => {
    if (auth.user) {
      latestSessionUserRef.current = auth.user
    }
  }, [auth.user])

  // Configure the API client's auth failure callback.
  // When a 401 triggers a refresh attempt that also fails, the API client
  // invokes this callback to perform the full auth-expired cascade:
  //   1. Clear auth-related React Query cache (preserve public catalog data)
  //   2. Clear CSRF token store (in-memory)
  //   3. Clear secure storage (encrypted localStorage)
  //   4. Dispatch mihas:auth-expired event (route guards listen for this)
  //   5. Redirect to login page
  // Deduplication is handled by shouldDispatchAuthFailure() in the API client.
  useEffect(() => {
    configureApiClientAuthFailure(() => {
      void (async () => {
        await queryClient.cancelQueries({ queryKey: ['auth'] })
        await queryClient.cancelQueries({ queryKey: ['user-profile'] })
        // Clear auth state in React Query cache
        queryClient.setQueryData(['auth', 'session'], null)
        queryClient.removeQueries({ queryKey: ['user-profile'] })
        // Only clear auth-related queries — preserve public catalog data
        queryClient.removeQueries({ predicate: (query) => {
          const key = query.queryKey[0]
          return key === 'auth' || key === 'user-profile' || key === 'student-dashboard-polling' || key === 'application_drafts' || key === 'notifications'
        }})
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
        if (typeof window !== 'undefined') {
          // Don't dispatch auth-expired while payment widget is open
          if (_isPaymentInProgress()) return
          window.dispatchEvent(new CustomEvent('mihas:auth-expired', {
            detail: { from, signInPath, message: SESSION_MESSAGES.SESSION_EXPIRED },
          }))
        }
      })()
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
        // Skip session revalidation while Lenco payment widget is open
        // to prevent mobile logout caused by widget iframe/popup
        if (_isPaymentInProgress()) return
        const now = Date.now()
        if (now - lastSessionInvalidationRef.current >= VISIBILITY_DEBOUNCE_MS) {
          lastSessionInvalidationRef.current = now
          queryClient.invalidateQueries({ queryKey: ['auth', 'session'] })
        }
      }
    }

    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        const now = Date.now()
        if (now - lastSessionInvalidationRef.current >= VISIBILITY_DEBOUNCE_MS) {
          lastSessionInvalidationRef.current = now
          const cachedSession = queryClient.getQueryData<{ user?: typeof auth.user }>(['auth', 'session'])
          const pendingUser = cachedSession?.user ?? latestSessionUserRef.current
          queryClient.setQueryData(
            ['auth', 'session'],
            pendingUser ? { user: pendingUser, pendingValidation: true } : { pendingValidation: true },
          )
          queryClient.invalidateQueries({ queryKey: ['auth', 'session'] })
        }
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
