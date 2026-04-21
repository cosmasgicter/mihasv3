/**
 * Auth Context — Django JWT Cookie Authentication
 *
 * Authentication relies on HTTP-only cookies (`access_token`, `refresh_token`)
 * set by the Django backend. The frontend never reads or writes these cookies
 * directly; they are transmitted automatically via same-origin requests.
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

  // Configure the API client's auth failure callback.
  // When a 401 triggers a refresh attempt that also fails, the API client
  // invokes this callback to perform the full auth-expired cascade:
  //   1. Clear auth-related React Query cache (preserve public catalog data)
  //   2. Clear CSRF token store (in-memory)
  //   3. Clear secure storage (encrypted localStorage)
  //   4. Dispatch mihas:auth-expired event (route guards listen for this)
  //   5. Redirect to login page
  useEffect(() => {
    configureApiClientAuthFailure(() => {
      void (async () => {
        await queryClient.cancelQueries({ queryKey: ['auth'] })
        await queryClient.cancelQueries({ queryKey: ['user-profile'] })
        queryClient.setQueryData(['auth', 'session'], null)
        queryClient.removeQueries({ queryKey: ['user-profile'] })
        queryClient.removeQueries({ predicate: (query) => {
          const key = query.queryKey[0]
          return key === 'auth' || key === 'user-profile' || key === 'student-dashboard-polling' || key === 'application_drafts' || key === 'notifications'
        }})
        clearCsrfToken()
        resetPrefetchState()
        secureStorage.clearSession().catch(() => {})

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
          window.dispatchEvent(new CustomEvent('mihas:auth-expired', {
            detail: { from, signInPath, message: SESSION_MESSAGES.SESSION_EXPIRED },
          }))
        }
      })()
    })
  }, [queryClient])

  // Re-validate session on tab refocus or bfcache restore.
  // Catches expired tokens after the user has been away.
  useEffect(() => {
    let hasHiddenOnce = false

    function invalidateSession() {
      const now = Date.now()
      if (now - lastSessionInvalidationRef.current >= VISIBILITY_DEBOUNCE_MS) {
        lastSessionInvalidationRef.current = now
        queryClient.invalidateQueries({ queryKey: ['auth', 'session'] })
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        hasHiddenOnce = true
      } else if (document.visibilityState === 'visible' && hasHiddenOnce) {
        invalidateSession()
      }
    }

    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        invalidateSession()
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
