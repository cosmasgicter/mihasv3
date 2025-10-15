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
      console.warn('Supabase configuration missing. Authentication features are disabled.')

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
        console.log('[Auth] Initializing session...')
        const { data: { session }, error } = await supabase.auth.getSession()
        if (!mounted) return

        if (error) {
          console.error('[Auth] Session error:', error.message)
          setUser(null)
        } else if (session?.user) {
          console.log('[Auth] Session found for user:', session.user.id)
          console.log('[Auth] Token expires at:', new Date((session.expires_at || 0) * 1000).toISOString())
          setUser(session.user)
        } else {
          console.warn('[Auth] No session found')
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

      console.log('Auth session event:', sanitizeForLog(event))

      if (event === 'SIGNED_OUT') {
        console.log('[Auth] User signed out')
        setUser(null)
        setLoading(false)
        return
      }

      if (event === 'TOKEN_REFRESHED' && session?.user) {
        console.log('[Auth] Token refreshed successfully')
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
        return { error: error.message }
      }

      if (data.session && data.user) {
        setUser(data.user)
        console.log('[Auth] Sign in successful')
        console.log('[Auth] User ID:', data.user.id)
        console.log('[Auth] Token expires at:', new Date((data.session.expires_at || 0) * 1000).toISOString())
        console.log('[Auth] Access token present:', !!data.session.access_token)
        return { session: data.session, user: data.user }
      }

      return { error: 'Login failed' }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Login failed' }
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string, userData: any): Promise<SignUpResult> => {
    if (!isSupabaseConfigured) {
      return { error: SUPABASE_MISSING_CONFIG_MESSAGE }
    }

    try {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: userData.full_name,
            phone: userData.phone,
            date_of_birth: userData.date_of_birth,
            sex: userData.sex,
            nationality: userData.nationality,
            address: userData.address,
            city: userData.city,
            next_of_kin_name: userData.next_of_kin_name,
            next_of_kin_phone: userData.next_of_kin_phone
          }
        }
      })

      if (error) {
        return { error: error.message }
      }

      return { user: data.user, session: data.session }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Registration failed' }
    }
  }, [])

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setUser(null)
      return
    }

    const supabase = getSupabaseClient()
    await supabase.auth.signOut()
    setUser(null)
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
