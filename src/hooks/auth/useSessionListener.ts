import { useCallback, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { getSupabaseClient } from '@/lib/supabase'
import { sanitizeForLog } from '@/lib/security'
import { authPersistence } from '@/lib/authPersistence'
import { secureDisplay } from '@/lib/secureDisplay'
import { sanitizeForDisplay } from '@/lib/sanitize'

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

export function useSessionListener() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined') {
      setLoading(false)
      return
    }

    const supabase = getSupabaseClient()
    let mounted = true

    async function initializeSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!mounted) return

        if (session?.user) {
          setUser(session.user)
        } else {
          setUser(null)
        }
      } catch (error) {
        console.error('Session initialization failed:', error)
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
        setUser(null)
        setLoading(false)
        return
      }

      if (session?.user) {
        setUser(session.user)
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
    try {
      const response = await fetch('http://localhost:8888/.netlify/functions/auth-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      })

      const result = await response.json()

      if (!response.ok) {
        return { error: result.error || 'Login failed' }
      }

      if (result.session && result.user) {
        const supabase = getSupabaseClient()
        await supabase.auth.setSession(result.session)
        setUser(result.user)
        return { session: result.session, user: result.user }
      }

      return { error: 'Login failed' }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Login failed' }
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string, userData: any): Promise<SignUpResult> => {
    try {
      const response = await fetch('http://localhost:8888/.netlify/functions/auth-register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          password,
          fullName: userData.full_name
        })
      })

      const result = await response.json()

      if (!response.ok) {
        return { error: result.error || 'Registration failed' }
      }

      return { user: result.user, session: result.session }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Registration failed' }
    }
  }, [])

  const signOut = useCallback(async () => {
    const supabase = getSupabaseClient()
    await supabase.auth.signOut()
    setUser(null)
  }, [])

  return {
    user,
    loading,
    signIn,
    signUp,
    signOut
  }
}
