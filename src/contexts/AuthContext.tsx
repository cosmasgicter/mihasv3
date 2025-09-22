import React, { createContext, useContext, useMemo } from 'react'
import { User } from '@supabase/supabase-js'
import { useSessionListener, type SignInResult, type SignUpResult } from '@/hooks/auth/useSessionListener'

interface AuthContextType {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<SignInResult>
  signUp: (email: string, password: string, userData: any) => Promise<SignUpResult>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { user, loading, signIn, signUp, signOut } = useSessionListener()

  const value = useMemo(() => ({
    user,
    loading,
    signIn,
    signUp,
    signOut
  }), [user, loading, signIn, signUp, signOut])

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
