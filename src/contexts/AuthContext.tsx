import React, { createContext, useContext, useMemo, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { User, UserProfile, SignInResult, SignUpResult, PasswordResetResult } from '@/types/auth'
import { useSessionListener } from '@/hooks/auth/useSessionListener'
import { useOptimizedAuthState } from '@/hooks/auth/useOptimizedAuthState'
import { configureAuthController } from '@/services/authController'

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  isAdmin: boolean
  signIn: (email: string, password: string) => Promise<SignInResult>
  signUp: (email: string, password: string, userData: any) => Promise<SignUpResult>
  signOut: () => Promise<void>
  requestPasswordReset: (email: string, turnstileToken?: string) => Promise<PasswordResetResult>
  updatePassword: (password: string) => Promise<PasswordResetResult>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()

  const {
    signIn,
    signUp,
    signOut,
    requestPasswordReset,
    updatePassword,
  } = useSessionListener()

  const { user, profile, isLoading, isAdmin } = useOptimizedAuthState()

  useEffect(() => {
    configureAuthController({
      clearAuthState: () => {
        queryClient.setQueryData(['auth', 'session'], null)
      },
      clearCaches: () => queryClient.clear(),
      redirectToSignIn: (path) => {
        window.location.assign(path)
      },
    })
  }, [queryClient])

  const value = useMemo(() => ({
    user,
    profile,
    loading: isLoading,
    isAdmin,
    signIn,
    signUp,
    signOut,
    requestPasswordReset,
    updatePassword,
  }), [user, profile, isLoading, isAdmin, signIn, signUp, signOut, requestPasswordReset, updatePassword])

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
