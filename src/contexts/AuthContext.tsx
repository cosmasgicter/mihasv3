import React, { createContext, useContext, useMemo, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { User, UserProfile, SignInResult, SignUpResult, PasswordResetResult } from '@/types/auth'
import { useSessionListener } from '@/hooks/auth/useSessionListener'
import { configureApiClientAuthFailure } from '@/services/client'
import { clearCsrfToken } from '@/lib/csrfToken'
import { secureStorage } from '@/lib/secureStorage'

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  loading: boolean
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

  useEffect(() => {
    configureApiClientAuthFailure(() => {
      // Clear auth state in React Query cache
      queryClient.setQueryData(['auth', 'session'], null)
      // Clear all caches
      queryClient.clear()
      // Clear CSRF token
      clearCsrfToken()
      // Clear secure storage (best-effort, fire-and-forget)
      secureStorage.clearSession().catch(() => {})
      // Redirect to sign-in
      const from = typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search}`
        : ''
      const signInPath = from && from !== '/'
        ? `/auth/signin?redirect=${encodeURIComponent(from)}`
        : '/auth/signin'
      window.location.assign(signInPath)
    })
  }, [queryClient])

  const value = useMemo(() => ({
    user: auth.user,
    profile: auth.profile,
    loading: auth.loading,
    isAdmin: auth.isAdmin,
    signIn: auth.signIn,
    signUp: auth.signUp,
    signOut: auth.signOut,
    requestPasswordReset: auth.requestPasswordReset,
    updatePassword: auth.updatePassword,
  }), [auth])

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
