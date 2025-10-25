import { useCallback, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import {
  getPasswordResetRedirectUrl,
  getSupabaseClient,
  isSupabaseConfigured,
  SUPABASE_STATUS_EVENT,
  SUPABASE_MISSING_CONFIG_MESSAGE,
  type SupabaseStatusDetail
} from '@/lib/supabase'
import { sanitizeForLog } from '@/lib/security'
import { authPersistence } from '@/lib/authPersistence'
import { getApiBaseUrl } from '@/lib/apiConfig'

export type SignInResult = {
  session?: any
  user?: User
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return


      if (event === 'SIGNED_OUT') {
        setUser(null)
        setLoading(false)
        return
      }

      if (event === 'TOKEN_REFRESHED' && session?.user) {
        setUser(session.user)
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
      const supabase = getSupabaseClient()
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          return { error: 'Invalid email or password' }
        }
        if (error.message.includes('Email not confirmed')) {
          return { error: 'Please verify your email address before signing in' }
        }
        return { error: error.message }
      }

      if (data.session && data.user) {
        setUser(data.user)
        
        // Track device session (non-blocking)
        try {
          const deviceId = localStorage.getItem('device_id') || 
            (crypto?.randomUUID ? crypto.randomUUID() : `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)
          if (deviceId) localStorage.setItem('device_id', deviceId)
          
          fetch('/api/sessions/track', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${data.session.access_token}`
            },
            body: JSON.stringify({
              device_id: deviceId,
              device_info: navigator.userAgent
            })
          }).catch(() => {})
        } catch (e) {
          // Silent fail for session tracking
        }
        
        return { session: data.session, user: data.user }
      }

      return { error: 'Unable to sign in. Please try again.' }
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('fetch')) {
          return { error: 'Network error. Please check your connection.' }
        }
        return { error: error.message }
      }
      return { error: 'An unexpected error occurred. Please try again.' }
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string, userData: any): Promise<SignUpResult> => {
    if (!isSupabaseConfigured) {
      return { error: SUPABASE_MISSING_CONFIG_MESSAGE }
    }

    try {
      // Remove fields that shouldn't be sent to backend
      const { confirmPassword, turnstileToken, ...cleanUserData } = userData
      
      const payload = { email, password, ...cleanUserData }
      console.log('[SignUp] Sending payload:', { ...payload, password: '***' })
      
      // Create account via API
      const response = await fetch(`${apiBaseUrl}/auth/signup`, {
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
  }, [apiBaseUrl])

  const signOut = useCallback(async () => {
    // Clear user state immediately to prevent stale data
    setUser(null)
    
    if (!isSupabaseConfigured) {
      return
    }

    const supabase = getSupabaseClient()
    
    // Log logout event before signing out
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        fetch('/api/auth/session', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ action: 'logout' })
        }).catch(() => {}) // Silent fail
      }
    } catch {}
    
    await supabase.auth.signOut()
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
