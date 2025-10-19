import React, { createContext, useContext, useMemo } from 'react'
import { User } from '@supabase/supabase-js'
import { useQuery } from '@tanstack/react-query'
import { getSupabaseClient } from '@/lib/supabase'
import {
  useSessionListener,
  type SignInResult,
  type SignUpResult,
  type PasswordResetResult,
} from '@/hooks/auth/useSessionListener'

interface AuthContextType {
  user: User | null
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
  const {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    requestPasswordReset,
    updatePassword,
  } = useSessionListener()

  // Get role from user metadata (set by backend)
  const profileRole = user?.user_metadata?.role || user?.app_metadata?.role || null

  const isAdmin = useMemo(() => {
    // Hardcoded super admin
    if (user?.email === 'cosmas@beanola.com') return true
    // Check profile role
    return profileRole === 'admin' || profileRole === 'super_admin'
  }, [user?.email, profileRole])

  const value = useMemo(() => ({
    user,
    loading,
    isAdmin,
    signIn,
    signUp,
    signOut,
    requestPasswordReset,
    updatePassword
  }), [user, loading, isAdmin, signIn, signUp, signOut, requestPasswordReset, updatePassword])

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
