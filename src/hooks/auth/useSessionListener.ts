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

/**
 * CRITICAL FIX: Simplified auth flow
 * 
 * Auth flow is now:
 * Sign In → POST /api/auth?action=login → HTTP-only cookie set → GET /api/auth-roles → APP BOOTS
 * 
 * DISABLED:
 * - Supabase onAuthStateChange listener (was causing infinite loops)
 * - Supabase getSession on mount (was racing with API auth)
 * - Token refresh monitoring (handled by API now)
 */
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

    // CRITICAL FIX: Don't use Supabase auth state management
    // Instead, check auth via API endpoint
    let mounted = true

    async function checkAuthViaApi() {
      try {
        // Check if we have a stored session token
        const storedToken = localStorage.getItem('mihas-auth-token')
        if (!storedToken) {
          if (mounted) {
            setUser(null)
            setLoading(false)
          }
          return
        }

        // Verify auth via API (single source of truth)
        const response = await fetch(`${apiBaseUrl}/api/auth-roles`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${storedToken}`,
            'Content-Type': 'application/json'
          }
        })

        if (!mounted) return

        if (response.ok) {
          const data = await response.json()
          if (data.success && data.data?.user_id) {
            // Create minimal user object from API response
            setUser({
              id: data.data.user_id,
              email: data.data.email,
              role: data.data.role,
              user_metadata: { role: data.data.role },
              app_metadata: { role: data.data.role }
            } as User)
          } else {
            setUser(null)
            localStorage.removeItem('mihas-auth-token')
          }
        } else {
          // Auth failed - clear token and set user to null
          console.warn('[Auth] API auth check failed:', response.status)
          setUser(null)
          localStorage.removeItem('mihas-auth-token')
        }
      } catch (error) {
        console.error('[Auth] API auth check error:', error)
        if (mounted) {
          setUser(null)
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    checkAuthViaApi()

    return () => {
      mounted = false
    }
  }, [apiBaseUrl])

  const signIn = useCallback(async (email: string, password: string): Promise<SignInResult> => {
    try {
      // Clear all cached data from previous sessions before login
      queryClient.clear()

      // CRITICAL FIX: Use API-first auth flow
      // POST /api/auth?action=login → Store token → GET /api/auth-roles → APP BOOTS
      const response = await fetch(`${apiBaseUrl}/api/auth?action=login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        return { error: result.error || 'Login failed' }
      }

      // Store the access token for subsequent API calls
      const accessToken = result.data?.session?.access_token
      if (accessToken) {
        localStorage.setItem('mihas-auth-token', accessToken)
      }

      // Create user object from API response
      const userData = result.data?.user
      if (userData) {
        const user: User = {
          id: userData.id,
          email: userData.email,
          role: userData.role || result.data?.profile?.role || 'student',
          user_metadata: userData.user_metadata || {},
          app_metadata: userData.app_metadata || {}
        } as User

        setUser(user)

        // Cache profile data in React Query for immediate availability
        if (result.data?.profile) {
          queryClient.setQueryData(['user-profile', user.id], result.data.profile)
        }

        // Dispatch custom event to notify components of successful login
        window.dispatchEvent(new CustomEvent('userLoggedIn', { 
          detail: { userId: user.id } 
        }))

        return {
          session: result.data?.session,
          user: user,
          profile: result.data?.profile
        }
      }

      return { error: 'Login succeeded but no user data returned' }
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('fetch')) {
          return { error: 'Network error. Please check your connection.' }
        }
        return { error: error.message }
      }
      return { error: 'An unexpected error occurred. Please try again.' }
    }
  }, [apiBaseUrl, queryClient])

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
    // CRITICAL FIX: Clear local state immediately (non-blocking)
    setUser(null)
    
    // Clear all auth tokens from local storage
    try {
      localStorage.removeItem('mihas-auth-token')
      localStorage.removeItem('supabase.auth.token')
      // Clear any other auth-related storage
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('sb-') || key.includes('supabase')) {
          localStorage.removeItem(key)
        }
      })
    } catch {
      // Silent fail on storage clear
    }
    
    // Clear React Query cache
    queryClient.clear()
    
    // Fire-and-forget: notify API of logout (don't await)
    const token = localStorage.getItem('mihas-auth-token')
    if (token) {
      fetch(`${apiBaseUrl}/api/auth?action=logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }).catch(() => {}) // Silent fail
    }
  }, [apiBaseUrl, queryClient])

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
