import { useCallback, useEffect, useState } from 'react'
import { logger } from '@/lib/logger'
import { User } from '@supabase/supabase-js'
import {
  getPasswordResetRedirectUrl,
  getSupabaseClient,
  isSupabaseConfigured,
  SUPABASE_STATUS_EVENT,
  SUPABASE_MISSING_CONFIG_MESSAGE,
  type SupabaseStatusDetail,
  UserProfile
} from '@/lib/supabase'
import { sanitizeForLog } from '@/lib/security'
import { authPersistence } from '@/lib/authPersistence'
import { getApiBaseUrl } from '@/lib/apiConfig'
import { optimizedLogin } from '@/services/optimizedAuthService'
import { useQueryClient } from '@tanstack/react-query'

export type SignInResult = {
  session?: any
  user?: User
  profile?: UserProfile | null
  error?: string
}

export type SignUpResult = {
  user?: User | null
  session?: any
  error?: string
}

export type PasswordResetResult = {
  error?: string
}

export function useSessionListener() {
  const apiBaseUrl = getApiBaseUrl()
  const queryClient = useQueryClient()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined') {
      setLoading(false)
      return
    }

    if (!isSupabaseConfigured) {

      if (typeof window !== 'undefined') {
        const detail: SupabaseStatusDetail = {
          available: false,
          message: SUPABASE_MISSING_CONFIG_MESSAGE
        }
        window.dispatchEvent(new CustomEvent(SUPABASE_STATUS_EVENT, { detail }))
      }

      setLoading(false)
      setUser(null)
      return
    }

    const supabase = getSupabaseClient()
    let mounted = true

    async function initializeSession() {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (!mounted) return

        if (error) {
          console.error('[Auth] Session error:', error.message)
          setUser(null)
        } else if (session?.user) {
          setUser(session.user)
        } else {
          setUser(null)
        }
      } catch (error) {
        console.error('[Auth] Session initialization failed:', error)
        if (mounted) {
          setUser(null)
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    initializeSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return

      if (event === 'SIGNED_OUT') {
        setUser(null)
        setLoading(false)
        localStorage.removeItem('supabase.auth.token')
        return
      }

      if (event === 'TOKEN_REFRESHED') {
        if (session?.user) {
          setUser(session.user)
        } else {
          await supabase.auth.signOut()
          setUser(null)
        }
        return
      }

      if (session?.user) {
        setUser(session.user)
      } else if (event !== 'INITIAL_SESSION') {
        setUser(null)
      }

      if (!['INITIAL_SESSION', 'TOKEN_REFRESHED'].includes(event)) {
        setLoading(false)
      }
    })

    authPersistence.init()

    return () => {
      mounted = false
      subscription.unsubscribe()
      authPersistence.cleanup()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string): Promise<SignInResult> => {
    if (!isSupabaseConfigured) {
      return { error: SUPABASE_MISSING_CONFIG_MESSAGE }
    }

    try {
      // Clear all cached data from previous sessions before login
      // This prevents stale data from being shown after login
      // Requirements: 4.3 - Login Cache Clear
      queryClient.clear()

      // Use optimized login with parallel data fetching and dashboard preloading
      const result = await optimizedLogin(email, password, queryClient)

      if ('error' in result) {
        return { error: result.error }
      }

      // Update user state
      setUser(result.user)

      // Cache profile data in React Query for immediate availability
      if (result.profile) {
        queryClient.setQueryData(['user-profile', result.user.id], result.profile)
      }

      // Dispatch custom event to notify components of successful login
      // This allows components to refresh their data if needed
      window.dispatchEvent(new CustomEvent('userLoggedIn', { 
        detail: { userId: result.user.id } 
      }))

      return {
        session: result.session,
        user: result.user,
        profile: result.profile
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('fetch')) {
          return { error: 'Network error. Please check your connection.' }
        }
        return { error: error.message }
      }
      return { error: 'An unexpected error occurred. Please try again.' }
    }
  }, [queryClient])

  const signUp = useCallback(async (email: string, password: string, userData: any): Promise<SignUpResult> => {
    if (!isSupabaseConfigured) {
      return { error: SUPABASE_MISSING_CONFIG_MESSAGE }
    }

    try {
      // Remove fields that shouldn't be sent to backend
      const { confirmPassword, turnstileToken, ...cleanUserData } = userData
      
      const payload = { email, password, ...cleanUserData }
      logger.log('[SignUp] Sending payload:', { ...payload, password: '***' })
      
      // Create account via API
      const response = await fetch(`${apiBaseUrl}/api/auth?action=signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const result = await response.json()

      if (!response.ok) {
        console.error('[SignUp] API Error:', { status: response.status, result })
        if (result.error?.includes('already registered')) {
          return { error: 'This email is already registered. Please sign in instead.' }
        }
        return { error: result.error || result.message || result.details || 'Unable to create account' }
      }

      // Clear any stale cached data before auto sign-in
      // Requirements: 4.3 - Login Cache Clear (applies to signup auto-login too)
      queryClient.clear()

      // Auto sign in after successful signup
      const supabase = getSupabaseClient()
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (signInError) {
        console.error('[SignUp] Auto-login error:', signInError)
        return { user: result.user, error: 'Account created but auto sign-in failed. Please sign in manually.' }
      }

      if (!signInData.session || !signInData.user) {
        return { user: result.user, error: 'Account created but session not established. Please sign in manually.' }
      }

      // Set user state and return session
      setUser(signInData.user)
      
      // Dispatch custom event to notify components of successful login
      window.dispatchEvent(new CustomEvent('userLoggedIn', { 
        detail: { userId: signInData.user.id } 
      }))
      
      return { user: signInData.user, session: signInData.session }
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('fetch')) {
          return { error: 'Network error. Please check your connection.' }
        }
        return { error: error.message }
      }
      return { error: 'Unable to create account. Please try again.' }
    }
  }, [apiBaseUrl, queryClient])

  const signOut = useCallback(async () => {
    // Requirements: 13.1, 13.2, 13.3, 13.4 - Improve Logout Performance
    // Clear user state immediately (non-blocking) - Requirements: 13.2
    setUser(null)
    
    // Clear local storage immediately - Requirements: 13.2
    try {
      localStorage.removeItem('supabase.auth.token')
      localStorage.removeItem('mihas-auth-token')
      // Clear any other auth-related storage
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('sb-') || key.includes('supabase')) {
          localStorage.removeItem(key)
        }
      })
    } catch {
      // Silent fail on storage clear
    }
    
    if (!isSupabaseConfigured) {
      return
    }

    const supabase = getSupabaseClient()
    
    // Fire-and-forget pattern - Requirements: 13.3, 13.4
    // Don't await these calls - they run in background
    // Log logout event (fire-and-forget)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        fetch('/api/auth?action=session', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ action: 'logout' })
        }).catch(() => {}) // Silent fail
      }
    }).catch(() => {}) // Silent fail
    
    // Sign out from Supabase (fire-and-forget) - Requirements: 13.3
    supabase.auth.signOut().catch(() => {
      // Silent fail - local state already cleared
      // Requirements: 13.4 - If logout API call fails, still clear local state
    })
  }, [])

  const requestPasswordReset = useCallback(async (
    email: string,
    turnstileToken?: string
  ): Promise<PasswordResetResult> => {
    if (!isSupabaseConfigured) {
      return { error: SUPABASE_MISSING_CONFIG_MESSAGE }
    }

    try {
      const supabase = getSupabaseClient()
      const redirectTo = getPasswordResetRedirectUrl()
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo
      })

      if (error) {
        return { error: error.message }
      }

      return {}
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unable to send reset instructions'
      }
    }
  }, [])

  const updatePassword = useCallback(async (password: string): Promise<PasswordResetResult> => {
    if (!isSupabaseConfigured) {
      return { error: SUPABASE_MISSING_CONFIG_MESSAGE }
    }

    try {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase.auth.updateUser({ password })

      if (error) {
        return { error: error.message }
      }

      if (data.user) {
        setUser(data.user)
      }

      return {}
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unable to reset password' }
    }
  }, [])

  return {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    requestPasswordReset,
    updatePassword
  }
}
