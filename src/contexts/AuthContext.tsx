import React, { createContext, useContext, useMemo, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { User, UserProfile, SignInResult, SignUpResult, PasswordResetResult } from '@/types/auth'
import {
  useSessionListener,
} from '@/hooks/auth/useSessionListener'
import { useOptimizedAuthState } from '@/hooks/auth/useOptimizedAuthState'

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
  
  // Use session listener for auth actions (signIn, signUp, etc.)
  const {
    signIn,
    signUp,
    signOut: originalSignOut,
    requestPasswordReset,
    updatePassword,
  } = useSessionListener()
  
  // Use optimized auth state for reading auth state (leverages React Query caching)
  // This avoids redundant session validations and provides non-blocking auth checks
  // Requirements: 4.5
  const { user, profile, isLoading, isAdmin } = useOptimizedAuthState()
  
  // Wrap signOut to ensure all caches are cleared immediately
  // Requirements: 13.1, 13.2, 13.3, 13.4 - Improve Logout Performance
  const signOut = useCallback(async () => {
    // Clear all cached queries immediately (non-blocking) - Requirements: 13.2
    queryClient.clear()
    
    // Clear any persisted query cache
    try {
      localStorage.removeItem('REACT_QUERY_OFFLINE_CACHE')
    } catch {
      // Silent fail
    }
    
    // Fire-and-forget the actual signOut - Requirements: 13.3
    // Don't await - let it run in background
    originalSignOut().catch(() => {
      // Silent fail - local state already cleared
      // Requirements: 13.4
    })
  }, [originalSignOut, queryClient])

  const value = useMemo(() => ({
    user,
    profile,
    loading: isLoading,
    isAdmin,
    signIn,
    signUp,
    signOut,
    requestPasswordReset,
    updatePassword
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
